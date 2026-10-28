import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {DataImportManager} from '../js/data-import.js';
import {DEFAULT_STATE} from '../js/propagation-engine.js';
import {defaultSourceSettings,normalizeSettings} from '../js/source-manager.js';

function manager(mode='automatic'){
  const m=Object.create(DataImportManager.prototype);
  m.settings=defaultSourceSettings();m.settings.mode=mode;
  m.state={...DEFAULT_STATE,dateISO:new Date().toISOString().slice(0,10)};
  m.status={};m.provenance={};m.generation={};m.activeControllers=new Map();
  m.abort=null;m.onStatus=()=>{};m.onData=()=>{};
  m.setStatus=(cat,status,message='',provider='',timestamp=null)=>{m.status[cat]={status,message,provider,timestamp};};
  return m;
}
const pending=()=>{
  let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};
};
test('late terrain result does not overwrite after station moves',async()=>{
 const m=manager('manual'),started=pending(),finish=pending();let updates=0;
 m.fetchProvider=async()=>{started.resolve();return await finish.promise;};m.onData=()=>updates++;
 const work=m.importCategory('terrain');await started.promise;
 m.state.txLat+=1;m.invalidateLocation();
 finish.resolve({value:[100,200],description:'test'});
 assert.equal(await work,false);assert.equal(updates,0);
 assert.notEqual(m.status.terrain?.status,'imported');
});
test('late Kp result does not overwrite after date changes',async()=>{
 const m=manager('manual'),started=pending(),finish=pending();let updates=0;
 m.fetchProvider=async()=>{started.resolve();return await finish.promise;};m.onData=()=>updates++;
 const work=m.importCategory('kp');await started.promise;
 m.state.dateISO='2024-02-02';m.invalidateDate();
 finish.resolve({value:5,timestamp:'2024-02-02T10:00:00Z',description:'test'});
 assert.equal(await work,false);assert.equal(updates,0);
});
test('changing manual field stops outstanding import and preserves edit',async()=>{
 const m=manager('manual'),started=pending(),finish=pending();let updates=0;
 m.fetchProvider=async()=>{started.resolve();return await finish.promise;};m.onData=()=>updates++;
 const work=m.importCategory('kp');await started.promise;
 m.state.k=8;m.markManual('k');
 finish.resolve({value:1,timestamp:'2026-10-28T02:00:00Z',description:'test'});
 assert.equal(await work,false);assert.equal(m.state.k,8);assert.equal(updates,0);
 assert.equal(m.status.kp.status,'manual');
});
test('newer import wins even if earlier completes last',async()=>{
 const m=manager('manual');let counter=0;const a=pending(),b=pending(),started=pending();const accepted=[];
 m.fetchProvider=async()=>{const count=++counter;if(count===1){started.resolve();return a.promise;}return b.promise;};
 m.onData=(_cat,result)=>accepted.push(result.value);
 const first=m.importCategory('kp');await started.promise;
 const second=m.importCategory('kp');
 b.resolve({value:3,timestamp:'2026-10-28T02:00:00Z',description:'second'});
 assert.equal(await second,true);
 a.resolve({value:7,timestamp:'2026-10-28T02:00:00Z',description:'first'});
 assert.equal(await first,false);assert.deepEqual(accepted,[3]);
});
test('source settings reject unknown and duplicate providers',()=>{
 const raw={mode:'automatic',categories:{kp:{order:['swpc-kp-3h','swpc-kp-3h','bad'],disabled:['bad','swpc-kp-1m','swpc-kp-1m']}}};
 const normalized=normalizeSettings(raw).categories.kp;
 assert.deepEqual(normalized.order,['swpc-kp-3h','swpc-kp-1m']);
 assert.deepEqual(normalized.disabled,['swpc-kp-1m']);
});
test('every locally referenced entry point and versioned module exists',()=>{
 const base=new URL('../',import.meta.url),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const match of html.matchAll(/(?:src|href)="(\.\/[^"#?]+)(?:\?[^"#]*)?"/g)){
   assert.ok(existsSync(new URL(match[1],base)),`missing ${match[1]}`);
 }
 for(const file of readdirSync(new URL('../js/',import.meta.url))){
   if(!file.endsWith('.js'))continue;
   const source=readFileSync(new URL(`../js/${file}`,import.meta.url),'utf8');
   for(const match of source.matchAll(/from\s+['"](\.\/[^'"?]+)(?:\?v=[^'"]+)?['"]/g)){
     assert.ok(existsSync(new URL(`../js/${match[1].replace('./','')}`,import.meta.url)),`missing ${file}->${match[1]}`);
   }
   assert.doesNotMatch(source,/\?v=2\.3/,'stale module cache key');
 }
 assert.match(html,/app\.js\?v=2\.4/);
});
