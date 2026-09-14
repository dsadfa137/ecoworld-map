const fs=require('fs'),vm=require('vm'),sharp=require('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=__dirname+'/../';
async function build(){
let html=fs.readFileSync(root+'ecoworld-kml-update/index.html','utf8');
const data=JSON.parse(html.match(/const EMBEDDED_GEOJSON = (.*);/)[1]);
const photos={};for(const [key,file] of Object.entries({museum:'석탄박물관.jpg',eco:'에코타운 전경.jpg',gate:'에코월드 정문광장.jpg'})){photos[key]='data:image/jpeg;base64,'+(await sharp(root+file).rotate().resize({width:900,withoutEnlargement:true}).jpeg({quality:72}).toBuffer()).toString('base64');}
const art=[];let num=0;const center=r=>r.slice(0,-1).reduce((s,p)=>[s[0]+p[0]/(r.length-1),s[1]+p[1]/(r.length-1)],[0,0]);
const scale=(r,s)=>{let c=center(r);return r.map(p=>[c[0]+(p[0]-c[0])*s,c[1]+(p[1]-c[1])*s]);};
function add(r,base,height,color,part){art.push({type:'Feature',properties:{id:'art-'+(++num),base,height,color,part,source:'photo-inspired procedural illustration',survey_verified:false,usage:'visual_only'},geometry:{type:'Polygon',coordinates:[r]}});}
function box(c,x,y,w,h,base,top,color,part){const p=(dx,dy)=>[c[0]+(x+dx)/89400,c[1]+(y+dy)/111195];add([p(-w/2,-h/2),p(w/2,-h/2),p(w/2,h/2),p(-w/2,h/2),p(-w/2,-h/2)],base,top,color,part);}
const museum=data.features.find(f=>f.properties.id==='osm-w561140238-building').geometry.coordinates[0];
add(museum,0,12,'#d8c5a7','museum stone body');add(scale(museum,1.01),10.5,12,'#97b8b4','museum upper glazing');add(scale(museum,1.1),12,12.8,'#f5f3df','museum overhanging roof');add(scale(museum,.88),12.8,13,'#dfe6cd','museum roof');
const ecoIds=['osm-w1545943901-building','osm-w1545943902-building','osm-w1545943903-building','osm-w1545943904-building'];
for(const [i,id] of ecoIds.entries()){const r=data.features.find(f=>f.properties.id===id).geometry.coordinates[0];add(r,0,8,'#d7dfce','eco walls');add(scale(r,1.015),7.3,8.2,'#f7f2de','eco roof edge');add(scale(r,.79),8.2,8.45,i===3?'#788f97':'#83a857','eco roof');if(i===3){const c=center(r);for(let n=0;n<4;n++)box(c,-10+n*6,0,3.8,13,8.5,8.65,'#486d82','solar panels');}}
const gate=data.features.find(f=>f.properties.source_name==='매표소').geometry.coordinates;
box(gate,0,0,10,6,0,3.4,'#f1e6be','ticket office');box(gate,0,0,27,10,5.4,6,'#dbe8a4','gate canopy');
for(let i=0;i<8;i++)box(gate,-11+i*3.15,-2,0.5,0.5,0,5.5,['#f3c65e','#88a768','#e8964c','#528e82'][i%4],'gate colored column');
const visual={type:'FeatureCollection',features:art};fs.writeFileSync(__dirname+'/visual-models.geojson',JSON.stringify(visual,null,2));
const injected=`const FACILITY_PHOTOS=${JSON.stringify(photos)};
const VISUAL_MODELS=${JSON.stringify(visual)};
function photoFor(name){if(/석탄박물관/.test(name))return FACILITY_PHOTOS.museum;if(/에코타운/.test(name))return FACILITY_PHOTOS.eco;if(name==='정문'||name==='매표소')return FACILITY_PHOTOS.gate;return null;}
function showPhoto(f){const image=$('facilityPhoto'),src=photoFor(f.properties.source_name||f.properties.name);image.hidden=!src;document.querySelector('.photo-placeholder').hidden=!!src;if(src){image.src=src;image.alt=f.properties.name+' 외관 참고 사진';}else image.removeAttribute('src');}
function updateRouteView(){if(!ready)return;const f=selectedFacility;const n=f?.properties.source_name;const destination={'문경석탄박물관':'석탄박물관','자이언트포레스트':'자이언트포레스트','에코타운':'에코타운 정문','에코타운 정문':'에코타운 정문','물놀이장':'물놀이장','가은모노레일':'가은모노레일','꼬마열차':'꼬마열차','탄광사택촌':'탄광사택촌','은성갱도 입구':'은성갱도','은성갱도 출구':'탄광사택촌','에코카페 입구':'에코카페 입구','서바이벌체험장 입구':'서바이벌체험장','1세트장':'1세트장','2세트장':'2세트장','거미열차':'거미열차'}[n];const ids=destination?data.features.filter(r=>r.properties.type==='reference_path'&&r.properties.mode==='pedestrian'&&r.properties.source_name.includes('에서')&&r.properties.source_name.split('에서').at(-1).includes(destination+'까지')).map(r=>r.properties.id):[];map.setFilter('kml-routes',['all',['==',['get','type'],'reference_path'],['in',['get','id'],['literal',ids]]]);map.setLayoutProperty('all-kml-routes','visibility',$('allRoutes').checked?'visible':'none');$('routeNote').textContent=f?(ids.length?'선택 시설의 KML 참고 동선 · 현재 위치에서 계산한 길찾기가 아닙니다.':'이 시설에 연결된 참고 경로가 없습니다.') : '';}
function addVisualModels(){map.addSource('visual-models',{type:'geojson',data:VISUAL_MODELS});map.addLayer({id:'landmark-models',type:'fill-extrusion',source:'visual-models',paint:{'fill-extrusion-color':['get','color'],'fill-extrusion-base':['get','base'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':1}});}
`;
html=html.replace('function style(){',injected+'\nfunction style(){');
html=html.replace("map.addLayer({id:'kml-routes'","map.addLayer({id:'all-kml-routes',type:'line',source:'eco',layout:{visibility:'none'},filter:['==',['get','type'],'reference_path'],paint:{'line-color':['match',['get','mode'],'monorail','#78559c','#258078'],'line-width':2,'line-opacity':.6,'line-dasharray':[2,2]}});\n map.addLayer({id:'kml-routes'");
html=html.replace("map.addLayer({id:'eco-poi'","addVisualModels();\n map.addLayer({id:'eco-poi'");
html=html.replace("'icon-size':.65","'icon-size':['interpolate',['linear'],['zoom'],14,.3,17,.48,19,.6]").replace("'text-size':14","'text-size':['interpolate',['linear'],['zoom'],14,10,18,13]");
html=html.replace("'#edf3e9'","'#e7eed5'").replace("'#c9e2c3'","'#a7c791'").replace("'#99d7e6'","'#86c9d0'");
html=html.replace("'fill-extrusion-height':['get','height']","'fill-extrusion-height':['case',['in',['get','id'],['literal',"+JSON.stringify(['osm-w561140238-building',...ecoIds])+ "]],0,['get','height']]");
html=html.replace("selectedFacility=f;sheetFocus", "selectedFacility=f;showPhoto(f);updateRouteView();sheetFocus");
html=html.replace("selectedFacility=null;document.body", "selectedFacility=null;updateRouteView();document.body");
html=html.replace("syncViewButton();});map.on('pitchend'", "syncViewButton();updateRouteView();});map.on('pitchend'");
html=html.replace("$('settingsButton').onclick=", "$('allRoutes').onchange=updateRouteView;\n$('settingsButton').onclick=");
html=html.replace('<div class="photo-placeholder"','<img id="facilityPhoto" hidden style="width:100%;height:145px;object-fit:cover;display:block" alt=""><div class="photo-placeholder"');
html=html.replace('<p class="note">거리는','<p id="routeNote" class="note"></p><p class="note">거리는');
html=html.replace('방문객 지도 v4 · 위치 28개 · 경로 17개','방문객 지도 v5 · 사진 기반 입체 외형 시제품');
html=html.replace('<details><summary>아이콘·경로 범례</summary>','<label><input id="allRoutes" type="checkbox"> 전체 KML 참고 동선 보기</label><p>주요 시설 외형은 사진을 참고한 시각적 추정입니다. 실제 치수·경계·높이 검증값이 아닙니다.</p><details><summary>아이콘·경로 범례</summary>');
html=html.replace('시설 아이콘을 눌러 둘러보세요</div>','시설을 누르면 사진과 참고 동선을 볼 수 있어요</div>');
html=html.replace('max-height:44dvh','max-height:53dvh');
// Open on the core pilot area; the home action retains whole-park bounds.
html=html.replace('fitFacilities();renderFacilities();applyCategory();',"map.fitBounds([[128.0588,36.6523],[128.0627,36.6553]],{padding:{top:165,bottom:80,left:25,right:65},pitch:45,bearing:-12,duration:0});renderFacilities();applyCategory();");
new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
fs.writeFileSync(__dirname+'/index.html',html);console.log('Built v5:',art.length,'decorative solids;',Buffer.byteLength(html),'bytes. Original GeoJSON and token unchanged.');
}
build().catch(e=>{console.error(e.message);process.exitCode=1;});
