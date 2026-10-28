/** Browser-safe providers: hardcoded public endpoints, no user-controlled URLs or secrets. */
export const SOURCE_CATEGORIES = {
  sfi:{label:'10.7 cm solar flux · sfu',field:'sfi'},
  ssn:{label:'Sunspot number · monthly mean',field:'ssn'},
  kp:{label:'Planetary Kp',field:'k'},
  terrain:{label:'Station terrain elevation · m',field:null},
  geocode:{label:'City and location search',field:null},
  a:{label:'Planetary A-index',field:'a'},
  tec:{label:'Ionospheric TEC / electron density',field:null},
  absorption:{label:'D-region event absorption',field:null},
};
export const SOURCE_PROVIDERS = {
 sfi:[
  {id:'swpc-f107',label:'NOAA SWPC · observed F10.7',type:'observation',url:'https://services.swpc.noaa.gov/json/f107_cm_flux.json',maxAgeHours:72},
  {id:'swpc-f107-30',label:'NOAA SWPC · 30-day solar flux series',type:'observation',url:'https://services.swpc.noaa.gov/products/10cm-flux-30-day.json',maxAgeHours:72},
 ],
 ssn:[{id:'swpc-ssn-monthly',label:'NOAA SWPC · monthly observed SSN',type:'monthly mean',url:'https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json',maxAgeHours:24*62}],
 kp:[
  {id:'swpc-kp-1m',label:'NOAA SWPC · minute-updated Kp',type:'estimated 3h Kp',url:'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',maxAgeHours:6},
  {id:'swpc-kp-3h',label:'NOAA SWPC · 3-hour Kp',type:'estimated 3h Kp',url:'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',maxAgeHours:8},
 ],
 geocode:[
  {id:'openmeteo-geo',label:'Open-Meteo / GeoNames',type:'geocoding service',url:'https://geocoding-api.open-meteo.com/v1/search',maxAgeHours:null},
  {id:'nominatim-geo',label:'OpenStreetMap Nominatim (1 req/s max)',type:'geocoding service',url:'https://nominatim.openstreetmap.org/search',maxAgeHours:null},
 ],
 terrain:[
  {id:'openmeteo-elev',label:'Open-Meteo / Copernicus DEM',type:'terrain model',url:'https://api.open-meteo.com/v1/elevation',maxAgeHours:null},
 ],
 a:[],tec:[],absorption:[],
};
export function defaultSourceSettings(){
 return {mode:'automatic', categories:Object.fromEntries(Object.keys(SOURCE_CATEGORIES).map(k=>[k,{order:SOURCE_PROVIDERS[k].map(x=>x.id),disabled:[]}]))};
}
export function normalizeSettings(input){
 const out=defaultSourceSettings();
 if(['automatic','manual','ask'].includes(input?.mode))out.mode=input.mode;
 for(const [k,cat] of Object.entries(out.categories)){
  const ids=cat.order,v=input?.categories?.[k];
  if(v){const requested=Array.isArray(v.order)?v.order.filter(id=>ids.includes(id)):[];cat.order=[...new Set([...requested,...ids])];cat.disabled=Array.isArray(v.disabled)?[...new Set(v.disabled.filter(id=>ids.includes(id)))]:[];}
 }return out;
}
export function parseMeasurements(category,id,data,requestedISO=null){
 const rows=Array.isArray(data)?data:(data?.data||data?.records||[]);
 if(category==='geocode'){
   const rows=id==='openmeteo-geo'?data?.results:data;const p=rows?.[0];
   const rawLat=p?.latitude??p?.lat,rawLon=p?.longitude??p?.lon;
   if(rawLat===null||rawLat===undefined||rawLon===null||rawLon===undefined||String(rawLat).trim()===''||String(rawLon).trim()==='')throw Error('No valid geocoding result');
   const lat=Number(rawLat),lon=Number(rawLon);
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('No valid geocoding result');
   return {value:{lat,lon,name:p.name||p.display_name||'Location',country:p.country||''},timestamp:null,description:'User-requested location search; not an ionospheric observation.'};
 }
 if(category==='terrain'){
   const arr=id==='openmeteo-elev'?data?.elevation:data?.results?.map(x=>x?.elevation);
   if(!Array.isArray(arr)||arr.length!==2||arr.some(n=>n===null||n===undefined||typeof n==='boolean'||String(n).trim()===''||!Number.isFinite(Number(n))||Number(n)<-500||Number(n)>9000))throw Error('Invalid terrain elevation response');
   return {value:arr.map(Number),timestamp:null,description:'90 m class DEM estimate; terrain elevation does not by itself change HF skywave attenuation.'};
 }
 if(!Array.isArray(rows)||rows.length===0)throw Error('Provider returned no measurements');
 const objects=Array.isArray(rows[0])?rows.slice(1).map(r=>Object.fromEntries(rows[0].map((key,i)=>[key,r[i]]))):rows;
 const pick=(r,keys)=>{for(const k of keys){const v=r?.[k];if(v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))return +v;}return null;};
 // SWPC JSON timestamps are UTC even when their strings omit the zone.
 // Normalize before sorting/age checks; browsers otherwise use local time.
 const t=(r)=>{
   const raw=r?.time_tag||r?.time||r?.date||r?.['time-tag']||r?.['Time Tag']||r?.timestamp||null;
   if(typeof raw!=='string')return null;
   if(/^\d{4}-\d{2}$/.test(raw))return raw+'-01T00:00:00Z';
   if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw+'T00:00:00Z';
   if(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw))return raw.replace(' ','T')+'Z';
   return raw;
 };
 let choices=[];
 if(category==='sfi')choices=objects.map(r=>({value:pick(r,['flux','f107','f10.7','f10_7','f10_7_flux','observed_flux','observed','solar_flux','flux_obs']),timestamp:t(r)}));
 if(category==='kp')choices=objects.map(r=>({value:pick(r,['kp_index','kp','Kp','estimated_kp','planetary_k_index']),timestamp:t(r)}));
 if(category==='ssn')choices=objects.map(r=>({value:pick(r,['ssn','observed_swpc_ssn','smoothed_ssn']),timestamp:t(r)}));
 choices=choices.filter(c=>Number.isFinite(c.value)&&c.value>=0&&c.timestamp);
 const range={sfi:[50,500],kp:[0,9],ssn:[0,500]}[category];
 choices=choices.filter(c=>c.value>=range[0]&&c.value<=range[1]);
 if(category==='ssn'&&requestedISO)choices=choices.filter(c=>String(c.timestamp).slice(0,7)===requestedISO.slice(0,7));
 if(!choices.length)throw Error('Could not validate the required field or observation timestamp');
 choices.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
 const latest=choices[0];
 if(!Number.isFinite(new Date(latest.timestamp).getTime()))throw Error('Invalid observation timestamp');
 return {value:latest.value,timestamp:latest.timestamp,description:category==='ssn'?'Monthly average, not a daily live sunspot observation.':'Global index; not a path-specific ionospheric measurement.'};
}
export function providerUrl(provider,category,state,query='London'){
 if(category==='geocode')return provider.id==='openmeteo-geo'?`${provider.url}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`:`${provider.url}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;
 if(category!=='terrain')return provider.url;
 const locs=[[state.txLat,state.txLon],[state.rxLat,state.rxLon]];
 if(provider.id==='openmeteo-elev')return `${provider.url}?latitude=${locs.map(p=>p[0]).join(',')}&longitude=${locs.map(p=>p[1]).join(',')}`;
 return `${provider.url}?locations=${locs.map(p=>p.join(',')).join('|')}`;
}
export function checkTimeCompatibility(category,selectedISO,now=new Date()){
 if(category==='terrain'||category==='ssn'||category==='geocode')return {ok:true}; // Solar cycle monthly historical records have their own timestamps.
 const selected=new Date(`${selectedISO}T12:00:00Z`);
 const deltaDays=Math.abs(now-selected)/86400000;
 if(deltaDays>2)return {ok:false,reason:'Selected date differs from current observations. Change to today or use manual/simulated values.'};
 return {ok:true};
}
