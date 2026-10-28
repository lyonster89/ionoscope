import test from 'node:test';
import assert from 'node:assert/strict';
import {greatCircleDistanceKm,DEFAULT_STATE,evaluatePath} from '../js/propagation-engine.js';
import {solarPosition,solarDate,bearingDeg,maidenheadToCoords,interpolateGreatCircle} from '../js/solar-geometry.js';
import {ANTENNAS,antennaDirectionalGainDb} from '../js/antenna-models.js';
import {SOURCE_PROVIDERS,parseMeasurements,checkTimeCompatibility,normalizeSettings,defaultSourceSettings} from '../js/source-manager.js';
import {DataImportManager} from '../js/data-import.js';
const near=(a,b,eps=.00001)=>assert.ok(Math.abs(a-b)<=eps,`${a} not near ${b}`);

test('solar illumination reacts to date, time and longitude',()=>{
 const a=solarPosition(40,-105,solarDate('2026-06-21',19));
 const b=solarPosition(40,-105,solarDate('2026-06-21',7));
 assert.ok(a.elevation>35);assert.ok(b.elevation<0);
 assert.ok(solarPosition(60,0,solarDate('2026-06-21',12)).elevation>solarPosition(60,0,solarDate('2026-12-21',12)).elevation+35);
});
test('Maidenhead locator parser validates 4/6/8 character grids',()=>{
 const p=maidenheadToCoords('CN87');assert.ok(p.lat>47&&p.lat<49);assert.ok(p.lon< -122&&p.lon> -124);
 assert.notDeepEqual(maidenheadToCoords('CN87'),maidenheadToCoords('CN87uq'));
 assert.throws(()=>maidenheadToCoords('XY88'));
});
test('bearing and spherical path sampling follow great-circle geometry',()=>{
 near(bearingDeg(0,0,0,90),90);
 const p=interpolateGreatCircle(0,0,0,90);assert.equal(p.length,81);
 near(p[40][0],0);near(p[40][1],45,.001);
 const len=greatCircleDistanceKm(0,0,0,90);assert.ok(len>10000&&len<10010);
});
test('antenna types include different azimuth behavior',()=>{
 const base={frequency:14,heightM:15,elevation:17,azimuth:90,efficiency:95,ground:2};
 const yagFront=antennaDirectionalGainDb('yagi',{...base,bearing:90});
 const yagBack=antennaDirectionalGainDb('yagi',{...base,bearing:270});
 assert.ok(yagFront-yagBack>14);
 const omniFront=antennaDirectionalGainDb('vertical',{...base,bearing:90});
 const omniBack=antennaDirectionalGainDb('vertical',{...base,bearing:270});
 near(omniFront,omniBack);
 assert.equal(ANTENNAS.beverage.rxOnly,true);
});
test('moving horizontal antenna height modifies TX directional gain and RX power',()=>{
 const a=evaluatePath({...DEFAULT_STATE,txHeightM:6});
 const b=evaluatePath({...DEFAULT_STATE,txHeightM:22});
 assert.notEqual(a.txAntennaGain,b.txAntennaGain);
 assert.notEqual(a.rxDbm,b.rxDbm);
});
test('changing TX orientation or receiver model changes the computed budget',()=>{
 const a=evaluatePath(DEFAULT_STATE);
 const b=evaluatePath({...DEFAULT_STATE,txAntenna:'yagi',txAzimuth:105});
 const c=evaluatePath({...DEFAULT_STATE,rxAntenna:'beverage'});
 assert.notEqual(a.rxDbm,b.rxDbm);
 assert.notEqual(a.rxDbm,c.rxDbm);
});
test('source registry exposes alternate compatible providers for important categories',()=>{
 for(const cat of ['sfi','kp'])assert.ok(SOURCE_PROVIDERS[cat].length>=2);
 assert.equal(SOURCE_PROVIDERS.terrain.length,1,'Only the verified browser-readable terrain service is offered');
 const cfg=defaultSourceSettings();const changed=normalizeSettings({mode:'ask',categories:{kp:{order:['swpc-kp-3h','swpc-kp-1m'],disabled:['swpc-kp-1m']}}});
 assert.equal(changed.mode,'ask');assert.equal(changed.categories.kp.order[0],'swpc-kp-3h');assert.ok(changed.categories.kp.disabled.includes('swpc-kp-1m'));
 assert.deepEqual(cfg.categories.kp.disabled,[]);
});
test('NOAA source records normalize field names and timestamp headers',()=>{
 const kp=parseMeasurements('kp','swpc-kp-3h',[{time_tag:'2026-10-28T00:00:00',kp_index:3.33}]);near(kp.value,3.33);
 const flux=parseMeasurements('sfi','swpc-f107',[{time_tag:'2026-10-28T00:00:00',flux:157.2}]);near(flux.value,157.2);
 const oldShape=parseMeasurements('kp','swpc-kp-3h',[['time_tag','kp_index'],['2026-10-28T00:00:00',4.3]]);near(oldShape.value,4.3);
 const terrain=parseMeasurements('terrain','openmeteo-elev',{elevation:[124.5,1614]});assert.deepEqual(terrain.value,[124.5,1614]);
 assert.throws(()=>parseMeasurements('kp','a',[{time_tag:'no',wrong_value:900}]));
});
test('historic sunspot monthly data honor requested date, not latest record',()=>{
 const rows=[{'time-tag':'2026-08',ssn:93},{'time-tag':'2026-09',ssn:110}];
 near(parseMeasurements('ssn','swpc-ssn-monthly',rows,'2026-08-15').value,93);
 assert.throws(()=>parseMeasurements('ssn','swpc-ssn-monthly',rows,'2026-10-15'));
});
test('current live observations cannot silently substitute for a historical date',()=>{
 assert.equal(checkTimeCompatibility('kp','2023-08-15',new Date('2026-10-28T12:00:00Z')).ok,false);
 assert.equal(checkTimeCompatibility('kp','2026-10-28',new Date('2026-10-28T12:00:00Z')).ok,true);
 assert.equal(checkTimeCompatibility('terrain','2020-04-05',new Date('2026-10-28T12:00:00Z')).ok,true);
});
test('automatic mode tries second source when the first fails; manual does not',async()=>{
 const manager=Object.create(DataImportManager.prototype);
 manager.state={...DEFAULT_STATE,dateISO:'2026-10-28'};
 manager.settings=defaultSourceSettings();manager.provenance={};manager.status={};
 manager.setStatus=(cat,status,message,provider)=>{manager.status[cat]={status,message,provider};};
 const attempts=[];manager.fetchProvider=async(_cat,provider)=>{attempts.push(provider.id);if(provider.id==='swpc-kp-1m')throw Error('endpoint down');return {value:4,timestamp:'2026-10-28T06:00:00Z',description:'sample'};};
 let applied=0;manager.onData=()=>applied++;
 assert.equal(await manager.importCategory('kp',false),true);
 assert.deepEqual(attempts,['swpc-kp-1m','swpc-kp-3h']);assert.equal(applied,1);
 attempts.length=0;manager.settings.mode='manual';
 assert.equal(await manager.importCategory('kp',false),false);assert.deepEqual(attempts,['swpc-kp-1m']);
});

test('antipodal map path produces finite coordinates',()=>{
 const p=interpolateGreatCircle(0,0,0,180);
 assert.equal(p.length,81);assert.ok(p.every(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon)));
});
test('geocoding supports two provider result shapes',()=>{
 const o=parseMeasurements('geocode','openmeteo-geo',{results:[{name:'Seattle',latitude:47.6,longitude:-122.3,country:'United States'}]});
 const n=parseMeasurements('geocode','nominatim-geo',[{display_name:'Seattle, WA',lat:'47.6',lon:'-122.3'}]);
 near(o.value.lat,n.value.lat);assert.equal(n.value.name,'Seattle, WA');
});
