const fs=require('fs'),vm=require('vm'),assert=require('assert');const html=fs.readFileSync(__dirname+'/index.html','utf8'),src=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
class El{constructor(){this.dataset={};this.hidden=false;this.checked=true;this.children=[];this.style={setProperty(){}};this.classList={add(){},remove(){}};this.isConnected=true;this.events={};this.value='';}setAttribute(k,v){this[k]=v;}addEventListener(k,v){this.events[k]=v;}dispatchEvent(e){this.events[e.type]?.(e);}click(){this.onclick?.();this.events.click?.();}replaceChildren(){this.children=[];}append(e){this.children.push(e);}get childElementCount(){return this.children.length;}focus(){}getBoundingClientRect(){return {height:300};}showModal(){this.open=true;}close(){this.open=false;}getContext(){return {beginPath(){},arc(){},fill(){},fillText(){},getImageData(){return {};}};}}
const els={},chips=['all','experience','exhibition','amenity','safety'].map(c=>{let e=new El();e.dataset.category=c;return e;});
for(const match of html.matchAll(/id="([^"]+)"/g))els[match[1]]=new El();els.facilitySheet.hidden=true;
class MapMock{constructor(o){this.pitch=o.pitch;this.sources={};this.layers={};this.handlers={};}on(name,...args){this.handlers[name]=args.at(-1);}addControl(){}addSource(id,o){this.sources[id]={setData(d){this.data=d;},...o};}addLayer(l){this.layers[l.id]=l;}addImage(){}getSource(id){return this.sources[id];}getLayer(id){return this.layers[id];}setFilter(id,f){this.layers[id].filter=f;}setLayoutProperty(){}getPitch(){return this.pitch;}easeTo(o){if(o.pitch!==undefined){this.pitch=o.pitch;this.handlers.pitchend?.();}this.center=o.center;}jumpTo(o){this.center=o.center;}fitBounds(){}getCanvas(){return new El();}}
class Marker{constructor(o){this.el=o.element;}setLngLat(p){this.p=p;return this;}addTo(){return this;}getElement(){return this.el;}remove(){}}
let gpsSuccess,gpsFail;
const ctx={console,document:{getElementById:id=>els[id],querySelectorAll:()=>chips,createElement:()=>new El(),body:new El(),documentElement:new El(),activeElement:new El(),addEventListener(){}},mapboxgl:{supported:()=>true,Map:MapMock,Marker,ScaleControl:class{},LngLatBounds:class{extend(){}}},navigator:{geolocation:{watchPosition(ok,fail){gpsSuccess=ok;gpsFail=fail;return 7;},clearWatch(){}}},Event:class{constructor(type){this.type=type;}preventDefault(){}},setTimeout:()=>0,clearTimeout(){},setInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},matchMedia:()=>({matches:true}),performance:{now:()=>0},innerWidth:390,isSecureContext:true,addEventListener(){}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);const run=s=>vm.runInContext(s,ctx);


run('map.handlers.load()');
assert.equal(els.locate.disabled,false);
assert.equal(run("map.layers['ecotown-blue-walkways'].layout['line-elevation-reference']"),'ground');
assert.equal(run("map.sources['ecotown-walkways'].data.features.length"),25);
assert.equal(run("map.sources['visual-models'].data.features.filter(f=>f.properties.band==='B1').length"),26);
run("map.setPaintProperty=(id,key,value)=>{map.layers[id].paint[key]=value};map.setLayoutProperty=(id,key,value)=>{map.layers[id].layout=map.layers[id].layout||{};map.layers[id].layout[key]=value};");
els.ecoColorBands.checked=true;els.ecoColorBands.onchange();assert.equal(run("map.layers['landmark-models'].paint['fill-extrusion-color'][0]"),'coalesce');
els.ecoWalks.checked=false;els.ecoWalks.onchange();assert.equal(run("map.layers['ecotown-blue-walkways'].layout.visibility"),'none');
assert.equal(run('graph.segments.length'),14);
console.log('PASS mocked initialization, layered source loading, level color toggle, route visibility and unchanged GPS graph.');
