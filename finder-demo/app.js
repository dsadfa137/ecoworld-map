// 에코월드 시설 지도 — 지도 핀 선택 → 바텀시트, 확대/축소, 카테고리 필터, 핀 묶음, 내 위치
// 데이터: data/facilities.js(window.ECO_FACILITIES) 또는 ?data=<JSON 주소>. 외부 테마파크 서버는 쓰지 않는다.
import * as maplibregl from 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.15.0/dist/maplibre-gl.mjs';

const CONFIG = {
  labelMinZoom: 17,      // 이 줌 이상에서만 시설 이름 표시 (minzoom)
  clusterBelowZoom: 16,  // 이 줌 미만에서는 가까운 핀을 묶는다
  clusterRadiusPx: 64,   // 묶음 원(48px+테두리)끼리 겹치지 않는 간격
  selectZoom: 17.3,      // 핀을 고르면 최소 이 줌까지 확대
  minZoom: 13.5, maxZoom: 19.5,
  walkMetersPerMin: 4000 / 60, straightFactor: 1.3,
  farFromParkM: 2000,
  fitMaxZoom: 17, detailZoom: 17.6,
  // 리플렛 그림지도 모드. 그림은 실제 축척이 아니어서 줌 기준을 따로 둔다.
  illus: { scale: 1.49e-8, labelMinZoom: 15.6, clusterBelowZoom: 14.9, clusterRadiusPx: 44, selectZoom: 15.7, detailZoom: 16.2, fitMaxZoom: 15.6, maxZoom: 17.5, home: [1950, 1250] },
  coreRadiusM: 200,      // 처음 화면에 담을 공원 중심부 반경
  pitch3d: 50,           // 입체 보기 기울기
  desktopMin: 900
};

const CATEGORY_COLOR = { experience: 'var(--c-experience)', exhibition: 'var(--c-exhibition)', amenity: 'var(--c-amenity)', safety: 'var(--c-safety)' };
const TAG_LABEL = { toilet: '화장실', nursing: '수유실', food: '식당·카페', parking: '주차장' };
const STATUS_LABEL = { open: '운영 중', closed: '운영 종료', unknown: '정보 없음' };

// 단색 아이콘(24×24 path). 글자 아이콘은 glyph로 그린다.
const ICON_PATH = {
  experience: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z',
  exhibition: 'M12 2 2 7v2h20V7L12 2Zm-7 9v7h2.5v-7H5Zm5.75 0v7h2.5v-7h-2.5ZM16.5 11v7H19v-7h-2.5ZM3 20v2h18v-2H3Z',
  medical: 'M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z',
  nursing: 'M10 2h4v2h1a2 2 0 0 1 2 2v1.5c0 .8-.5 1.5-1 2V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9.5c-.5-.5-1-1.2-1-2V6a2 2 0 0 1 2-2h1V2Zm0 10v2h4v-2h-4Z',
  food: 'M4 3h14v3h1.5A2.5 2.5 0 0 1 22 8.5v1A3.5 3.5 0 0 1 18.5 13H18a6 6 0 0 1-6 5H10a6 6 0 0 1-6-6V3Zm14 5v3h.5c.8 0 1.5-.7 1.5-1.5v-1c0-.3-.2-.5-.5-.5H18ZM3 20h17v2H3z'
};
const ICON_GLYPH = { toilet: 'WC', parking: 'P', info: 'i' };

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');

const state = {
  facilities: [], categories: [], center: [128.0618, 36.6537],
  category: 'all', query: '', tags: new Set(), onlyOpen: false, onlyWait: false, sort: 'name',
  selected: null, user: null, sheet: 'collapsed', view: 'list',
  mode: window.ECO_ILLUS ? 'illus' : '3d'   // 'illus' 리플렛 그림지도, '3d' 실제 지도와 3D 건물
};
let map, userMarker = null;
const pins = new Map();           // facilMappCd → { marker, el }
let clusterMarkers = [];

// ---------------------------------------------------------------- 데이터
// 다른 형식의 시설 JSON(facilMappCd/facilNm/mapX/mapY 등)도 받아들인다.
function normalizeFacility(r) {
  const id = r.facilMappCd ?? r.id ?? r.facilId ?? r.code;
  const name = r.name ?? r.facilNm ?? r.facilName ?? r.title;
  const lat = Number(r.lat ?? r.latitude ?? r.mapY ?? r.y);
  const lng = Number(r.lng ?? r.lon ?? r.longitude ?? r.mapX ?? r.x);
  if (id == null || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const category = CATEGORY_COLOR[r.category] ? r.category : 'amenity';
  const wait = r.waitMinutes ?? r.waitTime ?? null;
  return {
    id: String(id), name: String(name), category, lat, lng,
    tags: Array.isArray(r.tags) ? r.tags : [], icon: r.icon || null,
    description: r.description || r.desc || '', photo: r.photo || null,
    status: ['open', 'closed'].includes(r.status) ? r.status : 'unknown',
    hours: r.hours || '', waitMinutes: wait === null || wait === '' ? null : Number(wait), checkedAt: r.checkedAt || null
  };
}
async function loadData() {
  const url = new URLSearchParams(location.search).get('data');
  let raw = window.ECO_FACILITIES;
  if (url || !raw) raw = await (await fetch(url || 'data/facilities.json', { cache: 'no-cache' })).json();
  const list = Array.isArray(raw) ? raw : raw.facilities || raw.items || [];
  state.facilities = list.map(normalizeFacility).filter(Boolean);
  if (Array.isArray(raw.center)) state.center = raw.center;
  if (window.ECO_ILLUS) for (const f of state.facilities) f.illusPos = illusLngLat(window.ECO_ILLUS.points[f.id] || realToIllus([f.lng, f.lat]));
  state.categories = (raw.categories || [
    { id: 'experience', label: '체험/탑승' }, { id: 'exhibition', label: '전시/박물관' },
    { id: 'amenity', label: '편의시설/식당' }, { id: 'safety', label: '안전/의무실' }
  ]).filter(c => state.facilities.some(f => f.category === c.id));
}
const byId = id => state.facilities.find(f => f.id === id) || null;
const categoryLabel = id => state.categories.find(c => c.id === id)?.label || '시설';

// ---------------------------------------------------------------- 리플렛 그림지도 좌표
// 그림은 비스듬한 그림이라 실제 위경도와 맞지 않는다. 그림 픽셀을 공원 근처 가상의 평면에 깔고,
// 시설은 그림 속 자리에 둔다. 거리 계산은 실제 좌표(f.lng, f.lat)를 그대로 쓴다.
const cfg = () => state.mode === 'illus' ? CONFIG.illus : CONFIG;
const pos = f => state.mode === 'illus' ? f.illusPos : [f.lng, f.lat];
function illusLngLat([x, y]) {
  const { width, height } = window.ECO_ILLUS, s = CONFIG.illus.scale;
  const c = maplibregl.MercatorCoordinate.fromLngLat(state.center);
  return new maplibregl.MercatorCoordinate(c.x + (x - width / 2) * s, c.y + (y - height / 2) * s).toLngLat().toArray();
}
// 실제 위경도 → 그림 픽셀: 아핀 변환에 가까운 시설의 오차를 거리 가중으로 더한다. 내 위치 점에 쓴다.
function realToIllus(p) {
  const { affine: a, points, width, height } = window.ECO_ILLUS;
  const base = q => { const e = (q[0] - a.lng0) * 89500, n = (q[1] - a.lat0) * 111000; return [a.ax[0] * e + a.ax[1] * n + a.ax[2], a.ay[0] * e + a.ay[1] * n + a.ay[2]]; };
  const out = base(p);
  let w = 0, dx = 0, dy = 0;
  for (const f of state.facilities) {
    const pt = points[f.id]; if (!pt) continue;
    const d = distanceM(p, [f.lng, f.lat]);
    if (d < 1) return pt;
    const b = base([f.lng, f.lat]), k = 1 / (d * d);
    w += k; dx += k * (pt[0] - b[0]); dy += k * (pt[1] - b[1]);
  }
  if (w) { out[0] += dx / w; out[1] += dy / w; }
  return [Math.min(width, Math.max(0, out[0])), Math.min(height, Math.max(0, out[1]))];
}
const userPos = () => state.mode === 'illus' ? illusLngLat(realToIllus(state.user)) : state.user;

// ---------------------------------------------------------------- 아이콘
function iconKey(f) {
  if (f.category === 'safety') return 'medical';
  if (f.tags.includes('toilet')) return 'toilet';
  if (f.tags.includes('parking')) return 'parking';
  if (f.tags.includes('nursing')) return 'nursing';
  if (f.tags.includes('food') || f.icon === 'cafe') return 'food';
  if (f.category === 'experience' || f.category === 'exhibition') return f.category;
  return 'info';
}
function iconNode(f) {
  const key = iconKey(f);
  if (ICON_PATH[key]) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICON_PATH[key]);
    svg.append(p); return svg;
  }
  const g = el('span', 'glyph', ICON_GLYPH[key] || 'i'); g.setAttribute('aria-hidden', 'true'); return g;
}

// ---------------------------------------------------------------- 계산
function distanceM(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const userDistance = f => state.user ? distanceM(state.user, [f.lng, f.lat]) : null;
const walkMinutes = m => Math.max(1, Math.ceil(m * CONFIG.straightFactor / CONFIG.walkMetersPerMin));
const formatDistance = m => m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;

function matches(f) {
  if (state.category !== 'all' && f.category !== state.category) return false;
  if (state.tags.size && !f.tags.some(t => state.tags.has(t))) return false;
  if (state.onlyOpen && f.status !== 'open') return false;
  if (state.onlyWait && f.waitMinutes == null) return false;
  if (state.query && !norm(f.name).includes(norm(state.query))) return false;
  return true;
}
function sorted(list) {
  const out = list.slice();
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  if (state.sort === 'distance' && state.user) out.sort((a, b) => userDistance(a) - userDistance(b) || byName(a, b));
  else if (state.sort === 'wait') out.sort((a, b) => (a.waitMinutes ?? Infinity) - (b.waitMinutes ?? Infinity) || byName(a, b));
  else out.sort(byName);
  return out;
}

// ---------------------------------------------------------------- 바텀시트
const isDesktop = () => innerWidth >= CONFIG.desktopMin;
const sheet = () => $('sheet');
function sheetPositions() {
  const h = sheet().getBoundingClientRect().height;
  const peek = state.view === 'detail' ? 238 : 148;
  return { collapsed: Math.max(0, h - peek), half: Math.max(0, h - Math.round(innerHeight * 0.5)), expanded: 0, height: h };
}
function applySheet(y, animate = true) {
  const s = sheet(), pos = sheetPositions();
  s.classList.toggle('dragging', !animate);
  s.style.setProperty('--sheet-y', `${y}px`);
  const visible = isDesktop() ? 0 : Math.max(0, pos.height - y);
  const shown = Math.min(visible, innerHeight * 0.55);
  $('app').style.setProperty('--sheet-visible', `${shown}px`);
  // 끄는 동안 버튼이 손가락보다 늦게 따라오지 않도록 위치 애니메이션을 끈다.
  const app = $('app');
  app.classList.toggle('sheet-dragging', !animate);
  // 시트가 올라와 지도 버튼이 상단 검색·카테고리 줄에 닿으면 버튼을 잠시 숨긴다.
  // 경계에서 깜빡이지 않도록 다시 나타나는 기준은 조금 더 여유 있게 둔다.
  const top = app.querySelector('.topbar').getBoundingClientRect().bottom;
  const gap = innerHeight - shown - 14 - app.querySelector('.map-controls').offsetHeight - top;
  app.classList.toggle('app-hide-controls', !isDesktop() && gap < (app.classList.contains('app-hide-controls') ? 18 : 6));
}
function setSheet(name, animate = true) {
  state.sheet = name;
  sheet().dataset.state = name;
  applySheet(sheetPositions()[name], animate);
  $('sheetGrip').setAttribute('aria-expanded', String(name !== 'collapsed'));
}
function sheetVisibleHeight() {
  if (isDesktop()) return 0;
  const pos = sheetPositions();
  return Math.min(pos.height - pos[state.sheet], innerHeight * 0.55);
}
function setupSheetDrag() {
  const s = sheet();
  let start = null;
  const scrollerOf = t => t.closest('.result-list,.detail');
  const begin = (y, target) => {
    if (isDesktop()) return;
    const m = /translateY\(([-\d.]+)px\)/.exec(getComputedStyle(s).transform) || null;
    const current = m ? Number(m[1]) : new DOMMatrixReadOnly(getComputedStyle(s).transform).m42;
    start = { y, base: current, last: y, t: performance.now(), v: 0, decided: false, drag: false, target };
  };
  const move = (y, ev) => {
    if (!start) return;
    const dy = y - start.y;
    if (!start.decided) {
      if (Math.abs(dy) < 6) return;
      start.decided = true;
      const scroller = scrollerOf(start.target);
      const expanded = state.sheet === 'expanded';
      // 펼친 상태에서 목록을 스크롤 중이면 시트를 끌지 않는다.
      start.drag = !(scroller && expanded && (scroller.scrollTop > 0 || dy < 0));
    }
    if (!start.drag) return;
    ev?.preventDefault();
    const now = performance.now();
    start.v = (y - start.last) / Math.max(1, now - start.t); start.last = y; start.t = now;
    const pos = sheetPositions();
    const next = Math.min(pos.collapsed + 40, Math.max(-20, start.base + dy));
    applySheet(next, false);
  };
  const end = () => {
    if (!start) return;
    const s0 = start; start = null;
    if (!s0.drag) { sheet().classList.remove('dragging'); return; }
    const pos = sheetPositions();
    const y = s0.base + (s0.last - s0.y);
    const order = ['expanded', 'half', 'collapsed'];
    let target;
    if (Math.abs(s0.v) > 0.45) {
      const i = order.indexOf(state.sheet === 'expanded' && y > pos.half ? 'half' : nearest(y, pos));
      target = order[Math.max(0, Math.min(2, i + (s0.v > 0 ? 1 : -1)))];
    } else target = nearest(y, pos);
    setSheet(target);
  };
  const nearest = (y, pos) => ['expanded', 'half', 'collapsed'].reduce((a, b) => Math.abs(pos[b] - y) < Math.abs(pos[a] - y) ? b : a);

  s.addEventListener('touchstart', e => begin(e.touches[0].clientY, e.target), { passive: true });
  s.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
  s.addEventListener('touchend', end); s.addEventListener('touchcancel', end);
  s.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.target.closest('.sheet-grip,.list-head,.detail-top,.detail-card')) { begin(e.clientY, e.target); s.setPointerCapture(e.pointerId); } });
  s.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') move(e.clientY, e); });
  s.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') end(); });

  const grip = $('sheetGrip');
  const cycle = () => setSheet(state.sheet === 'collapsed' ? 'half' : state.sheet === 'half' ? 'expanded' : 'collapsed');
  grip.addEventListener('click', cycle);
  grip.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSheet(state.sheet === 'collapsed' ? 'half' : 'expanded'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSheet(state.sheet === 'expanded' ? 'half' : 'collapsed'); }
  });
}

// ---------------------------------------------------------------- 지도
function cameraPadding() {
  const top = $('app').querySelector('.topbar').getBoundingClientRect().bottom + 12;
  if (isDesktop()) return { top: 40, bottom: 40, left: 432, right: 80 };
  return { top, bottom: sheetVisibleHeight() + 28, left: 32, right: 72 };
}
// 일러스트풍 배경: 브이월드 타일을 파스텔로 누르고, 공원 도형과 3D 건물을 같은 좌표 위에 올린다.
const REAL_LAYERS = ['base', 'tint', 'plaza', 'model-pad', 'path-casing', 'path', 'path-dash', 'building-3d'];
function withIllustration(sources, layers) {
  const il = window.ECO_ILLUS;
  if (!il) return layers;
  const { width: w, height: h } = il;
  sources.illus = { type: 'image', url: new URL(il.image, location.href).href, coordinates: [[0, 0], [w, 0], [w, h], [0, h]].map(illusLngLat) };
  return [...layers, { id: 'illus', type: 'raster', source: 'illus', paint: { 'raster-fade-duration': 0 } }];
}
function buildStyle() {
  const sources = { park: { type: 'geojson', data: window.ECO_PARK || { type: 'FeatureCollection', features: [] } } };
  const layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#e3e8de' } }];
  const base = window.ECO_BASEMAP;
  if (base?.tiles?.length) {
    sources.base = { type: 'raster', tiles: base.tiles, tileSize: 256, bounds: base.bounds, minzoom: base.minzoom || 6, maxzoom: base.maxzoom || 19, attribution: base.attribution || '' };
    layers.push({ id: 'base', type: 'raster', source: 'base', paint: {
      'raster-fade-duration': 0, 'raster-opacity': 1,
      'raster-saturation': 0.45, 'raster-contrast': 0.1, 'raster-brightness-min': 0.08
    } });
    // 회색기를 없애고 봄 풀빛으로 전체를 물들인다.
    layers.push({ id: 'tint', type: 'background', paint: { 'background-color': '#b9e08e', 'background-opacity': 0.26 } });
  }
  const kind = k => ['==', ['get', 'kind'], k];
  const isModel = ['==', ['get', 'model'], true];
  layers.push(
    { id: 'plaza', type: 'fill', source: 'park', filter: kind('plaza'), paint: { 'fill-color': '#ffe7b0', 'fill-outline-color': '#e0b768', 'fill-opacity': 1 } },
    // 3D 모델이 놓이는 자리는 밝은 바닥만 깔아 둔다.
    { id: 'model-pad', type: 'fill', source: 'park', filter: ['all', kind('building'), isModel], paint: { 'fill-color': '#f4efe2', 'fill-opacity': 0.8 } },
    { id: 'path-casing', type: 'line', source: 'park', filter: kind('path'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fffdf5', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 5, 17, 18, 19.5, 56] } },
    { id: 'path', type: 'line', source: 'park', filter: kind('path'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffcf6e', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 3, 17, 12, 19.5, 40] } },
    { id: 'path-dash', type: 'line', source: 'park', filter: kind('path'), minzoom: 16.5, layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 16.5, 0.8, 19.5, 2.5], 'line-dasharray': [2, 3] } },
    // 모델이 없는 건물은 파스텔 블록으로 세운다(높이는 표시용 가정값).
    { id: 'building-3d', type: 'fill-extrusion', source: 'park', filter: ['all', kind('building'), ['!', isModel]], paint: {
      'fill-extrusion-color': '#f7b58a', 'fill-extrusion-height': ['coalesce', ['get', 'height'], 7], 'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.96, 'fill-extrusion-vertical-gradient': true
    } }
  );
  return {
    version: 8, sources, layers: withIllustration(sources, layers),
    sky: { 'sky-color': '#9fd0ea', 'horizon-color': '#f4f7ef', 'fog-color': '#e3e8de', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.8, 'fog-ground-blend': 0.9 },
    light: { anchor: 'map', position: [1.4, 210, 35], intensity: 0.35, color: '#fff6e0' }
  };
}

// ---------------------------------------------------------------- 3D 랜드마크 (v7.3 GLB 6개, 같은 좌표계)
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';
function landmarkLayer() {
  const models = window.ECO_LANDMARKS || [];
  return {
    id: 'landmarks', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      this.items = [];
      Promise.all([import(THREE_URL), import('three/addons/loaders/GLTFLoader.js')]).then(([THREE, { GLTFLoader }]) => {
        this.THREE = THREE;
        this.camera = new THREE.Camera();
        this.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
        this.renderer.autoClear = false; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        const loader = new GLTFLoader();
        // GLB 축: X 동, Y 위, Z 남 → 메르카토르 축: X 동, Y 남, Z 위
        const basis = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
        for (const cfg of models) {
          const o = maplibregl.MercatorCoordinate.fromLngLat(cfg.origin, 0), u = o.meterInMercatorCoordinateUnits();
          const r = cfg.orientation.map(v => v * Math.PI / 180);
          const matrix = new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).scale(new THREE.Vector3(u, u, u))
            .multiply(new THREE.Matrix4().makeRotationZ(r[2])).multiply(new THREE.Matrix4().makeRotationX(r[0]))
            .multiply(new THREE.Matrix4().makeRotationY(r[1])).scale(new THREE.Vector3(...cfg.scale)).multiply(basis);
          const scene = new THREE.Scene();
          scene.add(new THREE.AmbientLight('#ffffff', 1.9));
          const sun = new THREE.DirectionalLight('#fff3d6', 1.7), az = (210 - r[2] * 180 / Math.PI) * Math.PI / 180, po = 35 * Math.PI / 180;
          sun.position.set(Math.sin(az) * Math.sin(po), Math.cos(po), -Math.cos(az) * Math.sin(po)); scene.add(sun);
          loader.load(cfg.url, g => { scene.add(g.scene); this.items.push({ scene, matrix }); m.triggerRepaint(); },
            undefined, () => console.warn(`3D 모델을 불러오지 못했어요: ${cfg.name}`));
        }
      }).catch(() => console.warn('3D 렌더러를 준비하지 못해 평면 지도로 표시합니다.'));
    },
    render(gl, args) {
      if (!this.renderer || !this.items.length) return;
      const main = new this.THREE.Matrix4().fromArray(args?.defaultProjectionData?.mainMatrix || args);
      this.renderer.resetState();
      for (const it of this.items) {
        this.camera.projectionMatrix = main.clone().multiply(it.matrix);
        this.renderer.render(it.scene, this.camera);
      }
    }
  };
}

// 그림지도 ↔ 3D 지도 전환. 두 화면은 좌표계가 달라 핀과 카메라를 함께 옮긴다.
function modeBounds(mode) {
  if (mode === 'illus') {
    const { width: w, height: h } = window.ECO_ILLUS;
    const nw = illusLngLat([0, -h]), se = illusLngLat([w, 2 * h]);
    return [[nw[0], se[1]], [se[0], nw[1]]];
  }
  const lngs = state.facilities.map(f => f.lng), lats = state.facilities.map(f => f.lat), pad = 0.012;
  return [[Math.min(...lngs) - pad, Math.min(...lats) - pad], [Math.max(...lngs) + pad, Math.max(...lats) + pad]];
}
const illusMinZoom = () => Math.log2($('map').clientWidth / (window.ECO_ILLUS.width * CONFIG.illus.scale * 512));
// 처음 화면: 그림 높이를 상단 바와 시트 사이에 꽉 채우고, 좌우는 밀어서 본다.
function illusHome() {
  const p = cameraPadding(), h = $('map').clientHeight - p.top - p.bottom + 60;
  focusOn(illusLngLat(CONFIG.illus.home), Math.max(illusMinZoom(), Math.log2(h / (window.ECO_ILLUS.height * CONFIG.illus.scale * 512))), 0);
}
function applyMode(mode) {
  state.mode = mode;
  const illus = mode === 'illus';
  const show = (id, on) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
  for (const id of REAL_LAYERS) show(id, !illus);
  show('illus', illus);
  if (!illus && window.ECO_LANDMARKS?.length && !map.getLayer('landmarks')) map.addLayer(landmarkLayer());
  show('landmarks', !illus);
  map.setPaintProperty('bg', 'background-color', illus ? '#a9dc82' : '#e3e8de');
  map.setMaxBounds(null);
  map.setMinZoom(illus ? illusMinZoom() : CONFIG.minZoom);
  map.setMaxZoom(illus ? CONFIG.illus.maxZoom : CONFIG.maxZoom);
  map.jumpTo({ pitch: illus ? 0 : CONFIG.pitch3d, bearing: 0 });
  for (const f of state.facilities) pins.get(f.id).marker.setLngLat(pos(f));
  if (userMarker) userMarker.setLngLat(userPos());
  const b = $('viewToggle');
  b.textContent = illus ? '3D' : '그림';
  b.setAttribute('aria-label', illus ? '3D 지도로 바꾸기' : '그림지도로 바꾸기');
  b.setAttribute('aria-pressed', String(!illus));
  try { localStorage.setItem('eco-view', mode); } catch { /* 저장 불가 환경 */ }
  const sel = state.selected && byId(state.selected);
  if (sel) focusOn(pos(sel), cfg().selectZoom, 0);
  else if (illus) illusHome();
  else fitAll(false, coreFacilities());
  map.setMaxBounds(modeBounds(mode));
  updateLabels(); updatePins();
}

// 지점을 '가려지지 않은 지도 영역'의 가운데로 옮긴다. 지도에 padding을 남기지 않도록 offset을 쓴다.
function focusOn(lngLat, zoom, duration = 500) {
  const p = cameraPadding();
  map.easeTo({ center: lngLat, zoom, offset: [(p.left - p.right) / 2, (p.top - p.bottom) / 2], duration });
}
function boundsOf(list) {
  const b = new maplibregl.LngLatBounds();
  for (const f of list) b.extend(pos(f));
  return b;
}
// 처음 화면: 시설 좌표의 중앙값에서 가까운, 시설이 모인 공원 중심부만 담는다.
function coreFacilities() {
  const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const c = [median(state.facilities.map(f => f.lng)), median(state.facilities.map(f => f.lat))];
  const core = state.facilities.filter(f => distanceM(c, [f.lng, f.lat]) <= CONFIG.coreRadiusM);
  return core.length >= 3 ? core : state.facilities;
}
function fitAll(animate = true, list = state.facilities.filter(matches)) {
  if (!list.length) return;
  const pad = cameraPadding(), pitch = map.getPitch(), bearing = map.getBearing();
  const cam = map.cameraForBounds(boundsOf(list), { padding: pad, maxZoom: cfg().fitMaxZoom, bearing, pitch: 0 });
  if (!cam) return;
  let center = cam.center, zoom = cam.zoom;
  if (pitch > 5) {
    // 기울이면 가까운 쪽은 커지고 먼 쪽은 작아진다. 실제로 투영해 보며 모든 시설이
    // 가려지지 않는 영역(상단 바와 시트 사이)에 들어오는 가장 큰 줌과 가운데를 찾는다.
    const saved = { center: map.getCenter(), zoom: map.getZoom(), pitch, bearing };
    const box = { l: pad.left, r: innerWidth - pad.right, t: pad.top, b: innerHeight - pad.bottom };
    const extent = (c, z) => {
      map.jumpTo({ center: c, zoom: z, pitch, bearing });
      const ps = list.map(f => map.project(pos(f)));
      return { l: Math.min(...ps.map(p => p.x)), r: Math.max(...ps.map(p => p.x)), t: Math.min(...ps.map(p => p.y)) - 52, b: Math.max(...ps.map(p => p.y)) };
    };
    for (let pass = 0; pass < 2; pass++) {
      for (zoom = Math.min(cfg().fitMaxZoom, cam.zoom + 0.8); zoom > cam.zoom - 1.5; zoom -= 0.05) {
        const e = extent(center, zoom);
        if (e.l >= box.l && e.r <= box.r && e.t >= box.t && e.b <= box.b) break;
      }
      // 시설 묶음의 화면 가운데를 가려지지 않은 영역 가운데로 옮긴다.
      const e = extent(center, zoom);
      const dx = (e.l + e.r) / 2 - (box.l + box.r) / 2, dy = (e.t + e.b) / 2 - (box.t + box.b) / 2;
      center = map.unproject([innerWidth / 2 + dx, innerHeight / 2 + dy]);
    }
    map.jumpTo(saved);
  }
  map.easeTo({ center, zoom, pitch, bearing, duration: animate ? 600 : 0 });
}

function createPin(f) {
  const b = el('button', 'pin');
  b.type = 'button';
  b.style.setProperty('--pin-c', CATEGORY_COLOR[f.category]);
  b.setAttribute('aria-label', `${f.name}, ${categoryLabel(f.category)}`);
  const head = el('span', 'pin-head'); head.append(iconNode(f));
  b.append(head, el('span', 'pin-label', f.name));
  if (f.waitMinutes != null) b.append(el('span', 'pin-wait', `${f.waitMinutes}분`));
  b.addEventListener('click', e => { e.stopPropagation(); select(f.id); });
  const marker = new maplibregl.Marker({ element: b, anchor: 'bottom' }).setLngLat(pos(f)).addTo(map);
  pins.set(f.id, { marker, el: b });
}
function updateLabels() {
  // minzoom: 기준 줌 근처의 깜빡임을 막기 위해 0.05 히스테리시스를 둔다.
  // 애니메이션이 16.999…에서 멈춰도 이름이 나오도록 0.01 여유를 준다.
  const z = map.getZoom(), c = map.getContainer(), on = c.classList.contains('show-labels');
  if (!on && z >= cfg().labelMinZoom - 0.01) c.classList.add('show-labels');
  else if (on && z < cfg().labelMinZoom - 0.05) c.classList.remove('show-labels');
}
// 이름표끼리 겹치면 우선순위가 낮은 쪽을 숨긴다. 선택 시설 > 체험·전시 > 그 밖의 시설.
const LABEL_RANK = { experience: 1, exhibition: 1, safety: 2, amenity: 3 };
function declutterLabels() {
  const showAll = map.getContainer().classList.contains('show-labels');
  const items = [];
  for (const [id, { el: b }] of pins) {
    const label = b.querySelector('.pin-label');
    label.classList.remove('collide');
    if (b.hidden || (!showAll && id !== state.selected)) continue;
    const f = byId(id);
    items.push({ label, rank: id === state.selected ? 0 : LABEL_RANK[f.category] ?? 3, name: f.name });
  }
  items.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'ko'));
  const placed = [];
  for (const it of items) {
    const r = it.label.getBoundingClientRect();
    const hit = placed.some(p => r.left < p.right + 2 && r.right > p.left - 2 && r.top < p.bottom + 1 && r.bottom > p.top - 1);
    if (hit) it.label.classList.add('collide'); else placed.push(r);
  }
}
function updatePins() {
  for (const m of clusterMarkers) m.remove();
  clusterMarkers = [];
  const visible = state.facilities.filter(matches);
  const visibleIds = new Set(visible.map(f => f.id));
  const groups = [];
  if (map.getZoom() < cfg().clusterBelowZoom) {
    // 화면 좌표 기준으로 가까운 핀을 묶는다. 선택한 시설은 묶지 않는다.
    const pts = visible.filter(f => f.id !== state.selected).map(f => ({ f, p: map.project(pos(f)) }));
    const used = new Set();
    for (const a of pts) {
      if (used.has(a.f.id)) continue;
      const g = pts.filter(b => !used.has(b.f.id) && Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) <= cfg().clusterRadiusPx);
      g.forEach(b => used.add(b.f.id));
      if (g.length > 1) groups.push(g.map(x => x.f));
    }
  }
  const clustered = new Set(groups.flat().map(f => f.id));
  for (const [id, { el: b }] of pins) {
    b.hidden = !visibleIds.has(id) || clustered.has(id);
    b.classList.toggle('selected', id === state.selected);
    b.setAttribute('aria-pressed', String(id === state.selected));
    b.parentElement && (b.style.zIndex = id === state.selected ? '10' : '');
  }
  for (const g of groups) {
    const c = el('button', 'cluster', String(g.length));
    c.type = 'button';
    c.setAttribute('aria-label', `시설 ${g.length}곳 묶음, 눌러서 확대`);
    const center = [g.reduce((s, f) => s + pos(f)[0], 0) / g.length, g.reduce((s, f) => s + pos(f)[1], 0) / g.length];
    c.addEventListener('click', e => {
      e.stopPropagation();
      map.fitBounds(boundsOf(g), { padding: cameraPadding(), maxZoom: Math.max(cfg().clusterBelowZoom + 0.3, map.getZoom() + 1.5), pitch: map.getPitch(), bearing: map.getBearing(), duration: 500 });
    });
    clusterMarkers.push(new maplibregl.Marker({ element: c }).setLngLat(center).addTo(map));
  }
  requestAnimationFrame(declutterLabels);
}

// ---------------------------------------------------------------- 목록
function renderChips() {
  const box = $('categoryChips'); box.textContent = '';
  const all = [{ id: 'all', label: '전체' }, ...state.categories];
  for (const c of all) {
    const b = el('button', 'chip'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.id = c.id;
    if (c.id !== 'all') { b.style.setProperty('--chip-c', CATEGORY_COLOR[c.id]); b.append(el('span', 'dot')); }
    b.append(document.createTextNode(c.label));
    b.addEventListener('click', () => { state.category = c.id; refresh({ fit: true }); b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); });
    box.append(b);
  }
}
function statusNode(f) { return el('span', `status ${f.status}`, STATUS_LABEL[f.status]); }
function renderList() {
  const list = sorted(state.facilities.filter(matches));
  const ul = $('resultList'); ul.textContent = '';
  for (const f of list) {
    const li = el('li'), b = el('button', 'result'); b.type = 'button';
    b.style.setProperty('--pin-c', CATEGORY_COLOR[f.category]);
    const icon = el('span', 'result-icon'); icon.append(iconNode(f));
    const text = el('span', 'result-text'); text.append(el('span', 'result-name', f.name));
    const sub = el('span', 'result-sub', `${categoryLabel(f.category)} · `); sub.append(statusNode(f)); text.append(sub);
    const side = el('span', 'result-side');
    if (f.waitMinutes != null) side.append(el('span', 'wait-badge', `${f.waitMinutes}분`));
    else if (state.user) side.textContent = formatDistance(userDistance(f));
    b.append(icon, text, side);
    b.addEventListener('click', () => select(f.id));
    li.append(b); ul.append(li);
  }
  $('resultCount').textContent = list.length;
  $('emptyState').hidden = list.length > 0;
  ul.hidden = list.length === 0;
  for (const c of $('categoryChips').children) c.setAttribute('aria-selected', String(c.dataset.id === state.category));
  const filterN = state.tags.size + (state.onlyOpen ? 1 : 0) + (state.onlyWait ? 1 : 0);
  $('filterCount').hidden = !filterN; $('filterCount').textContent = filterN;
  $('filterButton').classList.toggle('active', filterN > 0);
  $('searchClear').hidden = !state.query;
  const distOpt = $('sortSelect').querySelector('[value=distance]');
  distOpt.disabled = !state.user;
  $('sortSelect').querySelector('[value=wait]').disabled = !state.facilities.some(f => f.waitMinutes != null);
}

// ---------------------------------------------------------------- 상세
function renderDetail(f) {
  const d = $('detailView');
  d.style.setProperty('--pin-c', CATEGORY_COLOR[f.category]);
  $('detailName').textContent = f.name;
  $('detailCategory').textContent = categoryLabel(f.category);
  const thumb = $('detailThumb'); thumb.textContent = ''; thumb.style.backgroundImage = '';
  if (f.photo) thumb.style.backgroundImage = `url("data/${f.photo}")`; else thumb.append(iconNode(f));
  const dist = userDistance(f);
  const meta = [];
  if (dist != null) meta.push(`${formatDistance(dist)} · 직선 기준 걸어서 약 ${walkMinutes(dist)}분`);
  if (f.hours) meta.push(f.hours);
  $('detailMeta').textContent = meta.join(' · ') || (f.tags.map(t => TAG_LABEL[t]).filter(Boolean).join(' · ') || ' ');
  $('detailStatus').textContent = STATUS_LABEL[f.status];
  $('detailWait').textContent = f.waitMinutes != null ? `약 ${f.waitMinutes}분` : '정보 없음';
  $('detailDistance').textContent = dist != null ? formatDistance(dist) : '내 위치 필요';
  $('detailDescription').textContent = f.description || '시설 안내는 현장 안내판을 확인해 주세요.';
  const img = $('detailPhoto');
  img.hidden = !f.photo; if (f.photo) { img.src = `data/${f.photo}`; img.alt = `${f.name} 사진`; }
  d.scrollTop = 0;
}
function showView(view) {
  state.view = view;
  $('listView').hidden = view !== 'list';
  $('detailView').hidden = view !== 'detail';
  sheet().setAttribute('aria-label', view === 'detail' ? '시설 정보' : '시설 목록');
}

// ---------------------------------------------------------------- 선택
function select(id, { push = true, fly = true } = {}) {
  const f = byId(id); if (!f) return;
  const reselect = state.selected === id;
  state.selected = id;
  renderDetail(f); showView('detail');
  if (!isDesktop()) setSheet(reselect && state.sheet === 'expanded' ? 'expanded' : 'half');
  updatePins();
  if (fly) focusOn(pos(f), Math.max(map.getZoom(), cfg().selectZoom), 550);
  writeHash(push);
  $('detailName').tabIndex = -1;
  setTimeout(() => $('detailName').focus({ preventScroll: true }), 0);
}
function deselect({ push = true } = {}) {
  if (!state.selected) return;
  const prev = state.selected;
  state.selected = null;
  showView('list'); if (!isDesktop()) setSheet('collapsed');
  updatePins(); writeHash(push);
  pins.get(prev)?.el.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- URL 상태 (#f=시설&c=카테고리&q=검색)
function writeHash(push) {
  const p = new URLSearchParams();
  if (state.selected) p.set('f', state.selected);
  if (state.category !== 'all') p.set('c', state.category);
  if (state.query) p.set('q', state.query);
  if (state.tags.size) p.set('t', [...state.tags].join(','));
  const next = p.toString() ? `#${p}` : '';
  if (next === location.hash) return;
  history[push ? 'pushState' : 'replaceState'](null, '', next || location.pathname + location.search);
}
function readHash({ fly = false } = {}) {
  const p = new URLSearchParams(location.hash.slice(1));
  const c = p.get('c');
  state.category = c && state.categories.some(x => x.id === c) ? c : 'all';
  state.query = p.get('q') || ''; $('searchInput').value = state.query;
  state.tags = new Set((p.get('t') || '').split(',').filter(t => TAG_LABEL[t]));
  refresh({ write: false });
  const f = p.get('f');
  if (f && byId(f)) select(f, { push: false, fly }); else deselect({ push: false });
}

// ---------------------------------------------------------------- 갱신
function refresh({ fit = false, write = true } = {}) {
  if (state.selected && !matches(byId(state.selected))) { state.selected = null; showView('list'); }
  renderList();
  updatePins();
  if (fit) fitAll();
  if (write) writeHash(false);
}

// ---------------------------------------------------------------- 필터 다이얼로그
function setupFilter() {
  const dlg = $('filterDialog'), box = $('tagOptions');
  const present = Object.keys(TAG_LABEL).filter(t => state.facilities.some(f => f.tags.includes(t)));
  for (const t of present) {
    const l = el('label', 'option'), i = el('input'); i.type = 'checkbox'; i.value = t;
    l.append(i, el('span', null, TAG_LABEL[t])); box.append(l);
  }
  $('optWait').closest('label').hidden = !state.facilities.some(f => f.waitMinutes != null);
  const load = () => {
    for (const i of box.querySelectorAll('input')) i.checked = state.tags.has(i.value);
    $('optOpen').checked = state.onlyOpen; $('optWait').checked = state.onlyWait;
  };
  $('filterButton').addEventListener('click', () => { load(); dlg.showModal(); });
  $('filterClear').addEventListener('click', () => { for (const i of dlg.querySelectorAll('input')) i.checked = false; });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'apply') return;
    state.tags = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
    state.onlyOpen = $('optOpen').checked; state.onlyWait = $('optWait').checked;
    refresh({ fit: true });
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close('cancel'); });
}

// ---------------------------------------------------------------- 내 위치 (버튼을 누를 때만, 저장·전송 없음)
let toastTimer = 0;
function toast(msg, ms = 3200) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function locate() {
  const btn = $('locateButton');
  if (!window.isSecureContext) return toast('내 위치는 HTTPS 주소에서만 확인할 수 있어요.');
  if (!navigator.geolocation) return toast('이 브라우저는 위치 확인을 지원하지 않아요.');
  btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition(pos => {
    btn.classList.remove('busy'); btn.classList.add('on');
    state.user = [pos.coords.longitude, pos.coords.latitude];
    if (!userMarker) { const d = el('div', 'user-dot'); d.setAttribute('aria-label', '내 위치'); userMarker = new maplibregl.Marker({ element: d }).setLngLat(userPos()).addTo(map); }
    else userMarker.setLngLat(userPos());
    const far = distanceM(state.user, state.center);
    userMarker.getElement().hidden = state.mode === 'illus' && far > CONFIG.farFromParkM; // 그림 밖 위치는 찍지 않는다
    if (far > CONFIG.farFromParkM) toast(`공원에서 약 ${formatDistance(far)} 떨어져 있어요. 거리는 직선 기준이에요.`);
    else { focusOn(userPos(), Math.max(map.getZoom(), cfg().selectZoom), 600); if (pos.coords.accuracy > 50) toast(`위치 정확도가 낮아요(약 ${Math.round(pos.coords.accuracy)}m).`); }
    if (state.sort === 'name') { state.sort = 'distance'; $('sortSelect').value = 'distance'; }
    renderList(); if (state.selected) renderDetail(byId(state.selected));
  }, err => {
    btn.classList.remove('busy');
    toast(err.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.' : err.code === 3 ? '위치를 찾는 데 시간이 오래 걸려요. 다시 시도해 주세요.' : '지금은 위치를 확인할 수 없어요.');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
}

// ---------------------------------------------------------------- 시작
async function main() {
  await loadData();
  renderChips(); setupFilter(); setupSheetDrag();

  map = new maplibregl.Map({
    container: 'map', style: buildStyle(), center: state.center, zoom: 15, minZoom: 10,
    pitchWithRotate: false, dragRotate: false, touchPitch: false, attributionControl: false
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left'); // 오른쪽 지도 버튼과 겹치지 않게 왼쪽 아래
  window.ecoMap = map; // 디버그·검사용
  for (const f of state.facilities) createPin(f);
  // 기울기 50°에서는 지도 엔진의 수평선이 화면 밖이라, 화면 위쪽에 하늘 그라데이션을 직접 깐다.
  map.getCanvas().after($('sky')); // 캔버스 바로 위, 핀 아래에 놓는다.
  const updateSky = () => { $('sky').style.opacity = String(Math.min(1, map.getPitch() / CONFIG.pitch3d)); };
  map.on('pitch', updateSky);
  map.on('zoom', updateLabels);
  map.on('moveend', () => { updatePins(); declutterLabels(); });
  map.on('click', () => { if (state.selected) deselect(); else if (state.sheet !== 'collapsed' && !isDesktop()) setSheet('collapsed'); });
  map.on('dragstart', () => { if (!isDesktop() && state.sheet === 'expanded') setSheet(state.selected ? 'half' : 'collapsed'); });

  $('zoomIn').addEventListener('click', () => map.zoomIn({ duration: 250 }));
  $('zoomOut').addEventListener('click', () => map.zoomOut({ duration: 250 }));
  $('resetView').addEventListener('click', () => { deselect(); fitAll(); });
  $('locateButton').addEventListener('click', locate);
  $('detailBack').addEventListener('click', () => { deselect(); setSheet('half'); });
  $('detailClose').addEventListener('click', () => deselect());
  $('actionCenter').addEventListener('click', () => { const f = byId(state.selected); if (f) { setSheet('collapsed'); focusOn(pos(f), Math.max(map.getZoom(), cfg().detailZoom), 500); } });
  $('actionShare').addEventListener('click', async () => {
    const f = byId(state.selected); if (!f) return;
    const url = location.href;
    try { if (navigator.share) await navigator.share({ title: f.name, text: `에코월드 ${f.name}`, url }); else { await navigator.clipboard.writeText(url); toast('링크를 복사했어요.'); } } catch { /* 사용자가 취소 */ }
  });
  $('emptyReset').addEventListener('click', () => {
    state.category = 'all'; state.query = ''; state.tags.clear(); state.onlyOpen = state.onlyWait = false;
    $('searchInput').value = ''; refresh({ fit: true });
  });
  let searchTimer = 0;
  $('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value.trim(); refresh(); if (!state.selected && !isDesktop() && state.query) setSheet('half'); }, 120);
  });
  $('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = sorted(state.facilities.filter(matches))[0]; if (first) { e.target.blur(); select(first.id); } } });
  $('searchClear').addEventListener('click', () => { $('searchInput').value = ''; state.query = ''; refresh(); $('searchInput').focus(); });
  $('sortSelect').addEventListener('change', e => { state.sort = e.target.value; renderList(); });
  addEventListener('popstate', () => readHash({ fly: true }));
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || $('filterDialog').open) return;
    if (state.selected) deselect(); else if (state.sheet !== 'collapsed') setSheet('collapsed');
  });
  let resizeTimer = 0;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => setSheet(state.sheet, false), 80); });

  try { const v = localStorage.getItem('eco-view'); if (v === '3d' || (v === 'illus' && window.ECO_ILLUS)) state.mode = v; } catch { /* 기본 화면 */ }
  $('viewToggle').hidden = !window.ECO_ILLUS;
  $('viewToggle').addEventListener('click', () => applyMode(state.mode === 'illus' ? '3d' : 'illus'));

  setSheet('collapsed', false);
  map.once('load', () => {
    applyMode(state.mode);
    updateSky();
    updateLabels();
    readHash({ fly: true });
    // 공유 링크에 필터가 있으면 중심부 대신 그 결과에 맞춘다.
    if (!state.selected && (state.category !== 'all' || state.query || state.tags.size)) fitAll(false);
    document.documentElement.dataset.ready = 'true';
  });
}
main().catch(err => { console.error(err); toast('시설 정보를 불러오지 못했어요. 새로고침해 주세요.', 8000); });
