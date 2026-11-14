// 에코월드 2.5D 렌더러 — 바닥 외곽 폴리곤을 밀어 올려 건물을 세운다.
// ---------------------------------------------------------------------------
// 설계 규칙
//  1) 좌표의 단일 출처는 data/park.js 다. 이 파일은 폴리곤 id 로만 가리키고,
//     건물 좌표를 따로 들고 있지 않는다. data/volumes.js 는 높이·재질만 적는다.
//  2) 벽 밑단은 바닥 외곽 폴리곤 '그 점'을 쓴다. 꼭짓점을 메르카토르로 바꾼 뒤
//     같은 배율로 되돌리므로 밑단과 외곽선의 어긋남은 계산상 0 이다.
//     baseRingError() 는 이 기준 외곽의 복원 오차다. offset 0.9 m 인 실제 기단
//     메시의 밑단 오차는 별도로 잰다(qa/renderer-check.mjs).
//  3) 음영은 지도 엔진의 광원을 쓰지 않고 data/volumes.js 의 한 광원
//     (azimuth 315°, elevation 42°) 으로 직접 계산해 정점 색에 굽는다.
//     모든 면이 같은 값을 쓰므로 건물·지면·나무의 빛 방향이 어긋나지 않는다.
//  4) 기하 계산은 브라우저 기능을 쓰지 않는다. Node 에서 같은 함수로 검증한다.
// ---------------------------------------------------------------------------

const EARTH_R = 6378137;                 // WGS84 장반경 (웹 메르카토르 기준)
const EARTH_C = 2 * Math.PI * EARTH_R;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// 웹 메르카토르 — maplibregl.MercatorCoordinate 와 같은 정의다.
const mercX = lng => (180 + lng) / 360;
const mercY = lat => (180 - R2D * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2))) / 360;
const unmercX = x => x * 360 - 180;
const unmercY = y => R2D * (2 * Math.atan(Math.exp((180 - y * 360) * D2R)) - Math.PI / 2);
// 그 위도에서 1 m 에 해당하는 메르카토르 단위. 장면 전체가 100 m 안쪽이라 한 값으로 쓴다.
const mercScale = lat => 1 / (EARTH_C * Math.cos(lat * D2R));

// 지표 거리(m) — 밑단 오차를 미터로 보고할 때 쓴다.
function haversine(a, b) {
  const dLat = (b[1] - a[1]) * D2R, dLng = (b[0] - a[0]) * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------- 색·음영
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
// 광원 하나로 계산하는 음영. 지도 전체가 이 함수 하나를 공유한다.
//  · ambient 는 '하늘빛'으로 본다. 위를 보는 면이 가장 많이 받고 아래를 보는 면이 가장 적게 받는다.
//    (그냥 상수로 쓰면 해 높이가 42° 라서 벽이 지붕보다 밝아진다. 흰 원판 지붕이
//     가장 밝게 읽혀야 그림 지도로 보인다.)
//  · sun 은 azimuth/elevation 방향의 직사광이다.
//  · 마지막에 floor~1.0 범위로 눌러 가장 어두운 면도 까맣게 타지 않게 한다.
function makeShader(light) {
  const az = light.azimuthDeg * D2R, el = light.elevationDeg * D2R;
  const L = [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)]; // 빛이 오는 쪽
  const amb = light.ambient, sun = light.sun;
  const lo = light.floor ?? 0.62;
  // 모든 방향 가운데 가장 밝아질 수 있는 값으로 나눠 0~1 로 맞춘다.
  const peak = amb * 0.5 + Math.hypot(sun * L[0], sun * L[1], sun * L[2] + amb * 0.5);
  return n => {
    const sky = 0.5 + 0.5 * n[2];
    const d = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    const raw = (amb * sky + sun * Math.max(0, d)) / peak;
    return lo + (1 - lo) * Math.min(1, raw);
  };
}

// ---------------------------------------------------------------- 평면 기하
function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function areaCentroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  }
  a *= 0.5;
  return Math.abs(a) < 1e-9 ? [0, 0] : [cx / (6 * a), cy / (6 * a)];
}
// 꼭짓점을 바깥으로 d(m) 밀어낸 폴리곤. 이웃한 두 변의 법선을 합쳐(마이터)
// 밀어내므로 모서리에서도 변과 변 사이 간격이 d 로 유지된다.
function offsetPoly(poly, d) {
  if (!d) return poly.map(p => [p[0], p[1]]);
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n], cur = poly[i], next = poly[(i + 1) % n];
    const n1 = edgeNormal(prev, cur), n2 = edgeNormal(cur, next);
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const len = Math.hypot(mx, my) || 1;
    mx /= len; my /= len;
    const cos = Math.max(0.35, mx * n1[0] + my * n1[1]);   // 아주 뾰족한 모서리는 제한한다
    out.push([cur[0] + mx * d / cos, cur[1] + my * d / cos]);
  }
  return out;
}
// 반시계(CCW) 폴리곤의 변 a→b 에 대한 바깥쪽 단위 법선
function edgeNormal(a, b) {
  const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
  return [ey / len, -ex / len];
}
// 원점에서 dir 방향으로 쏜 광선이 외곽선과 만나는 거리(m).
// 폴리곤은 원점(=바닥 중심)을 기준으로 한 좌표여야 한다.
function rayRadius(poly, dir) {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = ex * dir[1] - ey * dir[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = (a[1] * dir[0] - a[0] * dir[1]) / den;
    if (t < -1e-6 || t > 1 + 1e-6) continue;
    const u = (a[0] + ex * t) * dir[0] + (a[1] + ey * t) * dir[1];
    if (u > best) best = u;
  }
  return best;
}
const dirOf = deg => [Math.sin(deg * D2R), Math.cos(deg * D2R)];   // 방위각 → [동, 북]
const tangentOf = deg => [Math.cos(deg * D2R), -Math.sin(deg * D2R)];
function regularPoly(cx, cy, r, sides, rot = 0) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);   // CCW
  }
  return out;
}
function rectPoly(center, axis, halfWidth, back, front) {
  // axis 방향으로 back~front(m), 그 수직으로 ±halfWidth 인 사각형 (CCW)
  const t = [axis[1], -axis[0]];
  const p = (u, v) => [center[0] + axis[0] * u + t[0] * v, center[1] + axis[1] * u + t[1] * v];
  return [p(back, -halfWidth), p(front, -halfWidth), p(front, halfWidth), p(back, halfWidth)];
}

// ---------------------------------------------------------------- 메시 쌓기
function newMesh() { return { pos: [], col: [], line: [], parts: [] }; }

// 부위(띠·기둥·현관·글자…)가 메시의 어느 구간인지 적어 둔다.
// 검증에서 "차양 정점만" 집어낼 수 있어야 하고, QA 에서 부위별로 켜 보는 데도 쓴다.
function mark(m, name, fn) {
  const start = m.pos.length / 3;
  fn();
  const count = m.pos.length / 3 - start;
  if (count) m.parts.push({ name, start, count });
}
// 부위 이름으로 정점을 되읽는다. [[x,y,z], ...]
export function partVertices(mesh, name) {
  const out = [];
  for (const p of mesh.parts) {
    if (p.name !== name && !p.name.startsWith(name + ':')) continue;
    for (let i = p.start; i < p.start + p.count; i++) out.push([mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]]);
  }
  return out;
}

// 삼각형 하나. 면 법선을 정점 순서(오른손 법칙)로 구하므로 법선을 따로 넘기지 않는다.
function pushTri(m, a, b, c, rgb, shade) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return;                       // 넓이 0 인 삼각형은 버린다
  nx /= len; ny /= len; nz /= len;
  const k = shade([nx, ny, nz]);
  const r = rgb[0] * k, g = rgb[1] * k, bl = rgb[2] * k;
  for (const p of [a, b, c]) { m.pos.push(p[0], p[1], p[2]); m.col.push(r, g, bl); }
}
const pushQuad = (m, a, b, c, d, rgb, shade) => { pushTri(m, a, b, c, rgb, shade); pushTri(m, a, c, d, rgb, shade); };
// 띠 테두리 선. 면과 정확히 같은 자리에 그으면 깊이가 같아 점선처럼 끊긴다.
// 바깥으로 6cm, 띠 안쪽으로 1cm 물려 그어 늘 면보다 앞에 오게 한다. (지도 축척에서 안 보이는 양)
function pushLoop(m, poly, z, lift = 0) {
  const o = offsetPoly(poly, 0.06);
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    m.line.push(a[0], a[1], z + lift, b[0], b[1], z + lift);
  }
}
// 면 법선은 정점 순서로 구한다. 그래서 들어오는 폴리곤은 반드시 반시계여야 한다.
// 부르는 쪽이 매번 신경 쓰면 한 군데만 틀려도 그 면만 뒤집혀 어둡게 나온다. 여기서 맞춘다.
const ensureCCW = poly => signedArea(poly) < 0 ? poly.slice().reverse() : poly;

// 2D 폴리곤을 z0~z1 로 밀어 올린 기둥. side/top/bottom 은 색(없으면 생략).
function addPrism(m, poly0, z0, z1, side, top, bottom, shade) {
  const poly = ensureCCW(poly0), n = poly.length;
  if (side) {
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      pushQuad(m, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], side, shade);
    }
  }
  if (top) addCap(m, poly, z1, top, shade, true);
  if (bottom) addCap(m, poly, z0, bottom, shade, false);
}
// 폴리곤 뚜껑. 바닥 외곽은 볼록한 드럼이라 중심 부채꼴로 나눠도 안전하다.
function addCap(m, poly0, z, rgb, shade, up) {
  const poly = ensureCCW(poly0), c = areaCentroid(poly), n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    if (up) pushTri(m, [c[0], c[1], z], [a[0], a[1], z], [b[0], b[1], z], rgb, shade);
    else pushTri(m, [c[0], c[1], z], [b[0], b[1], z], [a[0], a[1], z], rgb, shade);
  }
}
function addFlat(m, poly, z, rgb, shade) { addCap(m, poly, z, rgb, shade, true); }
// 원뿔·원뿔대 (나무·기둥용)
function addCone(m, cx, cy, r0, r1, z0, z1, sides, rgb, shade) {
  const a = regularPoly(cx, cy, r0, sides), b = regularPoly(cx, cy, Math.max(r1, 0), sides);
  for (let i = 0; i < sides; i++) {
    const p0 = a[i], p1 = a[(i + 1) % sides], q0 = b[i], q1 = b[(i + 1) % sides];
    if (r1 <= 1e-6) pushTri(m, [p0[0], p0[1], z0], [p1[0], p1[1], z0], [cx, cy, z1], rgb, shade);
    else pushQuad(m, [p0[0], p0[1], z0], [p1[0], p1[1], z0], [q1[0], q1[1], z1], [q0[0], q0[1], z1], rgb, shade);
  }
}

// ---------------------------------------------------------------- 건물 한 채
function buildBuilding(cfg, ring, palette, shade, opts) {
  // 1) 바닥 외곽을 바닥 중심 기준 ENU(미터) 로 옮긴다. 되돌리는 배율이 같아 오차가 없다.
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const s0 = mercScale(lat0);
  const o0 = [mercX(ring[0][0]), mercY(ring[0][1])];
  const rough = ring.map(p => [(mercX(p[0]) - o0[0]) / s0, -(mercY(p[1]) - o0[1]) / s0]);
  const cen = areaCentroid(rough);
  const center = [unmercX(o0[0] + cen[0] * s0), unmercY(o0[1] - cen[1] * s0)];
  const scale = mercScale(center[1]);
  const origin = [mercX(center[0]), mercY(center[1])];
  let base = ring.map(p => [(mercX(p[0]) - origin[0]) / scale, -(mercY(p[1]) - origin[1]) / scale]);
  if (signedArea(base) < 0) base = base.reverse();      // 모든 면의 법선이 바깥을 보도록 CCW 로 맞춘다

  const m = newMesh();
  const col = key => hexToRgb(palette[key] || '#ffffff');
  const radius = deg => rayRadius(base, dirOf(deg));

  // 2) 띠(벽·유리·지붕) — 아래에서 위로 쌓는다
  for (const band of cfg.bands || []) mark(m, `band:${band.id}`, () => {
    const poly = offsetPoly(base, band.offset || 0);
    if (band.texture === 'stonePanel') addChecker(m, poly, band, palette, shade, opts);
    else addPrism(m, poly, band.from, band.to, col(band.material), null, null, shade);
    if (band.capTop) addCap(m, poly, band.to, col(band.capTop), shade, true);
    if (band.capBottom) addCap(m, poly, band.from, col(band.capBottom), shade, false);
    if (opts.outline) { pushLoop(m, poly, band.from, 0.01); pushLoop(m, poly, band.to, -0.01); }
  });

  // 3) 지붕을 받치는 짧은 기둥 띠
  const cl = cfg.colonnade;
  if (cl) mark(m, 'colonnade', () => {
    for (let i = 0; i < cl.count; i++) {
      const deg = (360 * i) / cl.count;
      const d = dirOf(deg), r = radius(deg) + (cl.offset || 0);
      addPrism(m, regularPoly(d[0] * r, d[1] * r, cl.radius, 6), cl.from, cl.to, col(cl.material), null, null, shade);
    }
  });

  // 4) 현관 — 입구 방위(205°) 쪽에 차양·원기둥·유리문
  const en = cfg.entrance;
  if (en) {
    const deg = cfg.entranceBearing, d = dirOf(deg), t = tangentOf(deg);
    const r0 = radius(deg);
    const half = en.width / 2;
    const outer = r0 + en.depth;
    // 차양: 벽 안쪽으로 1 m 물려 넣어 벽과 틈이 생기지 않게 한다
    mark(m, 'entrance:canopy', () => {
      const canopy = rectPoly([0, 0], d, half, r0 - 1.0, outer);
      addPrism(m, canopy, en.canopyFrom, en.canopyTo, col('canopy'), col('canopy'), col('roofUnder'), shade);
      if (opts.outline) { pushLoop(m, canopy, en.canopyFrom, 0.01); pushLoop(m, canopy, en.canopyTo, -0.01); }
    });
    // 원기둥: 차양 바깥쪽 한 줄에 고르게 세운다
    mark(m, 'entrance:columns', () => {
      const cr = en.columnRadius, span = half - cr - 0.2, step = en.columns > 1 ? (span * 2) / (en.columns - 1) : 0;
      for (let i = 0; i < en.columns; i++) {
        const v = -span + step * i, u = outer - cr - 0.2;
        addPrism(m, regularPoly(d[0] * u + t[0] * v, d[1] * u + t[1] * v, cr, 8), 0, en.canopyFrom, col('column'), null, null, shade);
      }
    });
    // 유리문: 기단(가장 많이 튀어나온 띠) 바깥에 세워 벽에 묻히지 않게 한다
    mark(m, 'entrance:glass', () => {
      const pad = Math.max(0, ...(cfg.bands || []).filter(b => b.from < en.glassTo).map(b => b.offset || 0));
      addPrism(m, rectPoly([0, 0], d, half * 0.62, r0 + pad + 0.05, r0 + pad + 0.35),
        en.glassFrom, en.glassTo, col('entryGlass'), col('entryGlass'), null, shade);
    });
  }

  // 5) 벽면 글자 — 벽이 둥글어 글자마다 따로 세운다 (텍스처는 그릴 때 만든다)
  let sign = null;
  if (cfg.sign?.text) {
    const chars = [...cfg.sign.text], size = cfg.sign.size, h = cfg.sign.height;
    const r = radius(cfg.entranceBearing);
    const step = (size * 1.04 / r) * R2D;                       // 한 글자가 차지하는 각도
    // 바깥에서 벽을 마주 보면 방위각이 커지는 쪽이 화면 '왼쪽'이다.
    // 그래서 글자는 방위각이 작아지는 쪽으로 나아가야 왼쪽에서 오른쪽으로 읽힌다.
    const degs = chars.map((_, i) => cfg.entranceBearing - (i - (chars.length - 1) / 2) * step);
    // 벽은 19각형이라 방위에 따라 반지름이 19.8~20.1m 로 달라진다. 글자를 각자의
    // 반지름에 맞춰 놓으면 꼭짓점 쪽 글자가 벽 속에 묻혀 반쪽만 보인다.
    // 글자 띠 전체를 가장 먼 벽면보다 더 바깥에 한 줄로 세운다.
    const span = degs.flatMap(g => [g - step / 2, g, g + step / 2]);
    const rr = Math.max(...span.map(radius)) + 0.12;
    const quads = [];
    degs.forEach(deg => {
      const d = dirOf(deg), t = tangentOf(deg);
      const cx = d[0] * rr, cy = d[1] * rr, hw = size / 2;
      // 한 글자 안에서도 왼쪽 모서리가 +t(방위각이 커지는) 쪽이다. 반대로 두면 글자가 뒤집힌다.
      const L = [cx + t[0] * hw, cy + t[1] * hw], R = [cx - t[0] * hw, cy - t[1] * hw];
      quads.push([
        L[0], L[1], h + hw, R[0], R[1], h + hw, R[0], R[1], h - hw, L[0], L[1], h - hw
      ]);
    });
    sign = { text: cfg.sign.text, quads, color: palette.sign || '#000000' };
  }

  return {
    id: cfg.id, facility: cfg.facility, name: cfg.name, footprint: cfg.footprint,
    center, origin, scale, base, mesh: m, sign, radius,
    heightSource: cfg.heightSource || null,
    top: Math.max(...(cfg.bands || [{ to: 0 }]).map(b => b.to))
  };
}

// 석재 벽: 매끈한 판과 거친 판을 바둑판으로 번갈아 칠한다. (텍스처 파일 없이 색만 쓴다)
function addChecker(m, poly, band, palette, shade, opts) {
  const a = hexToRgb(palette[band.material]), b = hexToRgb(palette.wallPanel || palette[band.material]);
  const rows = 4, cols = 2, n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols, u1 = (c + 1) / cols;
      const x0 = p[0] + (q[0] - p[0]) * u0, y0 = p[1] + (q[1] - p[1]) * u0;
      const x1 = p[0] + (q[0] - p[0]) * u1, y1 = p[1] + (q[1] - p[1]) * u1;
      for (let r = 0; r < rows; r++) {
        const z0 = band.from + (band.to - band.from) * (r / rows);
        const z1 = band.from + (band.to - band.from) * ((r + 1) / rows);
        const rgb = (i * cols + c + r) % 2 ? b : a;
        pushQuad(m, [x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1], rgb, shade);
      }
    }
  }
  if (opts.outline) { /* 가로 테두리는 띠 단위로만 긋는다 */ }
}

// ---------------------------------------------------------------- 건물 주변 땅
function buildGround(g, b, palette, shade, opts) {
  const m = newMesh();
  const col = key => hexToRgb(palette[key] || '#ffffff');
  const on = Object.assign({ lawn: false, apron: true, walk: true, trees: false }, g.render || {});
  if (on.lawn && g.lawn) mark(m, 'ground:lawn', () => {
    addFlat(m, offsetPoly(b.base, g.lawn.offset), 0.02, col('lawn'), shade);
    const outer = offsetPoly(b.base, g.lawn.offset), inner = offsetPoly(b.base, g.lawn.offset - 1.5);
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      pushQuad(m, [inner[i][0], inner[i][1], 0.03], [inner[j][0], inner[j][1], 0.03],
        [outer[j][0], outer[j][1], 0.03], [outer[i][0], outer[i][1], 0.03], col('lawnEdge'), shade);
    }
  });
  let apronEnd = 0;
  if (on.apron && g.apron) mark(m, 'ground:apron', () => {
    const d = dirOf(g.apron.bearing), r0 = b.radius(g.apron.bearing);
    apronEnd = r0 + g.apron.depth;
    addFlat(m, rectPoly([0, 0], d, g.apron.width / 2, r0 - 1, apronEnd), 0.05, col('paving'), shade);
  });
  if (on.walk && g.walk) mark(m, 'ground:walk', () => {
    const d = dirOf(g.walk.bearing), start = apronEnd || b.radius(g.walk.bearing);
    addFlat(m, rectPoly([0, 0], d, g.walk.width / 2, start - 0.5, start + g.walk.length), 0.06, col('paving'), shade);
    addFlat(m, rectPoly([0, 0], d, 0.25, start, start + g.walk.length - 1), 0.07, col('pathWarm'), shade);
  });
  if (on.trees) mark(m, 'ground:trees', () => {
    for (const t of g.trees || []) {
      const d = dirOf(t.bearing), x = d[0] * t.dist, y = d[1] * t.dist, s = t.scale || 1;
      if (t.type === 'pine') {
        addCone(m, x, y, 0.22 * s, 0.18 * s, 0, 1.6 * s, 6, col('trunk'), shade);
        addCone(m, x, y, 2.1 * s, 1.1 * s, 1.5 * s, 3.6 * s, 8, col('pine'), shade);
        addCone(m, x, y, 1.5 * s, 0, 3.4 * s, 6.0 * s, 8, col('pineDark'), shade);
      } else if (t.type === 'bloom') {
        addCone(m, x, y, 0.2 * s, 0.16 * s, 0, 1.5 * s, 6, col('trunk'), shade);
        addCone(m, x, y, 1.0 * s, 1.7 * s, 1.4 * s, 2.6 * s, 8, col('bloom'), shade);
        addCone(m, x, y, 1.7 * s, 0, 2.6 * s, 4.3 * s, 8, col('bloom'), shade);
      } else {
        addCone(m, x, y, 1.1 * s, 0.75 * s, 0, 0.8 * s, 7, col('shrub'), shade);
        addCone(m, x, y, 0.75 * s, 0, 0.8 * s, 1.5 * s, 7, col('shrub'), shade);
      }
    }
  });
  return m;
}

// 메시를 이어 붙인다. 부위 구간도 옮겨 온 위치만큼 밀어 준다.
// (push(...arr) 는 배열이 커지면 호출 인수 한도에 걸리므로 쓰지 않는다)
function mergeMesh(dst, src) {
  const base = dst.pos.length / 3;
  for (const v of src.pos) dst.pos.push(v);
  for (const v of src.col) dst.col.push(v);
  for (const v of src.line) dst.line.push(v);
  for (const p of src.parts) dst.parts.push({ name: p.name, start: p.start + base, count: p.count });
}

// ---------------------------------------------------------------- 장면 만들기 (순수 계산)
export function buildScene(volumes, park) {
  if (!volumes?.buildings?.length) throw new Error('volumes 정의가 비어 있습니다.');
  const features = (park?.features || []);
  const findRing = id => {
    const f = features.find(x => x.properties?.id === id || x.id === id);
    if (!f) throw new Error(`바닥 외곽 폴리곤을 찾지 못했습니다: ${id}`);
    if (f.geometry?.type !== 'Polygon') throw new Error(`바닥 외곽이 Polygon 이 아닙니다: ${id}`);
    const ring = f.geometry.coordinates[0].slice();
    const a = ring[0], z = ring[ring.length - 1];
    if (a[0] === z[0] && a[1] === z[1]) ring.pop();            // 닫는 점은 한 번만 쓴다
    if (ring.length < 3) throw new Error(`바닥 외곽 점이 모자랍니다: ${id}`);
    return ring;
  };
  const shade = makeShader(volumes.light);
  const opts = { outline: volumes.outline !== false };
  const built = [], failed = [];
  for (const cfg of volumes.buildings) {
    try {
      const b = buildBuilding(cfg, findRing(cfg.footprint), volumes.palette, shade, opts);
      const g = (volumes.ground || []).find(x => x.building === cfg.id);
      if (g) mergeMesh(b.mesh, buildGround(g, b, volumes.palette, shade, opts));
      if (!b.mesh.pos.length || b.mesh.pos.length % 9 || b.mesh.pos.length !== b.mesh.col.length ||
          ![...b.mesh.pos, ...b.mesh.col, ...b.mesh.line].every(Number.isFinite)) {
        throw new Error('건물 메시의 좌표·색 또는 삼각형 구성이 유효하지 않습니다.');
      }
      built.push(b);
    } catch (err) {
      failed.push({ id: cfg.id, facility: cfg.facility, error: String(err?.message || err) });
    }
  }
  return { built, failed };
}

// offset 적용 전 기준 외곽의 투영 왕복 오차. 실제 기단 밑단의 오차와 구분한다.
export function baseRingError(scene, park) {
  const out = [];
  for (const b of scene.built) {
    const f = park.features.find(x => x.properties?.id === b.footprint || x.id === b.footprint);
    const ring = f.geometry.coordinates[0];
    let max = 0;
    for (const p of b.base) {
      const lngLat = [unmercX(b.origin[0] + p[0] * b.scale), unmercY(b.origin[1] - p[1] * b.scale)];
      let near = Infinity;
      for (const q of ring) near = Math.min(near, haversine(lngLat, q));
      max = Math.max(max, near);
    }
    out.push({ id: b.id, footprint: b.footprint, maxErrorM: max, points: b.base.length });
  }
  return out;
}

// ---------------------------------------------------------------- WebGL 레이어
const VERT = `
precision highp float;
uniform mat4 u_matrix;
attribute vec3 a_pos;
attribute vec3 a_color;
varying vec3 v_color;
void main() { v_color = a_color; gl_Position = u_matrix * vec4(a_pos, 1.0); }`;
const FRAG = `
precision mediump float;
varying vec3 v_color;
void main() { gl_FragColor = vec4(v_color, 1.0); }`;
const TEX_VERT = `
precision highp float;
uniform mat4 u_matrix;
attribute vec3 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() { v_uv = a_uv; gl_Position = u_matrix * vec4(a_pos, 1.0); }`;
const TEX_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() { vec4 c = texture2D(u_tex, v_uv); if (c.a < 0.04) discard; gl_FragColor = c; }`;

function compile(gl, vs, fs) {
  const shaders = [];
  const p = gl.createProgram();
  if (!p) throw new Error('셰이더 프로그램을 만들지 못했습니다.');
  const make = (type, src) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('셰이더를 만들지 못했습니다.');
    shaders.push(s);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || '셰이더 컴파일 실패');
    return s;
  };
  try {
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || '셰이더 링크 실패');
    return p;
  } catch (err) { gl.deleteProgram(p); throw err; }
  finally { for (const s of shaders) gl.deleteShader(s); }
}
// 정점은 '바닥 중심에서 잰 미터'로 그대로 올린다. 메르카토르로 미리 바꿔 넣으면 안 된다 —
// 이 위도의 메르카토르 x 는 0.855 근처이고 float32 의 한 칸이 약 6e-8, 즉 땅 위 약 2 m 다.
// 40 m 건물이 20 칸으로 뭉개져 지붕이 쐐기 모양으로 갈라진다.
// 원점 이동과 미터→메르카토르 배율은 행렬로 넘긴다. (지도 엔진의 3D 모델 레이어와 같은 방식)
const modelMatrix = (origin, scale) => [
  scale, 0, 0, 0,
  0, -scale, 0, 0,      // 메르카토르 y 는 남쪽이 +, 우리 n 은 북쪽이 + 라 부호를 뒤집는다
  0, 0, scale, 0,
  origin[0], origin[1], 0, 1
];
// 열 우선 4×4 곱 (a·b). 지도 행렬이 float32 라도 곱은 배정밀도로 한다.
function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
// 글자 텍스처: 한 글자당 한 칸. NPOT 라서 밉맵 없이 CLAMP_TO_EDGE 로 쓴다.
function signTexture(gl, text, color) {
  const chars = [...text], cell = 64;
  const c = document.createElement('canvas');
  c.width = chars.length * cell; c.height = cell;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(cell * 0.72)}px "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  chars.forEach((ch, i) => g.fillText(ch, i * cell + cell / 2, cell * 0.54));
  const tex = gl.createTexture();
  if (!tex) throw new Error('글자 텍스처를 만들지 못했습니다.');
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    checkGL(gl);
    return tex;
  } catch (err) { gl.deleteTexture(tex); throw err; }
}

// GL 상태는 복원하고 정점 속성/포인터는 전용 VAO에 격리한다.
// 깊이 버퍼 내용은 이번 한 채를 평면 지도 위에 그리는 정책에 따라 비운다.
function saveGL(gl) {
  const names = ['CURRENT_PROGRAM', 'ARRAY_BUFFER_BINDING', 'VERTEX_ARRAY_BINDING', 'ACTIVE_TEXTURE',
    'DEPTH_RANGE', 'DEPTH_WRITEMASK', 'DEPTH_CLEAR_VALUE', 'DEPTH_FUNC', 'CULL_FACE_MODE', 'FRONT_FACE',
    'BLEND_SRC_RGB', 'BLEND_DST_RGB', 'BLEND_SRC_ALPHA', 'BLEND_DST_ALPHA',
    'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'UNPACK_FLIP_Y_WEBGL'];
  const s = Object.fromEntries(names.map(n => [n, gl.getParameter(gl[n])]));
  s.enabled = ['DEPTH_TEST', 'CULL_FACE', 'BLEND', 'POLYGON_OFFSET_FILL', 'SCISSOR_TEST'].map(n => [n, gl.isEnabled(gl[n])]);
  gl.activeTexture(gl.TEXTURE0); s.texture0 = gl.getParameter(gl.TEXTURE_BINDING_2D); gl.activeTexture(s.ACTIVE_TEXTURE);
  return () => {
    gl.useProgram(s.CURRENT_PROGRAM); gl.bindVertexArray(s.VERTEX_ARRAY_BINDING); gl.bindBuffer(gl.ARRAY_BUFFER, s.ARRAY_BUFFER_BINDING);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.texture0); gl.activeTexture(s.ACTIVE_TEXTURE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, s.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, s.UNPACK_FLIP_Y_WEBGL);
    gl.depthRange(...s.DEPTH_RANGE); gl.depthMask(s.DEPTH_WRITEMASK); gl.clearDepth(s.DEPTH_CLEAR_VALUE); gl.depthFunc(s.DEPTH_FUNC);
    gl.cullFace(s.CULL_FACE_MODE); gl.frontFace(s.FRONT_FACE);
    gl.blendFuncSeparate(s.BLEND_SRC_RGB, s.BLEND_DST_RGB, s.BLEND_SRC_ALPHA, s.BLEND_DST_ALPHA);
    for (const [n, on] of s.enabled) (on ? gl.enable : gl.disable).call(gl, gl[n]);
  };
}
function checkGL(gl) {
  const code = gl.getError();
  if (code !== gl.NO_ERROR) throw new Error('WebGL 오류: 0x' + code.toString(16));
}
function releaseItem(gl, item) {
  for (const key of ['pos', 'col', 'linePos', 'lineCol', 'uv']) {
    if (item[key]) gl.deleteBuffer(item[key]); item[key] = null;
  }
  if (item.tex) gl.deleteTexture(item.tex); item.tex = null;
}
function upload(gl, item, key, values) {
  item[key] = gl.createBuffer();
  if (!item[key]) throw new Error('정점 버퍼를 만들지 못했습니다.');
  gl.bindBuffer(gl.ARRAY_BUFFER, item[key]);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW); checkGL(gl);
}
/**
 * 설정 데이터 계약은 유지한다. MapLibre 6의 WebGL2 컨텍스트를 사용한다.
 * facilityIds: onAdd에서 GPU 준비에 성공한 시설의 live Set(초기에는 비어 있음).
 * renderedFacilityIds: 실제 draw 성공 시설의 live Set(첫 프레임 측정용).
 * failed/errors: 계산·초기화·그리기 실패를 id/facility/stage로 누적한다.
 * onStateChange: 준비/첫 draw/실패/제거 뒤 microtask로 상태 복사본을 전달한다.
 * setVisible: 준비 상태를 보존하며 표시만 바꾸고 repaint를 요청한다.
 */
export function createVolumes({ volumes, park, onStateChange } = {}) {
  const scene = buildScene(volumes, park), failed = [...scene.failed], errors = [];
  const facilityIds = new Set(), renderedFacilityIds = new Set();
  let visible = true, scheduled = false;
  const notify = () => {
    if (scheduled || typeof onStateChange !== 'function') return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      try { onStateChange({ facilityIds: new Set(facilityIds), renderedFacilityIds: new Set(renderedFacilityIds), failed: [...failed], errors: [...errors] }); }
      catch (err) { console.warn('2.5D 상태 수신 처리 실패:', err); }
    });
  };
  const record = (b, stage, err, fatal = true) => {
    const entry = { id: b?.id, facility: b?.facility, stage, error: String(err?.message || err) };
    errors.push(entry); if (fatal) failed.push(entry); notify();
  };
  const layer = {
    id: 'eco-volumes', type: 'custom', renderingMode: '3d',
    onAdd(map, gl) {
      this.map = map; this.items = []; this.signs = [];
      if (!scene.built.length) { notify(); return; }
      if (typeof gl.createVertexArray !== 'function') {
        for (const b of scene.built) record(b, 'init', new Error('WebGL2 VAO를 사용할 수 없습니다.'));
        return;
      }
      const restore = saveGL(gl);
      try {
        this.program = compile(gl, VERT, FRAG); this.vao = gl.createVertexArray();
        if (!this.vao) throw new Error('정점 배열을 만들지 못했습니다.');
        this.loc = { matrix: gl.getUniformLocation(this.program, 'u_matrix'),
          pos: gl.getAttribLocation(this.program, 'a_pos'), color: gl.getAttribLocation(this.program, 'a_color') };
        for (const b of scene.built) {
          const item = { id: b.id, facility: b.facility, model: modelMatrix(b.origin, b.scale) };
          try {
            upload(gl, item, 'pos', b.mesh.pos); upload(gl, item, 'col', b.mesh.col); item.count = b.mesh.pos.length / 3;
            if (b.mesh.line.length) {
              upload(gl, item, 'linePos', b.mesh.line);
              const ink = hexToRgb(volumes.palette.ink || '#000000'), colors = [];
              for (let i = 0; i < b.mesh.line.length; i += 3) colors.push(...ink);
              upload(gl, item, 'lineCol', colors); item.lineCount = b.mesh.line.length / 3;
            }
            this.items.push(item); if (b.facility) facilityIds.add(b.facility);
          } catch (err) { releaseItem(gl, item); record(b, 'mesh', err); }
        }
        const withSign = scene.built.filter(b => b.sign && this.items.some(it => it.id === b.id));
        if (withSign.length) {
          try {
            this.texProgram = compile(gl, TEX_VERT, TEX_FRAG);
            this.texLoc = { matrix: gl.getUniformLocation(this.texProgram, 'u_matrix'), tex: gl.getUniformLocation(this.texProgram, 'u_tex'),
              pos: gl.getAttribLocation(this.texProgram, 'a_pos'), uv: gl.getAttribLocation(this.texProgram, 'a_uv') };
            for (const b of withSign) {
              const item = { id: b.id, facility: b.facility, model: modelMatrix(b.origin, b.scale) };
              try {
                const n = b.sign.quads.length, pos = [], uv = [];
                b.sign.quads.forEach((q, i) => {
                  const u0 = i / n, u1 = (i + 1) / n;
                  const c = [[q[0], q[1], q[2], u0, 0], [q[3], q[4], q[5], u1, 0], [q[6], q[7], q[8], u1, 1], [q[9], q[10], q[11], u0, 1]];
                  for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...c[k].slice(0, 3)); uv.push(...c[k].slice(3)); }
                });
                item.tex = signTexture(gl, b.sign.text, b.sign.color);
                upload(gl, item, 'pos', pos); upload(gl, item, 'uv', uv); item.count = pos.length / 3;
                this.signs.push(item);
              } catch (err) { releaseItem(gl, item); record(b, 'sign', err, false); }
            }
          } catch (err) { record(null, 'sign', err, false); }
        }
      } catch (err) {
        for (const b of scene.built) record(b, 'init', err);
        for (const it of [...this.items, ...this.signs]) releaseItem(gl, it);
        this.items = []; this.signs = []; facilityIds.clear(); this.disposePrograms(gl);
      } finally { restore(); notify(); }
    },
    disposePrograms(gl) {
      if (this.program) gl.deleteProgram(this.program); if (this.texProgram) gl.deleteProgram(this.texProgram);
      if (this.vao) gl.deleteVertexArray(this.vao);
      this.program = this.texProgram = this.vao = null;
    },
    onRemove(map, gl) {
      for (const it of [...(this.items || []), ...(this.signs || [])]) releaseItem(gl, it);
      this.disposePrograms(gl); this.items = []; this.signs = []; this.map = null;
      facilityIds.clear(); renderedFacilityIds.clear(); notify();
    },
    drop(gl, item, err) {
      releaseItem(gl, item); this.items = this.items.filter(it => it !== item);
      this.signs = this.signs.filter(s => { if (s.id !== item.id) return true; releaseItem(gl, s); return false; });
      if (!this.items.some(it => it.facility === item.facility)) { facilityIds.delete(item.facility); renderedFacilityIds.delete(item.facility); }
      record(item, 'render', err); this.map?.triggerRepaint();
    },
    render(gl, args) {
      if (!visible || !this.items?.length) return;
      const mat = args?.defaultProjectionData?.mainMatrix || args?.mainMatrix || args;
      if (!mat || mat.length !== 16) {
        for (const it of [...this.items]) this.drop(gl, it, new Error('지도 투영 행렬이 유효하지 않습니다.'));
        return;
      }
      const restore = saveGL(gl);
      try {
        gl.bindVertexArray(this.vao); gl.useProgram(this.program);
        // 한 채 시범의 overlay 정책: 기존 돌출 블록 위에 정확한 메시를 그린다.
        // 깊이 내용은 비우되 범위·마스크·비교 함수·scissor 등 상태는 finally에서 복원한다.
        gl.depthMask(true); gl.depthRange(0, 1); gl.clearDepth(1); gl.disable(gl.SCISSOR_TEST); gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW); gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.enableVertexAttribArray(this.loc.pos); gl.enableVertexAttribArray(this.loc.color);
        for (const it of [...this.items]) {
          try {
            gl.uniformMatrix4fv(this.loc.matrix, false, mul4(mat, it.model));
            gl.bindBuffer(gl.ARRAY_BUFFER, it.pos); gl.vertexAttribPointer(this.loc.pos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, it.col); gl.vertexAttribPointer(this.loc.color, 3, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLES, 0, it.count); checkGL(gl);
            if (it.facility && !renderedFacilityIds.has(it.facility)) { renderedFacilityIds.add(it.facility); notify(); }
          } catch (err) { this.drop(gl, it, err); }
        }
        gl.disable(gl.CULL_FACE);
        for (const it of [...this.items]) {
          if (!it.lineCount) continue;
          try {
            gl.uniformMatrix4fv(this.loc.matrix, false, mul4(mat, it.model));
            gl.bindBuffer(gl.ARRAY_BUFFER, it.linePos); gl.vertexAttribPointer(this.loc.pos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, it.lineCol); gl.vertexAttribPointer(this.loc.color, 3, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINES, 0, it.lineCount); checkGL(gl);
          } catch (err) { this.drop(gl, it, err); }
        }
        if (this.signs.length) {
          gl.useProgram(this.texProgram); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.texLoc.tex, 0);
          gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
          gl.enableVertexAttribArray(this.texLoc.pos); gl.enableVertexAttribArray(this.texLoc.uv);
          for (const sign of [...this.signs]) {
            try {
              gl.uniformMatrix4fv(this.texLoc.matrix, false, mul4(mat, sign.model)); gl.bindTexture(gl.TEXTURE_2D, sign.tex);
              gl.bindBuffer(gl.ARRAY_BUFFER, sign.pos); gl.vertexAttribPointer(this.texLoc.pos, 3, gl.FLOAT, false, 0, 0);
              gl.bindBuffer(gl.ARRAY_BUFFER, sign.uv); gl.vertexAttribPointer(this.texLoc.uv, 2, gl.FLOAT, false, 0, 0);
              gl.drawArrays(gl.TRIANGLES, 0, sign.count); checkGL(gl);
            } catch (err) { releaseItem(gl, sign); this.signs = this.signs.filter(s => s !== sign); record(sign, 'sign', err, false); }
          }
        }
      } catch (err) { for (const it of [...this.items]) this.drop(gl, it, err); }
      finally { restore(); }
    }
  };
  const stats = {
    buildings: scene.built.length,
    triangles: scene.built.reduce((s, b) => s + b.mesh.pos.length / 9, 0),
    vertices: scene.built.reduce((s, b) => s + b.mesh.pos.length / 3, 0),
    lineSegments: scene.built.reduce((s, b) => s + b.mesh.line.length / 6, 0),
    // 기하의 위치·색 버퍼 예상량. 글자·드라이버 메모리를 제외하며 전송량 측정값이 아니다.
    gpuBytes: scene.built.reduce((s, b) => s + (b.mesh.pos.length * 2 + b.mesh.line.length * 2) * 4, 0)
  };
  return {
    layer, scene,
    buildings: scene.built.map(b => ({ id: b.id, facility: b.facility, name: b.name, center: b.center, top: b.top })),
    failed, facilityIds, renderedFacilityIds, stats, errors,
    setVisible(on) { const next = !!on; if (next !== visible) { visible = next; layer.map?.triggerRepaint(); } },
    isVisible: () => visible
  };
}

export const _internal = { mercX, mercY, unmercX, unmercY, mercScale, haversine, rayRadius, offsetPoly, signedArea, areaCentroid, makeShader, dirOf };
