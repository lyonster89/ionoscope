import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DEFAULT_STATE,evaluatePath} from '../js/propagation-engine.js';
import {ANTENNAS} from '../js/antenna-models.js';
import {validatedScenario} from '../js/scenario-validation.js';
import {DataImportManager} from '../js/data-import.js';
import {defaultSourceSettings} from '../js/source-manager.js';
import {wrapLongitude,interpolateGreatCircle,unwrapPath} from '../js/solar-geometry.js';
const limits={frequency:[1.8,30],txLat:[-90,90],rxLat:[-90,90],txLon:[-180,180],rxLon:[-180,180],txPower:[1,1000],utcHour:[0,23.75],hops:[1,3],antennaIds:Object.keys(ANTENNAS)};
const check=s=>validatedScenario(s,DEFAULT_STATE,limits);
test('valid saved state restores antenna, date and frequency with coherent derived fields',()=>{
 const out=check({...DEFAULT_STATE,txAntenna:'yagi',frequency:21.2,txHeightM:15,dateISO:'2026-12-31'});
 assert.equal(out.month,12); assert.ok(Math.abs(out.antennaHeight-15*21.2/299.792458)<1e-6);
 assert.equal(out.txAntenna,'yagi');
});
test('all supported radio modes validate, unsupported mode fails',()=>{
 for(const mode of ['CW','SSB','FT8'])assert.equal(check({mode}).mode,mode);
 assert.throws(()=>check({mode:'INVALID'}),/communications mode/);
});
test('invalid imported antennas cannot corrupt the propagation engine',()=>{
 assert.throws(()=>check({txAntenna:'fake'}),/Unknown antenna/);
 assert.throws(()=>check({rxAntenna:'evil'}),/Unknown antenna/);
 assert.ok(Number.isFinite(evaluatePath(check(DEFAULT_STATE)).rxDbm));
});
test('bad coordinates, identical stations and out of range frequency are rejected',()=>{
 for(const bad of [{txLat:120},{rxLon:-200},{frequency:999},{txPower:-1},{txLat:DEFAULT_STATE.rxLat,txLon:DEFAULT_STATE.rxLon}])assert.throws(()=>check(bad));
});
test('invalid dates, fake date fields, malformed numerical types are rejected',()=>{
 for(const bad of [{dateISO:'2026-02-30'},{dateISO:'not a date'},{dateISO:'2026-13-01'},{hops:0},{txPower:Infinity},{frequency:'14.2'}])assert.throws(()=>check(bad));
});
test('partial valid import inherits known safe defaults',()=>{
 const out=check({txPower:200}); assert.equal(out.txPower,200);assert.equal(out.frequency,DEFAULT_STATE.frequency);
});
test('sun-safe great circles remain continuous for both date-line directions',()=>{
 for(const [a,b] of [[179,-179],[-179,179],[170,-170],[-170,170]]){
  const points=unwrapPath(interpolateGreatCircle(10,a,20,b,100));
  assert.ok(points.every(v=>v.every(Number.isFinite)));
  for(let i=1;i<points.length;i++)assert.ok(Math.abs(points[i][1]-points[i-1][1])<10);
  assert.equal(Math.round(wrapLongitude(points.at(-1)[1])),b);
 }
});
test('manual source mode never silently moves past disabled primary provider',async()=>{
 const manager=Object.create(DataImportManager.prototype);
 manager.settings=defaultSourceSettings();manager.settings.mode='manual';manager.settings.categories.kp.disabled=['swpc-kp-1m'];
 manager.status={};manager.provenance={};manager.state={...DEFAULT_STATE,dateISO:'2026-10-28'};
 manager.setStatus=(id,status,message)=>manager.status[id]={status,message};
 manager.fetchProvider=async()=>{throw Error('should not fetch');};
 assert.equal(await manager.importCategory('kp'),false);
 assert.equal(manager.status.kp.status,'disabled');
});
test('ask mode does not silently auto-fallback after preferred service fails',async()=>{
 const manager=Object.create(DataImportManager.prototype);
 manager.settings=defaultSourceSettings();manager.settings.mode='ask';manager.status={};manager.provenance={};manager.state={...DEFAULT_STATE,dateISO:'2026-10-28'};
 manager.setStatus=(id,status,message)=>manager.status[id]={status,message};
 const attempts=[];manager.fetchProvider=async(_cat,provider)=>{attempts.push(provider.id);throw Error('service offline');};
 assert.equal(await manager.importCategory('kp'),false);
 assert.deepEqual(attempts,['swpc-kp-1m']);assert.equal(manager.status.kp.status,'action-needed');
});
test('map, reset and comparison entrypoints exist in built HTML',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const id of ['worldMap','mapBasemap','swapStationsBtn','mapStationSummary','zoomPathBtn','importBtn','sourceMode','baselineBtn','scenarioFile'])assert.ok(html.includes(`id="${id}"`),id);
});
test('release cache-busts all local ESM imports consistently',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/app\.js\?v=2\.4/);assert.match(html,/style\.css\?v=2\.4/);
 
 for(const name of readdirSync(new URL('../js/',import.meta.url))){const source=readFileSync(new URL(`../js/${name}`,import.meta.url),'utf8');assert.doesNotMatch(source,/\?v=2\.2/,name);}
});

test('cancel button aborts an individual category import and marks it canceled',async()=>{
 const manager=Object.create(DataImportManager.prototype);
 manager.settings=defaultSourceSettings();manager.settings.mode='manual';manager.status={};manager.provenance={};manager.state={...DEFAULT_STATE,dateISO:'2026-10-28'};
 manager.abort=null;manager.onStatus=()=>{};
 manager.setStatus=(id,status,message)=>{manager.status[id]={status,message};};
 let began;
 const ready=new Promise(resolve=>began=resolve);
 manager.fetchProvider=async (_cat,_provider,signal)=>{began();return await new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(new Error('Canceled'),{name:'AbortError'})),{once:true});});};
 const operation=manager.importCategory('kp',false);
 await ready;
 manager.cancel();
 assert.equal(await operation,false);
 assert.equal(manager.status.kp.status,'canceled');
});
test('fractional hop count is rejected when importing saved scenarios',()=>{
 assert.throws(()=>check({hops:2.5}),/whole number/);
});
