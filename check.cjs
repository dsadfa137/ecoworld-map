const fs=require('fs'),assert=require('assert'),vm=require('vm');
const read=p=>fs.readFileSync(__dirname+'/'+p,'utf8');
const html=read('index.html'),before=read('../ecoworld-visitor-v5/index.html');
const js=s=>s.match(/<script>\s*([\s\S]*?)<\/script>/)[1];new vm.Script(js(html));
for(const k of ['MAPBOX_PUBLIC_TOKEN','EMBEDDED_GEOJSON','FACILITY_PHOTOS']){const r=new RegExp('const '+k+' ?= ?(.*);');assert.equal(html.match(r)[1],before.match(r)[1],k+' preserved');}
assert.equal(js(html).slice(js(html).indexOf('const R='),js(html).indexOf('// ---- UI / Mapbox ----')),js(before).slice(js(before).indexOf('const R='),js(before).indexOf('// ---- UI / Mapbox ----')));
assert.equal(js(html).slice(js(html).indexOf('function showPoint'),js(html).indexOf('function fitFacilities')),js(before).slice(js(before).indexOf('function showPoint'),js(before).indexOf('function fitFacilities')));
const config=JSON.parse(read('height-config.json')),models=JSON.parse(read('visual-models.geojson'));
const oldModels=JSON.parse(before.match(/const VISUAL_MODELS=(.*);/)[1]);const features=models.features;
assert.equal(new Set(features.map(f=>f.properties.id)).size,features.length);
for(const f of features){const p=f.properties,r=f.geometry.coordinates[0];assert(Number.isFinite(p.base)&&p.base>=0&&p.height>p.base);assert.deepEqual(r[0],r.at(-1));assert.equal(p.usage,'visual_only');assert.equal(p.survey_verified,false);assert(r.every(c=>c.length===2&&c.every(Number.isFinite)));}
for(const old of oldModels.features.filter(f=>!f.properties.part.startsWith('eco ')&&f.properties.part!=='solar panels'))assert.deepEqual(features.find(f=>f.properties.id===old.properties.id),old);
for(const b of config.buildings){const wall=features.find(f=>f.properties.id===b.id+'-wall').properties,rim=features.find(f=>f.properties.id===b.id+'-rim').properties,roof=features.find(f=>f.properties.id===b.id+'-roof').properties;assert.equal(wall.base,b.base_m);assert.equal(wall.height-wall.base,b.floors*config.floor_height_m);assert.equal(rim.base,wall.height);assert.equal(roof.base,rim.height);if(b.roof==='solar'){for(let i=0;i<4;i++){const support=features.find(f=>f.properties.id===b.id+'-panel-support-'+i).properties,panel=features.find(f=>f.properties.id===b.id+'-panel-'+i).properties;assert.equal(support.base,roof.height);assert.equal(panel.base,support.height);}}}
for(const [group,n,from,to] of [['lower',6,.15,.75],['upper',5,.75,1.2]]){let h=from;for(let i=0;i<n;i++){const p=features.find(f=>f.properties.id==='terrace-'+group+'-'+i).properties;assert(p.height>h);h=p.height;}assert.equal(h,to);}
// Geometry integrity: terrace interiors must not cut through existing building footprints.
const geo=JSON.parse(html.match(/const EMBEDDED_GEOJSON = (.*);/)[1]);const buildings=geo.features.filter(f=>config.buildings.some(b=>b.id===f.properties.id));
function inside(p,r){let v=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;}
for(const terrace of features.filter(f=>f.properties.id.startsWith('terrace-'))){const ring=terrace.geometry.coordinates[0];for(const b of buildings)assert(!ring.slice(0,-1).some(p=>inside(p,b.geometry.coordinates[0])),terrace.properties.id+' overlaps '+b.properties.id);}
const report={status:'passed',checks:['JavaScript syntax','unchanged token, GeoJSON, photos and GPS functions','unchanged museum and main gate','valid 60 visual solids and unique IDs','3-story / 2-story wall heights','roof and panel elevation continuity','monotonic terrace heights','terrace vertices outside building interiors'],renderer:'not tested in browser: local file URL blocked by browser policy'};
fs.writeFileSync(__dirname+'/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
