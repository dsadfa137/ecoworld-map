const fs=require('fs'),vm=require('vm'),path=require('path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const config=JSON.parse(read('height-config.json'));
const original=read('../ecoworld-visitor-v5/index.html');
const data=JSON.parse(original.match(/const EMBEDDED_GEOJSON = (.*);/)[1]);
const previous=JSON.parse(original.match(/const VISUAL_MODELS=(.*);/)[1]);
// Keep museum and main gate identical. Only replace the Eco Town illustration.
const art=previous.features.filter(f=>!f.properties.part.startsWith('eco ')&&f.properties.part!=='solar panels');
const round=n=>Math.round(n*1e9)/1e9;
const center=r=>r.slice(0,-1).reduce((s,p)=>[s[0]+p[0]/(r.length-1),s[1]+p[1]/(r.length-1)],[0,0]);
const scale=(r,s)=>{const c=center(r);return r.map(p=>[c[0]+(p[0]-c[0])*s,c[1]+(p[1]-c[1])*s]);};
const at=(c,x,y)=>[c[0]+x/(111195*Math.cos(c[1]*Math.PI/180)),c[1]+y/111195];
function solid(id,r,base,height,color,part,meta={}){art.push({type:'Feature',properties:{id,base:round(base),height:round(height),color,part,usage:'visual_only',survey_verified:false,source:config.source,...meta},geometry:{type:'Polygon',coordinates:[r.map(p=>p.map(round))]}});}
function box(id,c,x,y,w,h,base,height,color,part,meta){const p=(dx,dy)=>at(c,x+dx,y+dy);solid(id,[p(-w/2,-h/2),p(w/2,-h/2),p(w/2,h/2),p(-w/2,h/2),p(-w/2,-h/2)],base,height,color,part,meta);}
const levels=[];
for(const b of config.buildings){
 const r=data.features.find(f=>f.properties.id===b.id).geometry.coordinates[0];
 const top=b.base_m+b.floors*config.floor_height_m,rim=top+config.roof_rim_m,roof=rim+config.roof_finish_m;
 const meta={building_id:b.id,label:b.label,floors:b.floors,floor_height_m:config.floor_height_m,ground_base_m:b.base_m};
 if(b.base_m>0)solid(b.id+'-plinth',r,0,b.base_m,'#b9b5a2','eco plinth',meta);
 solid(b.id+'-wall',r,b.base_m,top,'#cfd7c9','eco walls',meta);
 for(let n=1;n<b.floors;n++){let level=b.base_m+n*config.floor_height_m;solid(b.id+'-floor-'+n,scale(r,1.002),level-.09,level+.09,'#aebbb4','eco floor band',meta);}
 solid(b.id+'-rim',scale(r,1.015),top,rim,'#f7f2de','eco roof edge',meta);
 solid(b.id+'-roof',scale(r,.79),rim,roof,b.roof==='solar'?'#788f97':'#83a857','eco roof',meta);
 if(b.roof==='solar'){const c=center(r);for(let i=0;i<4;i++){const x=-10+i*6;box(b.id+'-panel-support-'+i,c,x,0,3.8,13,roof,roof+config.panel_support_m,'#52646b','solar support',meta);box(b.id+'-panel-'+i,c,x,0,3.8,13,roof+config.panel_support_m,roof+config.panel_support_m+config.panel_thickness_m,'#486d82','solar panels',meta);}}
 levels.push({...b,wall_top_m:round(top),rim_top_m:round(rim),roof_top_m:round(roof),maximum_top_m:round(roof+(b.roof==='solar'?config.panel_support_m+config.panel_thickness_m:0))});
}
// Short, flat extrusions approximate the rise. These are NOT walkable routing features.
const t=config.terrace,dx=(t.end[0]-t.start[0])*111195*Math.cos(t.start[1]*Math.PI/180),dy=(t.end[1]-t.start[1])*111195,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
const point=(d,side)=>at(t.start,ux*d-uy*side,uy*d+ux*side);
function strip(id,from,to,width,height,color,part,side=0){const a=side-width/2,b=side+width/2;solid('terrace-'+id,[point(from,a),point(to,a),point(to,b),point(from,b),point(from,a)],0,height,color,part,{height_source:'visual estimate',routing_enabled:false});}
strip('entry',0,7,t.width_m,t.entry_m,'#e2d7b9','eco entry landing');
for(let i=0;i<t.lower_steps;i++)strip('lower-'+i,7+i*.6,7+(i+1)*.6,t.width_m,t.entry_m+(t.garden_m-t.entry_m)*(i+1)/t.lower_steps,i%2?'#dbd1b4':'#eee4cc','eco lower step');
strip('garden',7+t.lower_steps*.6,28,t.width_m,t.garden_m,'#e8dec4','eco garden walk');
for(let i=0;i<t.upper_steps;i++)strip('upper-'+i,28+i*.6,28+(i+1)*.6,t.width_m,t.garden_m+(t.upper_m-t.garden_m)*(i+1)/t.upper_steps,i%2?'#dbd1b4':'#eee4cc','eco upper step');
strip('upper-landing',28+t.upper_steps*.6,length,t.width_m,t.upper_m,'#e2d7b9','eco upper landing');
for(const side of [-4,4]){strip('bed-base-'+side,15,23,2,t.garden_m+.25,'#c7c0a7','eco planter edge',side);strip('bed-green-'+side,15.2,22.8,1.7,t.garden_m+.3,'#87a960','eco raised garden',side);}
const visual={type:'FeatureCollection',metadata:{...config,note:'Visual models only; no GPS or routing changes'},features:art};
let html=original.replace(/const VISUAL_MODELS=.*;/,'const ECOTOWN_HEIGHT_CONFIG='+JSON.stringify(config)+';\nconst VISUAL_MODELS='+JSON.stringify(visual)+';');
html=html.replace('방문객 지도 v5 · 사진 기반 입체 외형 시제품','방문객 지도 v5.1 · 에코타운 층고·단차 반영');
html=html.replace('<details><summary>아이콘·경로 범례</summary>','<button id="ecoHeightView" class="secondary">에코타운 높이 비교 보기</button><p>에코타운 메인동 3층 · 녹색 지붕 3개 동 2층. 층고 4m와 정원 단차는 시각적 추정값입니다.</p><details><summary>아이콘·경로 범례</summary>');
html=html.replace("$('allRoutes').onchange=updateRouteView;","$('ecoHeightView').onclick=()=>{if(!ready)return;$('settings').close();closeFacility(false);$('follow').checked=false;updateLocateState();map.easeTo({center:[128.05972,36.65462],zoom:18.45,pitch:60,bearing:-25,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:800});};\n$('allRoutes').onchange=updateRouteView;");
new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
for(const k of ['MAPBOX_PUBLIC_TOKEN','EMBEDDED_GEOJSON'])if(original.match(new RegExp('const '+k+' = (.*);'))[1]!==html.match(new RegExp('const '+k+' = (.*);'))[1])throw Error('Changed source '+k);
fs.writeFileSync(path.join(__dirname,'index.html'),html);
fs.writeFileSync(path.join(__dirname,'visual-models.geojson'),JSON.stringify(visual,null,2));
fs.writeFileSync(path.join(__dirname,'height-summary.json'),JSON.stringify(levels,null,2));
console.log(JSON.stringify({solids:art.length,buildings:levels.map(x=>({name:x.label,floors:x.floors,wallTop:x.wall_top_m,roofTop:x.roof_top_m,maximum:x.maximum_top_m}))},null,2));
