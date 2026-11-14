/* Local, deterministic geometry only. No storage, location requests or network. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.EcoWayfinding=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const RAD=Math.PI/180,EARTH=6371008.8,SPEED=4000/60;
 const NAME_ALIASES=Object.freeze({'문경석탄박물관':'석탄박물관','서바이벌체험장 입구':'서바이벌체험장','은성갱도 입구':'은성갱도'});
 function distance(a,b){const y=(b[1]-a[1])*RAD,x=(b[0]-a[0])*RAD,q=Math.sin(y/2)**2+Math.cos(a[1]*RAD)*Math.cos(b[1]*RAD)*Math.sin(x/2)**2;return EARTH*2*Math.atan2(Math.sqrt(Math.min(1,q)),Math.sqrt(Math.max(0,1-q)));}
 function local(c,anchor){return [(c[0]-anchor[0])*RAD*EARTH*Math.cos(anchor[1]*RAD),(c[1]-anchor[1])*RAD*EARTH];}
 function length(points){return points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);}
 function unique(points){return points.filter((p,i)=>!i||distance(p,points[i-1])>.05);}
 function featureName(f){return f?.properties?.name||'시설';}
 function canonical(f){const n=typeof f==='string'?f:f?.properties?.source_name||f?.properties?.name||'';return NAME_ALIASES[n]||n;}
 function referencePair(f){const n=f?.properties?.source_name||f?.properties?.name||'',m=/^(.+?)에서(?:부터)?\s*(.+?)까지(?:\s*(?:탐방로\s*)?경로)?$/.exec(n);return m?[m[1].trim(),m[2].trim()]:null;}
 function referenceRoute(originFeature,destination,features){
  if(!originFeature||!destination||originFeature.properties.id===destination.properties.id)return null;
  const a=canonical(originFeature),b=canonical(destination),matches=[];
  for(const f of features){if(f.properties.type!=='reference_path'||f.properties.mode!=='pedestrian'||f.geometry.type!=='LineString')continue;const pair=referencePair(f);if(!pair)continue;
   if(pair[0]===a&&pair[1]===b)matches.push({feature:f,coordinates:f.geometry.coordinates.map(c=>c.slice()),reverse:false});
   else if(pair[0]===b&&pair[1]===a)matches.push({feature:f,coordinates:f.geometry.coordinates.map(c=>c.slice()).reverse(),reverse:true});
  }
  // If the source has alternatives, show its shortest complete recorded line.
  return matches.sort((a,b)=>length(a.coordinates)-length(b.coordinates))[0]||null;
 }
 function inferOriginFeature(coords,features){return features.filter(f=>f.properties.type==='poi').map(f=>({f,d:distance(coords,f.geometry.coordinates)})).filter(x=>x.d<=15).sort((a,b)=>a.d-b.d)[0]?.f||null;}
 function computeRoute({origin,destination,originFeature=null,features=[],graph,xy,ll,nearest,route,outside=false}){
  if(!Array.isArray(origin)||!destination?.geometry?.coordinates)return null;
  const target=destination.geometry.coordinates;
  if(!outside&&graph&&typeof xy==='function'&&typeof ll==='function'&&typeof nearest==='function'&&typeof route==='function'){
   const starts=nearest(xy(origin),graph).filter(s=>s.d<=15),ends=nearest(xy(target),graph).filter(s=>s.d<=15);let best=null;
   for(const a of starts)for(const b of ends){const p=route(a,b,graph);if(!p?.length)continue;
    // Only these short, measured endpoint links are allowed. Including them in
    // the geometry keeps the initial and continuously updated distances equal.
    const coordinates=unique([origin.slice(),...p.map(ll),target.slice()]),meters=length(coordinates);if(!best||meters<best.distance)best={basis:'walkway',label:'보행로 경로',coordinates,distance:meters,endpointGap:a.d+b.d};}
   if(best)return best;
  }
  if(!outside){const ref=referenceRoute(originFeature||inferOriginFeature(origin,features),destination,features);if(ref)return {basis:'reference',label:'참고 동선',coordinates:unique(ref.coordinates),distance:length(ref.coordinates),referenceId:ref.feature.properties.id,referenceName:ref.feature.properties.source_name,reverse:ref.reverse};}
  return {basis:'straight',label:'직선 방향',coordinates:[origin.slice(),target.slice()],distance:distance(origin,target),directionOnly:true};
 }
 function travelInfo(options){const r=computeRoute(options);if(!r)return null;const minutes=Math.max(1,Math.ceil((r.basis==='straight'?r.distance*1.3:r.distance)/SPEED));return {distance:r.distance,minutes,basis:r.basis,text:(r.basis==='straight'?'직선 기준 약 ':'걸어서 약 ')+minutes+'분'};}
 function bearing(a,b){const d=(b[0]-a[0])*RAD,x=Math.sin(d)*Math.cos(b[1]*RAD),y=Math.cos(a[1]*RAD)*Math.sin(b[1]*RAD)-Math.sin(a[1]*RAD)*Math.cos(b[1]*RAD)*Math.cos(d);return (Math.atan2(x,y)/RAD+360)%360;}
 function compass(a,b){return ['북쪽','북동쪽','동쪽','남동쪽','남쪽','남서쪽','서쪽','북서쪽'][Math.round(bearing(a,b)/45)%8];}
 function nearFacility(point,features){const item=features.filter(f=>f.properties.type==='poi').map(f=>({f,d:distance(point,f.geometry.coordinates)})).filter(x=>x.d<=20).sort((a,b)=>a.d-b.d)[0];return item?' · '+featureName(item.f)+' 부근':'';}
 const meters=n=>Math.max(1,Math.round(n));
 function makeSteps(r,features=[]){
  if(!r?.coordinates?.length)return [];
  const cs=unique(r.coordinates);if(r.basis==='straight')return [{text:compass(cs[0],cs.at(-1))+'으로 직선 약 '+meters(r.distance)+' m · 현장 안내판을 따라 주세요',point:cs.at(-1),distance:r.distance}];
  const steps=[];let since=0;
  for(let i=1;i<cs.length;i++){since+=distance(cs[i-1],cs[i]);if(i===cs.length-1){steps.push({text:'약 '+meters(since)+' m 직진 → 목적지 부근'+nearFacility(cs[i],features),point:cs[i],distance:since});break;}
   const turn=(bearing(cs[i],cs[i+1])-bearing(cs[i-1],cs[i])+540)%360-180;
   if(Math.abs(turn)>=28&&since>=4){const label=Math.abs(turn)>150?'되돌아가는 방향':turn>0?'오른쪽':'왼쪽';steps.push({text:'약 '+meters(since)+' m 직진 → '+label+nearFacility(cs[i],features),point:cs[i],distance:since});since=0;}
  }
  return steps.length?steps:[{text:'목적지 부근입니다'+nearFacility(cs.at(-1),features),point:cs.at(-1),distance:0}];
 }
 function progress(coords,r){
  if(!r?.coordinates?.length)return {deviation:Infinity,remaining:Infinity,coordinates:[]};
  const cs=r.coordinates;if(r.basis==='straight')return {deviation:0,remaining:distance(coords,cs.at(-1)),coordinates:[coords,cs.at(-1)],segment:0};
  let best=null;
  for(let i=1;i<cs.length;i++){const a=local(cs[i-1],coords),b=local(cs[i],coords),dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy,t=len2?Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/len2)):0,d=Math.hypot(a[0]+t*dx,a[1]+t*dy),p=[cs[i-1][0]+t*(cs[i][0]-cs[i-1][0]),cs[i-1][1]+t*(cs[i][1]-cs[i-1][1])];
   if(!best||d<best.deviation){const coordinates=unique([p,...cs.slice(i)]);best={deviation:d,remaining:length(coordinates),coordinates,segment:i-1};}
  }
  return best||{deviation:distance(coords,cs[0]),remaining:0,coordinates:cs,segment:0};
 }
 function hasArrived(coords,destination,accuracy){return Number.isFinite(accuracy)&&accuracy<=50&&accuracy>=0&&distance(coords,destination)<=20;}
 function needsRecalculation(coords,r){return r?.basis!=='straight'&&progress(coords,r).deviation>30;}
 function hull(points){const ps=points.map(p=>p.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(ps.length<3)return ps;const lower=[],upper=[];for(const p of ps){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of ps.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}return lower.slice(0,-1).concat(upper.slice(0,-1));}
 function parkRing(fc){const points=[];for(const f of fc?.features||[]){if(f.properties.type==='poi')points.push(f.geometry.coordinates);else if(f.properties.type==='path'&&f.properties.walkable===true)points.push(...f.geometry.coordinates);}return hull(points);}
 function outsideDistance(coords,fc){const ring=parkRing(fc);if(!ring.length)return Infinity;let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>coords[1])!==(b[1]>coords[1])&&coords[0]<(b[0]-a[0])*(coords[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}if(inside)return 0;const closed=ring.concat([ring[0]]);return progress(coords,{basis:'walkway',coordinates:closed}).deviation;}
 function isOutsidePark(coords,fc){return outsideDistance(coords,fc)>1000;}
 function operatingWarning(info,minutes,nowMs=Date.now()){
  if(!info||!Number.isFinite(info.checkedMs)||!Number.isFinite(info.validUntilMs)||info.checkedMs>nowMs||info.validUntilMs<=nowMs)return '';
  if(info.status==='closed')return '목적지가 현재 휴장 중이에요. 현장 운영 여부를 확인해 주세요.';
  if(info.status!=='open'||!Number.isFinite(minutes))return '';
  // A single explicit daily interval only. Free prose, multiple sessions and
  // overnight hours cannot establish today's closing time unambiguously.
  const match=/^\s*([01]\d|2[0-3]):([0-5]\d)\s*(?:~|～|–|-)\s*([01]\d|2[0-3]):([0-5]\d)\s*$/.exec(info.hours||'');if(!match)return '';
  const start=+match[1]*60+ +match[2],end=+match[3]*60+ +match[4];if(end<=start)return '';
  const day=new Date(nowMs+9*3600000).toISOString().slice(0,10),closing=Date.parse(day+'T'+match[3]+':'+match[4]+':00+09:00');
  return nowMs+minutes*60000>=closing?'도착 예상 시각에 운영이 끝날 수 있어요 · 종료 '+match[3]+':'+match[4]:'';
 }
 return Object.freeze({NAME_ALIASES,distance,length,referencePair,referenceRoute,inferOriginFeature,computeRoute,travelInfo,makeSteps,progress,hasArrived,needsRecalculation,parkRing,outsideDistance,isOutsidePark,operatingWarning,compass,SPEED});
});
