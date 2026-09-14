const fs=require('fs'),assert=require('assert'),vm=require('vm');
const {chromium}=require('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(__dirname+'/index.html','utf8'),old=fs.readFileSync(__dirname+'/../ecoworld-kml-update/index.html','utf8');
for(const k of ['MAPBOX_PUBLIC_TOKEN','EMBEDDED_GEOJSON'])assert.equal(html.match(new RegExp('const '+k+' = (.*);'))[1],old.match(new RegExp('const '+k+' = (.*);'))[1]);
new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
const models=JSON.parse(fs.readFileSync(__dirname+'/visual-models.geojson','utf8'));for(const f of models.features){assert(f.properties.height>f.properties.base);assert.deepEqual(f.geometry.coordinates[0][0],f.geometry.coordinates[0].at(-1));}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,timeout:15000});try{
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://api.mapbox.com/**',r=>r.fulfill({status:200,body:''}));await page.goto('file:///'+__dirname.replace(/\\/g,'/')+'/index.html');
const mock=fs.readFileSync(__dirname+'/../ecoworld-visitor-v3/check-logic.cjs','utf8').match(/class MapMock[\s\S]*?(?=class Marker)/)[0];
await page.addScriptTag({content:mock+`;window.mapboxgl={supported:()=>true,Map:MapMock,ScaleControl:class{},LngLatBounds:class{extend(){}}};document.getElementById('connect').dispatchEvent(new Event('submit',{cancelable:true}));map.handlers.load();`});
await page.evaluate(()=>openFacility(data.features.find(f=>f.properties.source_name==='文경석탄박물관'.replace('文','문'))));
await page.locator('#facilityPhoto').evaluate(el=>el.decode());assert(await page.locator('#facilityPhoto').isVisible());
assert((await page.locator('#routeNote').innerText()).includes('KML 참고'));
assert.equal(await page.evaluate(()=>map.layers['kml-routes'].filter[2][2][1].length),1);
await page.screenshot({path:__dirname+'/mobile-card.png',animations:'disabled'});
const boxes=await page.evaluate(()=>({s:document.getElementById('facilitySheet').getBoundingClientRect().toJSON(),b:document.querySelector('.fabs').getBoundingClientRect().toJSON()}));assert(boxes.b.bottom<=boxes.s.top);
await page.locator('#closeSheet').click();assert.equal(await page.evaluate(()=>map.layers['kml-routes'].filter[2][2][1].length),0);
await page.getByRole('button',{name:'안전/의무실',exact:true}).click();assert.equal(await page.evaluate(()=>map.layers['eco-poi'].filter[2][2][1].length),1);
await page.evaluate(()=>openFacility(data.features.find(f=>f.properties.icon_key==='medical')));assert(await page.locator('#facilityPhoto').isHidden());
await page.locator('#closeSheet').click();await page.locator('#viewToggle').click();assert.equal(await page.locator('#viewToggle').innerText(),'3D');
await page.locator('#settingsButton').click();await page.locator('#allRoutes').check();assert(await page.locator('#allRoutes').isChecked());await page.keyboard.press('Escape');
assert.deepEqual(errors,[]);console.log('PASS unchanged token/GeoJSON; valid 30 visual solids; browser photos, selected route, safety filter, mobile clearance, 2D, settings. Mapbox engine mocked; live rendering and GPS not tested.');
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
