// 길찾기 — My Disney Experience 정적 분석(2026-10-26)에서 확인한 구조를 우리 자료로 구현했다.
//   출발지 선택(LocationSelectionActivity) · 경로 계산(findingRoute) · 단계 목록(StepListActivity)
//   · 도착 판정(destinationArrived) · 운영 종료 경고(facilityClosingOnArrival) · 경로 없음(noRouteAvailable)
// 경로 계산은 data/wayfinding-core.js(v7.3과 같은 파일)가 한다. 외부 길찾기 서버는 쓰지 않는다.
// 위치는 저장하지도 보내지도 않는다. 디즈니의 위치 업로드·백그라운드 추적·비컨은 따라 하지 않았다.

const R = 6371008.8, DEG = Math.PI / 180;
const BASIS_NOTE = {
  walkway: '등록된 보행로를 따라 계산했어요.',
  reference: '현장에서 기록한 참고 동선이에요.',
  straight: '이 구간은 등록된 길이 없어 직선 방향만 알려 드려요. 현장 안내판을 따라 주세요.'
};
const BASIS_COLOR = { walkway: '#2f8f7d', reference: '#c98a2e', straight: '#9a7fc0', estimated: '#7048e8' };

export function createWayfinding(ctx) {
  const { map, maplibregl, el, $, toast, focusOn, formatDistance } = ctx;
  const W = window.EcoWayfinding;
  if (!W) { console.warn('길찾기 모듈을 불러오지 못했어요.'); return null; }

  // ---------------------------------------------------------- 자료 변환
  // park.js(kind)와 시설 목록을 wayfinding-core가 기대하는 features(type) 형태로 맞춘다.
  const features = [];
  for (const f of ctx.facilities) {
    features.push({
      type: 'Feature',
      properties: { id: f.id, name: f.name, source_name: f.name, type: 'poi', status: f.status, hours: f.hours },
      geometry: { type: 'Point', coordinates: [f.lng, f.lat] }
    });
  }
  for (const f of (window.ECO_PARK?.features || [])) {
    const k = f.properties.kind;
    if (k === 'path') {
      features.push({ ...f, properties: { ...f.properties, type: 'path', walkable: true, width_m: 2, level: 0 } });
    } else if (k === 'reference') {
      features.push({ ...f, properties: { ...f.properties, type: 'reference_path', mode: 'pedestrian', source_name: f.properties.name } });
    } else {
      features.push({ ...f, properties: { ...f.properties, type: k } });
    }
  }
  // 추정 보행로(data/estimated-paths.js). 현장 기록이 아니므로 종류를 따로 둔다.
  for (const f of (window.ECO_ESTIMATED?.features || [])) features.push({ ...f, properties: { ...f.properties, type: 'estimated_path', source_name: f.properties.name } });
  const parkFC = { type: 'FeatureCollection', features };

  // 시설 규모의 지역 평면 좌표(m). 측량용이 아니다. v7.3과 같은 방식이다.
  const HOME = [ctx.center[0], ctx.center[1]], COS = Math.cos(HOME[1] * DEG);
  const xy = p => [(p[0] - HOME[0]) * DEG * R * COS, (p[1] - HOME[1]) * DEG * R];
  const ll = p => [HOME[0] + p[0] / (DEG * R * COS), HOME[1] + p[1] / (DEG * R)];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function buildGraph(fc) {
    const nodes = new Map(), segments = [];
    const node = c => {
      const key = c[0].toFixed(7) + ',' + c[1].toFixed(7);
      if (!nodes.has(key)) nodes.set(key, { p: xy(c), edges: [] });
      return key;
    };
    for (const f of fc.features.filter(f => f.properties.type === 'path' && f.properties.walkable === true)) {
      const cs = f.geometry.coordinates;
      for (let i = 1; i < cs.length; i++) {
        const a = node(cs[i - 1]), b = node(cs[i]), pa = nodes.get(a).p, pb = nodes.get(b).p, len = dist(pa, pb);
        if (len < 0.01) continue;
        segments.push({ id: segments.length, a, b, pa, pb, len });
        nodes.get(a).edges.push({ to: b, len }); nodes.get(b).edges.push({ to: a, len });
      }
    }
    return { nodes, segments };
  }
  function projection(p, s) {
    const dx = s.pb[0] - s.pa[0], dy = s.pb[1] - s.pa[1];
    const t = Math.max(0, Math.min(1, ((p[0] - s.pa[0]) * dx + (p[1] - s.pa[1]) * dy) / (s.len * s.len)));
    const q = mix(s.pa, s.pb, t);
    return { s, t, p: q, d: dist(p, q) };
  }
  const nearest = (p, g) => g.segments.map(s => projection(p, s)).sort((a, b) => a.d - b.d);
  // 선분의 공통 꼭짓점만 잇는다. 교차로 topology는 자료 쪽에서 확정해야 한다.
  function route(a, b, g) {
    if (a.s.id === b.s.id) return [a.p, b.p];
    const costs = new Map(), prev = new Map(), done = new Set();
    for (const [id, cost] of [[a.s.a, a.t * a.s.len], [a.s.b, (1 - a.t) * a.s.len]]) costs.set(id, cost);
    for (;;) {
      let u = null, best = Infinity;
      for (const [id, c] of costs) if (!done.has(id) && c < best) { u = id; best = c; }
      if (u === null) break;
      done.add(u);
      for (const e of g.nodes.get(u).edges) {
        const cost = best + e.len;
        if (cost < (costs.get(e.to) ?? Infinity)) { costs.set(e.to, cost); prev.set(e.to, u); }
      }
    }
    const ends = [[b.s.a, b.t * b.s.len], [b.s.b, (1 - b.t) * b.s.len]]
      .sort((x, y) => (costs.get(x[0]) ?? Infinity) + x[1] - ((costs.get(y[0]) ?? Infinity) + y[1]));
    const end = ends[0];
    if (!costs.has(end[0])) return null;
    const path = [];
    for (let id = end[0]; id !== undefined; id = prev.get(id)) path.unshift(g.nodes.get(id).p);
    return [a.p, ...path, b.p];
  }
  const graph = buildGraph(parkFC);

  // ---------------------------------------------------------- 참고 동선 이어 달리기 (2026-11-13)
  // 참고 동선은 "정문에서 ○○까지"처럼 한 줄씩 따로 기록돼 있다. 두 시설을 바로 잇는 기록이 없으면
  // 기록된 줄들이 서로 가까이 지나는 곳(joinM 이내)에서 갈아타며 이어 붙인다.
  //  · 새 길을 지어내지 않는다. 걷는 구간은 모두 기록된 줄 위다. 갈아타는 짧은 틈만 새로 생긴다.
  //  · 갈아타는 지점이 실제로 통하는지는 현장에서 확인하지 않았다. 화면에 그렇게 밝힌다.
  //  · 좌표 자료(park.js)와 wayfinding-core.js 는 고치지 않는다.
  //  · 시설 핀이 줄에서 stubM 보다 멀면 그 사이는 선으로 긋지 않고 글로만 알린다.
  const CHAIN = { stepM: 3, joinM: 5, joinPenaltyM: 6, attachM: 45, stubM: 25, estFactor: 1.25 };
  // 이름에서 출발·도착을 읽는다. core 의 referencePair 는 '경로 1'처럼 번호가 붙은 줄을 못 읽어 따로 둔다.
  const canon = n => W.NAME_ALIASES[n] || n;
  const pairOf = f => { const m = /^(.+?)에서(?:부터)?\s*(.+?)까지/.exec(f.properties.source_name || f.properties.name || ''); return m ? [canon(m[1].trim()), canon(m[2].trim())] : null; };
  function buildRefGraph() {
    const pts = [], names = [], ends = [], kinds = [];
    // 종류: reference(현장 기록) · walkway(park.js 보행로) · estimated(추정 길). 추정 길은 estFactor 배만큼 멀게 쳐서 기록된 길을 먼저 쓴다.
    const kindOf = f => f.geometry.type !== 'LineString' ? null : f.properties.type === 'reference_path' && pairOf(f) ? 'reference' : f.properties.type === 'path' ? 'walkway' : f.properties.type === 'estimated_path' ? 'estimated' : null;
    const lines = features.filter(kindOf);
    lines.forEach((f, li) => {
      names.push(f.properties.source_name || f.properties.name); kinds.push(kindOf(f));
      const w = kinds[li] === 'estimated' ? CHAIN.estFactor : 1;
      const cs = f.geometry.coordinates.map(xy);
      let prev = -1;
      const add = p => { pts.push({ p, line: li, edges: [] }); const i = pts.length - 1; if (prev >= 0) { const len = dist(pts[prev].p, p) * w; pts[prev].edges.push([i, len, 0]); pts[i].edges.push([prev, len, 0]); } prev = i; };
      const first = pts.length;
      add(cs[0]);
      for (let i = 1; i < cs.length; i++) {
        const n = Math.max(1, Math.ceil(dist(cs[i - 1], cs[i]) / CHAIN.stepM));
        for (let k = 1; k <= n; k++) add(mix(cs[i - 1], cs[i], k / n));
      }
      if (kinds[li] === 'reference') ends.push({ pair: pairOf(f), first, last: pts.length - 1 });
    });
    // 서로 다른 줄의 점이 joinM 이내면 갈아탈 수 있게 잇는다 (격자로 이웃만 본다)
    const cell = CHAIN.joinM, grid = new Map(), key = (x, y) => x + ',' + y;
    pts.forEach((q, i) => { const k = key(Math.floor(q.p[0] / cell), Math.floor(q.p[1] / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    pts.forEach((q, i) => {
      const cx = Math.floor(q.p[0] / cell), cy = Math.floor(q.p[1] / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of grid.get(key(cx + dx, cy + dy)) || []) {
        if (j <= i || pts[j].line === q.line) continue;
        const d = dist(q.p, pts[j].p);
        if (d <= CHAIN.joinM) { q.edges.push([j, d + CHAIN.joinPenaltyM, 1]); pts[j].edges.push([i, d + CHAIN.joinPenaltyM, 1]); }
      }
    });
    return { pts, names, ends, kinds };
  }
  const refGraph = buildRefGraph();
  // 한 지점에서 붙을 수 있는 점: 줄마다 가장 가까운 점 하나 (attachM 이내).
  // 그 시설 이름으로 기록된 줄이면 거리와 상관없이 그 줄의 해당 끝점에도 붙인다(기록이 그 시설까지 간 것이므로).
  function attach(p, name) {
    const best = new Map();
    refGraph.pts.forEach((q, i) => { const d = dist(p, q.p); if (d <= CHAIN.attachM && d < (best.get(q.line)?.d ?? Infinity)) best.set(q.line, { i, d }); });
    const out = [...best.values()], nm = name && canon(name);
    if (nm) refGraph.ends.forEach(e => { for (const [k, i] of [[0, e.first], [1, e.last]]) if (e.pair[k] === nm && !out.some(o => o.i === i)) out.push({ i, d: dist(p, refGraph.pts[i].p), named: true }); });
    return out;
  }
  function chainRoute(origin, target, originName, destName) {
    const starts = attach(xy(origin), originName), ends = attach(xy(target), destName);
    if (!starts.length || !ends.length) return null;
    const n = refGraph.pts.length, cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), via = new Uint8Array(n), done = new Uint8Array(n);
    const startOf = new Map();
    for (const s of starts) if (s.d < cost[s.i]) { cost[s.i] = s.d; startOf.set(s.i, s); }
    for (;;) {
      let u = -1, c = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && cost[i] < c) { c = cost[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const [v, len, join] of refGraph.pts[u].edges) if (c + len < cost[v]) { cost[v] = c + len; prev[v] = u; via[v] = join; }
    }
    const end = ends.filter(e => Number.isFinite(cost[e.i])).sort((a, b) => cost[a.i] + a.d - (cost[b.i] + b.d))[0];
    if (!end) return null;
    const idx = []; for (let i = end.i; i >= 0; i = prev[i]) idx.unshift(i);
    const used = [], joinPoints = [];
    idx.forEach((i, k) => { const nm = refGraph.names[refGraph.pts[i].line]; if (used.at(-1) !== nm) used.push(nm); if (k && via[i]) joinPoints.push(ll(refGraph.pts[i].p)); });
    // 줄 위의 중간 점은 3 m 간격으로 촘촘하다. 방향이 거의 같은 점은 덜어 낸다.
    const thin = raw => {
      const keep = [raw[0]];
      for (let k = 1; k < raw.length - 1; k++) {
        const a = keep.at(-1), b = raw[k], c2 = raw[k + 1];
        const cross = Math.abs((b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0])) / (dist(a, c2) || 1);
        if (cross > 0.4 || dist(a, b) > 25) keep.push(b);
      }
      if (raw.length > 1) keep.push(raw.at(-1));
      return keep;
    };
    // 종류가 바뀌는 곳에서 토막을 나눈다. 지도에서 추정 길 토막만 다른 선으로 그리기 위해서다.
    const groups = [];
    for (const i of idx) { const kd = refGraph.kinds[refGraph.pts[i].line] === 'estimated' ? 'estimated' : 'recorded'; if (groups.at(-1)?.kind !== kd) groups.push({ kind: kd, pts: groups.length ? [groups.at(-1).pts.at(-1)] : [] }); groups.at(-1).pts.push(refGraph.pts[i].p); }
    const parts = groups.map(g => ({ kind: g.kind, xy: thin(g.pts) })).filter(g => g.xy.length > 1 || groups.length === 1);
    const keep = parts.flatMap((g, k) => k ? g.xy.slice(1) : g.xy);
    let estimatedM = 0; for (const g of parts) if (g.kind === 'estimated') for (let k = 1; k < g.xy.length; k++) estimatedM += dist(g.xy[k - 1], g.xy[k]);
    // 핀이 줄에서 가까울 때만 핀까지 선을 잇는다. 멀면 줄 끝에서 멈추고 남은 거리를 글로 알린다.
    const startGap = startOf.get(idx[0])?.d ?? 0, endGap = end.d;
    const coordinates = [...(startGap <= CHAIN.stubM ? [origin.slice()] : []), ...keep.map(ll), ...(endGap <= CHAIN.stubM ? [target.slice()] : [])];
    let meters = 0; for (let k = 1; k < coordinates.length; k++) meters += dist(xy(coordinates[k - 1]), xy(coordinates[k]));
    const chained = used.length > 1, hasEst = estimatedM > 0.5;
    const drawParts = parts.map(g => ({ kind: g.kind, coordinates: g.xy.map(ll) }));
    if (startGap <= CHAIN.stubM && drawParts.length) drawParts[0].coordinates.unshift(origin.slice());
    if (endGap <= CHAIN.stubM && drawParts.length) drawParts.at(-1).coordinates.push(target.slice());
    // 선으로 긋지 않은 양 끝 거리. 기록된 길보다 이쪽이 더 길면 '길을 안내한다'고 할 수 없으므로 직선 방향 안내로 돌린다.
    const gaps = (startGap > CHAIN.stubM ? startGap : 0) + (endGap > CHAIN.stubM ? endGap : 0);
    if (meters < gaps || coordinates.length < 2) return null;
    const onlyWalkway = !hasEst && idx.every(i => refGraph.kinds[refGraph.pts[i].line] === 'walkway');
    return { basis: onlyWalkway ? 'walkway' : 'reference', label: hasEst ? '추정 경로 포함' : onlyWalkway ? '보행로 경로' : chained ? '참고 동선 이어 붙임' : '참고 동선', coordinates, distance: meters + gaps, chained, referenceNames: used, joins: joinPoints.length, joinPoints,
      estimated: hasEst, estimatedM, parts: drawParts,
      startGap: startGap > CHAIN.stubM ? startGap : 0, endGap: endGap > CHAIN.stubM ? endGap : 0 };
  }
  // 보행로·직접 기록이 없을 때만 이어 붙인 경로를 쓴다.
  function computeRoute(o) {
    const r = o.origin && o.destination ? W.computeRoute(o) : null;
    if (!r || r.basis !== 'straight') return r;
    const c = chainRoute(o.origin, o.destination.geometry.coordinates, o.originFeature?.properties.name, o.destination.properties.name);
    return c && c.coordinates.length > 1 ? c : r;
  }

  // ---------------------------------------------------------- 상태
  const st = { destId: null, originId: '__me', result: null, steps: [], arrived: false, open: false };
  // 길 안내 보기 상태 (아래 '길 안내 보기' 절에서 쓴다)
  const GUIDE = { pitch: 60, zoom: 18.6, stepM: 30, aheadM: 18 };
  const gd = { on: false, along: 0, cum: [0], total: 0, prev: null, marker: null, watch: null, live: false };
  const poi = id => features.find(f => f.properties.type === 'poi' && f.properties.id === id) || null;
  function originFeature() {
    if (st.originId !== '__me') return poi(st.originId);
    if (!ctx.user()) return null;
    return { type: 'Feature', properties: { id: '__me', name: '내 위치', source_name: '내 위치', type: 'poi' }, geometry: { type: 'Point', coordinates: ctx.user().slice() } };
  }
  const options = () => {
    const of = originFeature();
    return { origin: of?.geometry.coordinates, destination: poi(st.destId), originFeature: of, features, graph, xy, ll, nearest, route, outside: false };
  };

  // 목록·상세의 '걸어서 N분'에 쓴다. 내 위치가 없으면 null.
  function travelInfo(f) {
    if (!ctx.user()) return null;
    const d = poi(f.id); if (!d) return null;
    return W.travelInfo({ origin: ctx.user().slice(), destination: d, originFeature: null, features, graph, xy, ll, nearest, route, outside: false });
  }

  // ---------------------------------------------------------- 지도에 경로 그리기
  const EMPTY = { type: 'FeatureCollection', features: [] };
  function ensureLayers() {
    if (map.getSource('wf-route')) return;
    map.addSource('wf-route', { type: 'geojson', data: EMPTY });
    map.addLayer({
      id: 'wf-route-casing', type: 'line', source: 'wf-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fffdf6', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 7, 19, 17], 'line-opacity': 0.95 }
    });
    map.addLayer({
      id: 'wf-route-line', type: 'line', source: 'wf-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#2f8f7d'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3.4, 19, 9],
        // 직선 방향은 '길이 아님'을 점선으로 분명히 한다.
        'line-dasharray': ['case', ['==', ['get', 'basis'], 'straight'], ['literal', [1.6, 1.3]], ['==', ['get', 'basis'], 'estimated'], ['literal', [1.2, 1]], ['literal', [1, 0]]]
      }
    });
  }
  // 등록된 길이 없는 구간은 선을 그리지 않는다. 지도 위의 선은 '걸을 수 있는 길'로 읽히고,
  // 비탈·출입 금지 구역을 가로질러 안내하면 안전사고로 이어질 수 있다. 방향과 거리만 글로 알린다.
  function drawRoute(r) {
    ensureLayers();
    const src = map.getSource('wf-route');
    if (!r || r.basis === 'straight') return src.setData(EMPTY);
    // 추정 길 토막은 보라색 점선으로 따로 그린다 — 현장에서 기록한 길과 구분한다.
    const parts = r.parts?.length ? r.parts : [{ kind: 'recorded', coordinates: r.coordinates }];
    src.setData({
      type: 'FeatureCollection',
      features: parts.filter(p => p.coordinates.length > 1).map(p => { const b = p.kind === 'estimated' ? 'estimated' : r.basis; return { type: 'Feature', properties: { basis: b, color: BASIS_COLOR[b] }, geometry: { type: 'LineString', coordinates: p.coordinates } }; })
    });
  }

  // 목적지까지 기록된 경로가 있는 출발지들 — 직선밖에 안 나올 때 대안으로 권한다.
  const canonical = n => W.NAME_ALIASES[n] || n;
  function recordedOrigins(destId) {
    const dest = poi(destId); if (!dest) return [];
    const target = canonical(dest.properties.name), names = new Set();
    for (const f of features) {
      if (f.properties.type !== 'reference_path') continue;
      const pair = W.referencePair(f); if (!pair) continue;
      if (pair[1] === target) names.add(pair[0]);
      else if (pair[0] === target) names.add(pair[1]);
    }
    return ctx.facilities.filter(f => f.id !== destId && names.has(canonical(f.name)));
  }
  function fitRoute() {
    if (!st.result?.coordinates?.length) return;
    const b = new maplibregl.LngLatBounds();
    for (const c of st.result.coordinates) b.extend(c);
    map.fitBounds(b, { padding: ctx.cameraPadding(), maxZoom: 18, pitch: map.getPitch(), bearing: map.getBearing(), duration: 600 });
  }

  // ---------------------------------------------------------- 화면
  function populateOrigins() {
    const sel = $('wfOrigin'); sel.textContent = '';
    const me = el('option', null, ctx.user() ? '내 위치' : '내 위치 (먼저 위치 확인 필요)');
    me.value = '__me'; me.disabled = !ctx.user(); sel.append(me);
    for (const f of [...ctx.facilities].sort((a, b) => a.name.localeCompare(b.name, 'ko'))) {
      if (f.id === st.destId) continue;
      const o = el('option', null, f.name); o.value = f.id; sel.append(o);
    }
    if (!ctx.user() && st.originId === '__me') st.originId = ctx.facilities.find(f => f.name === '정문')?.id || ctx.facilities[0]?.id;
    sel.value = st.originId;
  }

  function calculate({ fit = true } = {}) {
    const o = options();
    st.result = computeRoute(o);
    st.steps = st.result ? W.makeSteps(st.result, features) : [];
    st.arrived = false;
    drawRoute(st.result);
    render();
    if (gd.on) { measure(); guideCamera(); }
    else if (fit) fitRoute();
  }

  function render() {
    const dest = ctx.byId(st.destId);
    if (!dest) return;
    $('wfDestName').textContent = dest.name;
    const r = st.result;
    const sum = $('wfSummary'), list = $('wfSteps'), warn = $('wfWarning'), arrive = $('wfArrival');
    const stepsTitle = document.querySelector('.wf-steps-title');
    sum.textContent = ''; list.textContent = '';
    $('wfGuide').hidden = !(r && r.basis !== 'straight' && r.coordinates?.length > 1);
    stepsTitle.hidden = true;   // 따라갈 단계가 있을 때만 제목을 보인다

    if (!r) {
      sum.append(el('p', 'wf-none', '경로를 계산하지 못했어요. 출발지를 다시 골라 주세요.'));
      warn.hidden = true; arrive.hidden = true;
      return;
    }
    const minutes = Math.max(1, Math.ceil((r.basis === 'straight' ? r.distance * 1.3 : r.distance) / W.SPEED));
    const head = el('p', 'wf-head');
    head.append(el('b', 'wf-basis ' + (r.estimated ? 'estimated' : r.basis), r.estimated ? '[추정 경로] 포함' : r.label));
    // 길이 없는 구간은 '걸어서 몇 분'이라고 말하지 않는다. 그 수치가 길이 있다는 뜻으로 읽힌다.
    head.append(el('span', 'wf-figure', r.basis === 'straight'
      ? `직선 거리 ${formatDistance(r.distance)}`
      : `${formatDistance(r.distance)} · 걸어서 약 ${minutes}분`));
    sum.append(head);
    sum.append(el('p', 'wf-note', r.estimated ? '현장에서 기록한 길에 추정 경로를 이어 붙였어요.' : r.chained ? '현장에서 기록한 참고 동선을 이어 붙였어요.' : BASIS_NOTE[r.basis]));
    if (r.estimated) sum.append(el('p', 'wf-note wf-est', `보라색 점선 약 ${formatDistance(r.estimatedM)}는 [추정 경로]예요. 항공사진과 공개 지도에서 읽은 길이라 실제와 다를 수 있어요. 막혀 있으면 현장 안내판을 따라 주세요.`));
    if (r.basis === 'reference' && r.referenceName) sum.append(el('p', 'wf-note', `기록: ${r.referenceName}`));
    if (r.referenceNames?.some(n => n.includes('계단'))) sum.append(el('p', 'wf-note wf-chain', '계단 구간이 있어요. 유모차·휠체어는 다른 길을 이용해 주세요.'));
    if (r.startGap) sum.append(el('p', 'wf-note wf-chain', `출발지에서 경로 시작점까지 약 ${formatDistance(r.startGap)}는 기록된 길이 없어요. 선이 시작되는 곳까지 현장 안내판을 따라 주세요.`));
    if (r.endGap) sum.append(el('p', 'wf-note wf-chain', `경로 끝에서 목적지까지 약 ${formatDistance(r.endGap)}는 기록된 길이 없어요. 가까이 가면 현장 안내판을 확인해 주세요.`));
    if (r.chained) {
      sum.append(el('p', 'wf-note wf-chain', `기록된 동선 ${r.referenceNames.length}개를 이어 붙인 경로예요. 이어지는 ${r.joins}곳은 현장에서 확인하지 않았어요. 막혀 있으면 현장 안내판을 따라 주세요.`));
      sum.append(el('p', 'wf-note', `기록: ${r.referenceNames.join(' → ')}`));
    }

    // 운영 종료 경고 — 운영 자료가 들어오면 도착 시각 기준으로도 알린다.
    const w = W.operatingWarning({ status: dest.status, hours: dest.hours, checkedMs: dest.checkedMs, validUntilMs: dest.validUntilMs }, minutes);
    const closed = dest.status === 'closed' ? '목적지가 지금 운영 종료 상태예요.' : '';
    warn.textContent = w || closed; warn.hidden = !(w || closed);
    arrive.hidden = !st.arrived;

    if (r.basis === 'straight') {
      const from = r.coordinates[0], to = r.coordinates.at(-1);
      const box = el('div', 'wf-unknown');
      box.append(el('strong', null, '이 구간은 등록된 보행로가 없습니다'));
      box.append(el('p', null, `목적지는 여기서 ${W.compass(from, to)} 약 ${formatDistance(r.distance)}에 있습니다. 가로지르는 길이 있다는 뜻이 아니며, 비탈·공사 구간·출입 금지 구역이 있을 수 있습니다. 반드시 현장 안내판과 포장된 길을 따라 이동해 주세요.`));
      const alts = recordedOrigins(st.destId);
      if (alts.length) {
        box.append(el('p', 'wf-alt-label', '기록된 경로가 있는 출발지'));
        const row = el('div', 'wf-alts');
        for (const a of alts.slice(0, 4)) {
          const b = el('button', 'wf-alt', `${a.name}에서 출발`);
          b.type = 'button';
          b.addEventListener('click', () => { st.originId = a.id; $('wfOrigin').value = a.id; calculate(); });
          row.append(b);
        }
        box.append(row);
      }
      sum.append(box);
      return;   // 단계 목록을 만들지 않는다 — 따라갈 길이 없다
    }

    stepsTitle.hidden = st.steps.length === 0;
    for (const [i, s] of st.steps.entries()) {
      const li = el('li', 'wf-step');
      li.append(el('span', 'wf-step-n', String(i + 1)), el('span', 'wf-step-t', s.text));
      li.addEventListener('click', () => focusOn(s.point, Math.max(map.getZoom(), 17.4), 450));
      list.append(li);
    }
  }

  // ---------------------------------------------------------- 위치 변화
  function onLocation(coords) {
    populateOrigins();
    if (!st.open || st.originId !== '__me' || !coords) return;
    const dest = poi(st.destId);
    if (dest) {
      st.arrived = W.hasArrived(coords, dest.geometry.coordinates, ctx.accuracy());
      if (st.arrived) { $('wfArrival').hidden = false; drawRoute(null); if (gd.on) guideArrived(); return; }
      if (!st.result || W.needsRecalculation(coords, st.result)) calculate({ fit: false });
      else render();
      if (gd.on && st.result) { gd.along = alongOf(coords); guideCamera(); }
    }
  }

  // ---------------------------------------------------------- 열고 닫기
  function open(destId) {
    const dest = ctx.byId(destId); if (!dest) return;
    st.destId = destId; st.open = true; st.arrived = false;
    if (!ctx.user() && st.originId === '__me') st.originId = ctx.facilities.find(f => f.name === '정문')?.id || ctx.facilities[0]?.id;
    if (st.originId === destId) st.originId = ctx.user() ? '__me' : (ctx.facilities.find(f => f.id !== destId)?.id);
    populateOrigins();
    ctx.showView('route');
    calculate();
    $('wfDestName').tabIndex = -1;
    setTimeout(() => $('wfDestName').focus({ preventScroll: true }), 0);
  }
  function close() {
    if (gd.on) stopGuide({ restore: true, show: false });
    st.open = false; st.result = null; st.steps = []; st.arrived = false;
    drawRoute(null);
  }

  // ---------------------------------------------------------- 이벤트
  $('wfOrigin').addEventListener('change', e => { st.originId = e.target.value; calculate(); });
  $('wfSwap').addEventListener('click', () => {
    if (st.originId === '__me') return toast('내 위치는 목적지로 바꿀 수 없어요.');
    const next = st.originId; st.originId = st.destId; st.destId = next;
    ctx.selectQuiet(st.destId);     // 지도 선택도 새 목적지로 옮긴다
    ctx.showView('route');          // selectQuiet이 상세로 돌려놓으므로 다시 길찾기 화면으로
    populateOrigins(); calculate();
  });
  $('wfBack').addEventListener('click', () => { close(); ctx.showView('detail'); });
  $('wfClose').addEventListener('click', () => { close(); ctx.closeAll(); });
  $('wfRecalc').addEventListener('click', () => calculate());
  // 숲·골짜기에서는 GPS 오차가 커서 자동 도착 판정(정확도 50m·목적지 20m)이 안 잡힐 수 있다.
  $('wfArrivedManual').addEventListener('click', () => { st.arrived = true; $('wfArrival').hidden = false; drawRoute(null); });
  $('wfArrivalDone').addEventListener('click', () => { close(); ctx.showView('detail'); });

  // ---------------------------------------------------------- 길 안내 보기
  // 평소 지도와 같은 지도를 쓴다. 기울이고(60°), 가는 방향이 위로 오게 돌리고, 경로 위 한 점을 따라간다.
  // 실사 3D 로 바꾸지 않는다 — 휴대전화에서 가볍고 햇빛 아래에서도 읽히는 쪽을 택했다(결정 2026-11-13).
  const gDist = (a, b) => {
    const dLat = (b[1] - a[1]) * DEG, dLng = (b[0] - a[0]) * DEG;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const gBearing = (a, b) => {
    const y = Math.sin((b[0] - a[0]) * DEG) * Math.cos(b[1] * DEG);
    const x = Math.cos(a[1] * DEG) * Math.sin(b[1] * DEG) - Math.sin(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.cos((b[0] - a[0]) * DEG);
    return (Math.atan2(y, x) / DEG + 360) % 360;
  };
  function measure() {
    const c = st.result?.coordinates || [];
    gd.cum = [0];
    for (let i = 1; i < c.length; i++) gd.cum.push(gd.cum[i - 1] + gDist(c[i - 1], c[i]));
    gd.total = gd.cum.at(-1) || 0;
    gd.along = Math.min(gd.along, gd.total);
  }
  function pointAt(d) {
    const c = st.result.coordinates;
    d = Math.max(0, Math.min(gd.total, d));
    let i = 1; while (i < c.length - 1 && gd.cum[i] < d) i++;
    const seg = gd.cum[i] - gd.cum[i - 1], t = seg ? (d - gd.cum[i - 1]) / seg : 0;
    return [c[i - 1][0] + (c[i][0] - c[i - 1][0]) * t, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t];
  }
  // 경로 위에서 pos 와 가장 가까운 지점까지의 누적 거리(m)
  function alongOf(pos) {
    const c = st.result.coordinates, k = Math.cos(pos[1] * DEG);
    let best = Infinity, at = 0;
    for (let i = 1; i < c.length; i++) {
      const ax = (c[i - 1][0] - pos[0]) * k, ay = c[i - 1][1] - pos[1], bx = (c[i][0] - pos[0]) * k, by = c[i][1] - pos[1];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const px = ax + dx * t, py = ay + dy * t, d2 = px * px + py * py;
      if (d2 < best) { best = d2; at = gd.cum[i - 1] + (gd.cum[i] - gd.cum[i - 1]) * t; }
    }
    return at;
  }
  function guideBearing() {
    const a = pointAt(gd.along), b = pointAt(gd.along + GUIDE.aheadM);
    if (gDist(a, b) > 1) return gBearing(a, b);
    return gBearing(pointAt(gd.along - GUIDE.aheadM), a);   // 끝에 다다르면 오던 방향을 유지한다
  }
  function guideText() {
    const remain = Math.max(0, gd.total - gd.along);
    $('guideRemain').textContent = remain < 8 ? '목적지 부근' : `남은 거리 ${formatDistance(remain)}`;
    let text = '';
    for (const s of st.steps) { if (s.point && alongOf(s.point) >= gd.along - 5) { text = s.text; break; } }
    $('guideStep').textContent = remain < 8 ? '목적지 부근이에요. 현장 안내판을 확인해 주세요.' : (text || '경로를 따라 이동해 주세요.');
    $('guidePrev').disabled = gd.along <= 0; $('guideNext').disabled = gd.along >= gd.total;
  }
  function guideCamera(animate = true) {
    if (!gd.on || !st.result?.coordinates?.length) return;
    const p = pointAt(gd.along);
    if (!gd.live) gd.marker?.setLngLat(p);
    // 따라가는 점을 화면 아래쪽에 둔다. 갈 길이 화면 위쪽에 넓게 보인다.
    map.easeTo({ center: p, zoom: GUIDE.zoom, pitch: GUIDE.pitch, bearing: guideBearing(), offset: [0, Math.round(innerHeight * 0.16)], duration: animate ? 700 : 0 });
    guideText();
  }
  function guideArrived() {
    $('guideRemain').textContent = '도착';
    $('guideStep').textContent = '도착했어요. 안내를 끝내 주세요.';
  }
  function startGuide() {
    const r = st.result;
    if (!r || r.basis === 'straight' || r.coordinates.length < 2) return toast('이 구간은 따라갈 길이 등록되어 있지 않아요.');
    gd.prev = { was3d: ctx.viewIs3d() };
    gd.on = true; gd.live = st.originId === '__me' && !!ctx.user();
    measure();
    gd.along = gd.live ? alongOf(ctx.user()) : 0;
    ctx.set3d(true, false);                       // 건물은 입체로 세운다
    ctx.app.classList.add('guiding');
    $('guideDest').textContent = ctx.byId(st.destId)?.name || '';
    $('guideChip').textContent = `길 안내 중 · ${r.estimated ? '[추정 경로] 포함' : r.label}`;
    $('guideChip').hidden = false; $('guideBar').hidden = false;
    if (!gd.live) {
      const d = el('div', 'guide-me'); d.setAttribute('aria-label', '안내 위치');
      gd.marker = new maplibregl.Marker({ element: d }).setLngLat(pointAt(0)).addTo(map);
    } else if (navigator.geolocation) {
      // 안내 중에만 위치를 이어서 받는다. 끝내면 바로 멈춘다. 저장·전송은 하지 않는다.
      gd.watch = navigator.geolocation.watchPosition(
        pos => ctx.trackUser([pos.coords.longitude, pos.coords.latitude], pos.coords.accuracy),
        () => { /* 위치를 못 받으면 마지막 위치에 머문다. 이전·다음 단추로 볼 수 있다 */ },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }
    guideCamera();
    ctx.app.style.setProperty('--guide-h', $('guideBar').offsetHeight + 'px');   // 출처 표시를 안내 띠 위로 올린다
    $('guideEnd').focus({ preventScroll: true });
  }
  function stopGuide({ restore = true, show = true } = {}) {
    if (!gd.on) return;
    gd.on = false;
    if (gd.watch != null) { navigator.geolocation.clearWatch(gd.watch); gd.watch = null; }
    gd.marker?.remove(); gd.marker = null;
    ctx.app.classList.remove('guiding');
    $('guideChip').hidden = true; $('guideBar').hidden = true;
    if (restore) {
      map.stop();
      map.jumpTo({ bearing: 0 });
      ctx.set3d(gd.prev?.was3d ?? false, false);
      if (show) { ctx.showView('route'); fitRoute(); }
    }
  }
  $('wfGuide').addEventListener('click', startGuide);
  $('guideEnd').addEventListener('click', () => stopGuide());
  $('guideNext').addEventListener('click', () => { gd.along = Math.min(gd.total, gd.along + GUIDE.stepM); guideCamera(); });
  $('guidePrev').addEventListener('click', () => { gd.along = Math.max(0, gd.along - GUIDE.stepM); guideCamera(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && gd.on) { e.stopPropagation(); stopGuide(); } }, true);

  return { open, close, onLocation, travelInfo, isOpen: () => st.open, state: st, guide: gd, startGuide, stopGuide,
    // 검사용: 두 시설 사이 경로의 근거를 돌려준다
    routeBetween: (a, b) => { const A = poi(a), B = poi(b); if (!A || !B) return null; const r = computeRoute({ origin: A.geometry.coordinates, destination: B, originFeature: A, features, graph, xy, ll, nearest, route, outside: false }); return r && { basis: r.basis, label: r.label, distance: Math.round(r.distance), joins: r.joins || 0, est: Math.round(r.estimatedM || 0), lines: r.referenceNames?.length || (r.basis === 'reference' ? 1 : 0), gap: Math.round((r.startGap || 0) + (r.endGap || 0)) }; },
    refGraphSize: () => ({ points: refGraph.pts.length, lines: refGraph.names.length, joins: refGraph.pts.reduce((n, q) => n + q.edges.filter(e => e[2]).length, 0) / 2 }) };
}
