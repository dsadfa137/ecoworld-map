const fs=require('fs'),vm=require('vm'),path=require('path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const cfg=JSON.parse(read('model-config.json')),original=read('../ecoworld-visitor-v5-1/index.html');
const data=JSON.parse(original.match(/const EMBEDDED_GEOJSON = (.*);/)[1]);
const old=JSON.parse(original.match(/const VISUAL_MODELS=(.*);/)[1]);
const other=old.features.filter(f=>!f.properties.part.startsWith('eco ')&&!f.properties.part.startsWith('solar'));
const [lng0,lat0]=cfg.origin,MX=111195*Math.cos(lat0*Math.PI/180),MY=111195;
const local=p=>[(p[0]-lng0)*MX,(p[1]-lat0)*MY],geo=p=>[+(lng0+p[0]/MX).toFixed(9),+(lat0+p[1]/MY).toFixed(9)];
const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t),dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function ring(points,ccw=true){let r=points.map(p=>[...p]);if(dist(r[0],r.at(-1))<1e-8)r.pop();const area=r.reduce((s,a,i)=>{let b=r[(i+1)%r.length];return s+a[0]*b[1]-b[0]*a[1]},0);if((area>0)!==ccw)r.reverse();return [...r,r[0]];}
const center=r=>r.reduce((s,p)=>[s[0]+p[0]/r.length,s[1]+p[1]/r.length],[0,0]);
const scale=(r,s)=>{let c=center(r);return r.map(p=>mix(c,p,s))};
const polys=[],lines=[],nodes=[],buildingRings={};const offset=cfg.datum.render_offset_m;
function polygon(id,r,base,top,color,band,part,extras={},holes=[]){polys.push({type:'Feature',id,properties:{id,type:'eco_structure',part,band,color,annotation_color:({B1:'#26a776',G1:'#dc514c',UPPER:'#efc84b',WALK:'#355ed0',TERRAIN:'#a7b583',ROOF:'#cdd7aa'}[band]||color),base_m:base+offset,top_m:top+offset,relative_base_m:base,relative_top_m:top,base:base+offset,height:top+offset,usage:'visual_only',survey_verified:false,routing_enabled:false,...extras},geometry:{type:'Polygon',coordinates:[ring(r).map(geo),...holes.map(h=>ring(h,false).map(geo))]}});}
function edgeStrip(r,index,width,outside){let a=r[index],b=r[(index+1)%r.length],c=center(r),mid=mix(a,b,.5),d=dist(a,b),n=[-(b[1]-a[1])/d,(b[0]-a[0])/d];if((c[0]-mid[0])*n[0]+(c[1]-mid[1])*n[1]<0)n=n.map(v=>-v);if(outside)n=n.map(v=>-v);return [a,b,[b[0]+n[0]*width,b[1]+n[1]*width],[a[0]+n[0]*width,a[1]+n[1]*width]];}
function outsideDoor(r,index){const s=edgeStrip(r,index,1.6,true);return mix(s[2],s[3],.5);}
for(const b of cfg.buildings){
 const r=data.features.find(f=>f.properties.id===b.id).geometry.coordinates[0].slice(0,-1).map(local);buildingRings[b.id]=r;
 const meta={building_id:b.id,building_label:b.label,above_ground_floors:b.above_ground_floors};
 // Soil-colored buried mass has independent geometry and can be excluded from a cutaway.
 polygon(b.id+'-buried',r,-4,0,'#b5b39b','TERRAIN','eco buried basement mass',{...meta,exposure:'buried_or_unconfirmed'});
 if(b.exposed_basement){const facade=edgeStrip(r,b.courtyard_edge,.6,true);polygon(b.id+'-b1',facade,-4,0,'#629a96','B1','eco exposed basement facade',{...meta,exposure:'photo_interpreted'});const a=facade[0],z=facade[1];for(let j=0;j<=5;j++){const p=mix(a,z,j/5);polygon(b.id+'-b1-column-'+j,[[p[0]-.22,p[1]-.22],[p[0]+.22,p[1]-.22],[p[0]+.22,p[1]+.22],[p[0]-.22,p[1]+.22]],-4,0,'#d8ded1','B1','eco basement mullion',meta);}}
 polygon(b.id+'-g1',r,0,4,'#d5dbce','G1','eco ground floor',meta);
 for(let f=2;f<=b.above_ground_floors;f++){const u=scale(r,f===2?.96:.91);polygon(b.id+'-floor-'+f,u,(f-1)*4,f*4,b.roof==='solar'?'#a7bfc0':'#d4dbce','UPPER','eco upper floor',{...meta,floor:f});}
 const top=b.above_ground_floors*4,roofRing=scale(r,b.above_ground_floors===3?.94:.99);
 polygon(b.id+'-rim',roofRing,top,top+.32,'#f1f0dc','ROOF','eco roof rim',meta);
 polygon(b.id+'-roof',scale(roofRing,.82),top+.32,top+.5,b.roof==='solar'?'#78949b':'#8faa63','ROOF','eco roof finish',meta);
 if(b.roof==='solar'){const c=center(r);for(let j=0;j<b.solar_racks;j++){let x=c[0]+(j-1)*7;polygon(b.id+'-solar-'+j,[[x-2.2,c[1]-6.5],[x+2.2,c[1]-6.5],[x+2.2,c[1]+6.5],[x-2.2,c[1]+6.5]],top+.5,top+.67,'#476f83','ROOF','solar panels',meta);}}
 // Short soil shoulders on non-courtyard sides conceal part of the basement.
 for(let i=0;i<r.length;i++)if(i!==b.courtyard_edge)polygon(b.id+'-soil-'+i,edgeStrip(r,i,2,true),-4,0,'#aebc8b','TERRAIN','eco retained soil shoulder',meta);
}
// Raised ground around an actual polygon hole: the hole remains at B1 render height 0.
const triangleOuter=[[-20,24],[-24,-5],[20,5]],triangleHole=[[-16,18],[-18,1],[10,6]];
polygon('central-sunken-terrain',triangleOuter,-4,0,'#9cad74','TERRAIN','eco central ground with sunken hole',{},[triangleHole]);
polygon('central-sunken-floor',triangleHole,-4,-3.88,'#c8d2af','B1','eco sunken courtyard floor');
for(let i=0;i<3;i++)polygon('central-retaining-'+i,edgeStrip(triangleHole,i,.4,true),-4,0,'#68958a','B1','eco exposed retaining wall');
// Lower garden is an independent lower-level platform, not raised to ground-floor height.
const lowerCourt=[[28,-17],[56,-9],[69,-20],[52,-63],[47,-58],[28,-30]];
polygon('lower-courtyard-floor',lowerCourt,-4,-3.88,'#e0d8bd','B1','eco lower sunken garden');
const levelOf=z=>z===-4?'B1':z===0?'G1':'transition';
function node(id,p,z,role){const n={type:'Feature',id,properties:{id,type:'walk_node',level:levelOf(z),relative_height_m:z,render_height_m:z+offset,role,survey_verified:false},geometry:{type:'Point',coordinates:geo(p)}};nodes.push(n);return {id,p,z};}
function link(id,a,b,{transition=false,role='pedestrian_reference'}={}){const len=dist(a.p,b.p);lines.push({type:'Feature',id,properties:{id,type:'review_walkway',from_node:a.id,to_node:b.id,from_level:levelOf(a.z),to_level:levelOf(b.z),relative_start_m:a.z,relative_end_m:b.z,render_z_m:(a.z+b.z)/2+offset+.15,length_m:+len.toFixed(2),vertical_transition:transition,access:'unknown',role,routing_enabled:false,survey_verified:false,source:'annotated aerial photo interpretation; not surveyed'},geometry:{type:'LineString',coordinates:[geo(a.p),geo(b.p)]}});}
const entryPoint=local(data.features.find(f=>f.properties.source_name==='에코타운 정문').geometry.coordinates);
const entry=node('entry-b1',entryPoint,-4,'existing KML entrance anchor');
const lower=node('lower-court',[43,-27],-4,'lower courtyard junction');
const frontDoor=node('front-door-b1',outsideDoor(buildingRings[cfg.buildings[0].id],0),-4,'inferred basement door');
const eastDoor=node('east-door-b1',outsideDoor(buildingRings[cfg.buildings[2].id],3),-4,'inferred basement door');
const g1=node('upper-junction',[0,-12],0,'upper walkway junction');
const westJ=node('west-junction',[-22,8],0,'walkway bend');
const westDoor=node('west-door',outsideDoor(buildingRings[cfg.buildings[1].id],1),0,'inferred ground floor door');
const mainDoor=node('main-door',outsideDoor(buildingRings[cfg.buildings[3].id],2),0,'inferred ground floor door');
const eastJ=node('east-junction',[22,1],0,'upper walkway junction');
const eastGround=node('east-door-g1',outsideDoor(buildingRings[cfg.buildings[2].id],4),0,'inferred ground floor door');
const back=node('rear-path',[25,33],0,'rear path connection unverified');
link('entry-lower',entry,lower);link('lower-front',lower,frontDoor);link('lower-east',lower,eastDoor);
link('g1-west',g1,westJ);link('west-entrance-link',westJ,westDoor);link('west-main',westJ,mainDoor);link('g1-east',g1,eastJ);link('east-door',eastJ,eastGround);link('east-rear',eastJ,back);
// Split a proposed vertical connection, retaining shared endpoints and level metadata.
let last=entry;for(let i=1;i<=16;i++){const next=i===16?g1:node('transition-'+i,mix(entry.p,g1.p,i/16),-4+4*i/16,'inferred stepped connection');link('transition-link-'+i,last,next,{transition:true,role:'stairs_assumed_for_visual_review'});last=next;}
// Walk ribbons use the same centerlines. Their blue highlight floats just above the ribbon.
for(const l of lines){const a=local(l.geometry.coordinates[0]),b=local(l.geometry.coordinates[1]),d=dist(a,b),n=[-(b[1]-a[1])/d*1.25,(b[0]-a[0])/d*1.25],r=[[a[0]+n[0],a[1]+n[1]],[b[0]+n[0],b[1]+n[1]],[b[0]-n[0],b[1]-n[1]],[a[0]-n[0],a[1]-n[1]]],top=(l.properties.relative_start_m+l.properties.relative_end_m)/2+.1;polygon(l.id+'-deck',r,-4,top,'#d9d5c2','WALK','eco walkway surface',{link_id:l.id});}
const visual={type:'FeatureCollection',metadata:cfg,features:[...other,...polys]},walks={type:'FeatureCollection',metadata:{georeferenced:false,routing_enabled:false},features:lines},network={type:'FeatureCollection',features:[...nodes,...lines]};
let html=original.replace(/const ECOTOWN_HEIGHT_CONFIG=.*;/,'const ECOTOWN_HEIGHT_CONFIG='+JSON.stringify(cfg)+';');
html=html.replace(/const VISUAL_MODELS=.*;/,'const VISUAL_MODELS='+JSON.stringify(visual)+';\nconst ECOTOWN_WALKWAYS='+JSON.stringify(walks)+';');
const layerCode=`function addVisualModels(){map.addSource('visual-models',{type:'geojson',data:VISUAL_MODELS});map.addLayer({id:'landmark-models',type:'fill-extrusion',source:'visual-models',paint:{'fill-extrusion-color':['get','color'],'fill-extrusion-base':['get','base'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':1}});map.addSource('ecotown-walkways',{type:'geojson',data:ECOTOWN_WALKWAYS});map.addLayer({id:'ecotown-blue-walkways',type:'line',source:'ecotown-walkways',layout:{'line-elevation-reference':'ground','line-z-offset':['get','render_z_m'],'line-cap':'round','line-join':'round'},paint:{'line-color':'#355ed0','line-width':3,'line-opacity':.9}});}`;
html=html.replace(/function addVisualModels\(\)\{[^\n]*/,layerCode);
const ids=cfg.buildings.map(b=>b.id);
html=html.replace("id:'eco-buildings',type:'fill-extrusion',source:'eco',filter:['==',['get','type'],'building']","id:'eco-buildings',type:'fill-extrusion',source:'eco',filter:['all',['==',['get','type'],'building'],['!',['in',['get','id'],['literal',"+JSON.stringify(ids)+"]]]]");
html=html.replace('방문객 지도 v5.1 · 에코타운 층고·단차 반영','방문객 지도 v5.2 · 선큰·층별 구조 검토');
html=html.replace('에코타운 높이 비교 보기','에코타운 선큰 구조 보기').replace('에코타운 메인동 3층 · 녹색 지붕 3개 동 2층. 층고 4m와 정원 단차는 시각적 추정값입니다.','지하층·지상 1층·상부층을 분리했습니다. 렌더링 기준 B1=0m, 지상 바닥=4m이며 실제 층고·고도는 미검증입니다. 파란 선은 사진 해석에 따른 검토 동선입니다.');
html=html.replace('<details><summary>아이콘·경로 범례</summary>','<label><input id="ecoColorBands" type="checkbox"> 사진의 층 구분색 보기</label><label><input id="ecoWalks" type="checkbox" checked> 파란 검토 동선 보기</label><p>초록: 노출 지하층 · 빨강: 지상 1층 · 노랑: 2~3층 · 파랑: 검토 통행로. 매립부·지형은 중립색입니다.</p><details><summary>아이콘·경로 범례</summary>');
html=html.replace("$('ecoHeightView').onclick=", "$('ecoColorBands').onchange=()=>{if(ready)map.setPaintProperty('landmark-models','fill-extrusion-color',$('ecoColorBands').checked?['coalesce',['get','annotation_color'],['get','color']]:['get','color']);};\n$('ecoWalks').onchange=()=>{if(ready)map.setLayoutProperty('ecotown-blue-walkways','visibility',$('ecoWalks').checked?'visible':'none');};\n$('ecoHeightView').onclick=");
new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
const standaloneLayer=layerCode.replace('function addVisualModels(){','export function addEcotownLayers(map, VISUAL_MODELS, ECOTOWN_WALKWAYS){').replaceAll(';map.',';\n  map.');
for(const [file,value] of Object.entries({'index.html':html,'ecotown-structures.geojson':JSON.stringify({type:'FeatureCollection',metadata:cfg,features:polys},null,2),'visual-models.geojson':JSON.stringify(visual,null,2),'ecotown-walkways.geojson':JSON.stringify(walks,null,2),'review-network.geojson':JSON.stringify(network,null,2),'mapbox-layers.js':standaloneLayer}))fs.writeFileSync(path.join(__dirname,file),value);
console.log(JSON.stringify({structural_features:polys.length,lines:lines.length,nodes:nodes.length,render_base:'B1=0; G1=4',geometry_status:'photo-interpreted, not surveyed'}));

