import {SOURCE_CATEGORIES,SOURCE_PROVIDERS,defaultSourceSettings,normalizeSettings,parseMeasurements,providerUrl,checkTimeCompatibility} from './source-manager.js?v=2.4';
const STORE='ionoscope-source-settings-v2';
const load=()=>{try{return normalizeSettings(JSON.parse(localStorage.getItem(STORE)||'null'));}catch{return defaultSourceSettings();}};
export class DataImportManager {
 constructor({state,onData,onStatus}){
  this.state=state;this.onData=onData;this.onStatus=onStatus;this.settings=load();this.status={};this.abort=null;this.provenance={};this.askCategory=null;this.activeControllers=new Map();this.generation={};this.searchController=null;
  this.host=document.getElementById('sourceRows');this.modeEl=document.getElementById('sourceMode');
  this.modeEl.value=this.settings.mode;
  this.modeEl.addEventListener('change',()=>{this.settings.mode=this.modeEl.value;this.persist();this.render();});
  document.getElementById('importBtn').addEventListener('click',()=>this.importAll());
  document.getElementById('cancelImportBtn').addEventListener('click',()=>this.cancel());
  this.render();
 }
 persist(){try{localStorage.setItem(STORE,JSON.stringify(this.settings));}catch{}}
 setStatus(cat,status,message='',provider='',timestamp=null,type=''){
  this.status[cat]={status,message,provider,timestamp,type};this.render();
 }
 render(){
  if(!this.host)return;
  this.host.replaceChildren();
  for(const [category,info] of Object.entries(SOURCE_CATEGORIES)){
   const config=this.settings.categories[category],options=SOURCE_PROVIDERS[category],record=this.status[category]||{status:'simulation',message:options.length?'Not imported; using manual scenario.':'No verified public browser endpoint integrated; use manual scenarios.'};
   const card=document.createElement('div');card.className='source-card';
   const title=document.createElement('div');title.className='source-card-title';title.innerHTML=`<strong>${info.label}</strong>`;
   const badge=document.createElement('span');badge.className=`source-badge status-${record.status}`;badge.textContent=record.status.toUpperCase();title.append(badge);card.append(title);
   if(options.length){
     const bar=document.createElement('div');bar.className='source-toolbar';
     const sel=document.createElement('select');sel.setAttribute('aria-label',`Preferred provider for ${info.label}`);
     config.order.forEach(id=>{const p=options.find(x=>x.id===id);const opt=document.createElement('option');opt.value=id;opt.textContent=p.label;sel.append(opt);});
     sel.value=config.order[0];sel.addEventListener('change',()=>{config.order=[sel.value,...config.order.filter(id=>id!==sel.value)];this.persist();this.render();});
     bar.append(sel);
     const button=(text,action,titleText)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.className='source-mini-btn';b.title=titleText||text;b.addEventListener('click',action);bar.append(b);};
     button('TEST',()=>this.importCategory(category,true),'Fetch and validate required data without applying it');
     if(category==='geocode')button('MAP',()=>document.getElementById('map').scrollIntoView({behavior:'smooth'}),'Use TX/RX city search in the world map');
     else button('IMPORT',()=>this.importCategory(category,false),'Import selected category and update the simulator');
     card.append(bar);
     const details=document.createElement('details');details.className='source-details';
     const summary=document.createElement('summary');summary.textContent='Fallback order / enable providers';details.append(summary);
     config.order.forEach((id,i)=>{
      const p=options.find(x=>x.id===id),row=document.createElement('div');row.className='source-priority';
      const chk=document.createElement('input');chk.type='checkbox';chk.checked=!config.disabled.includes(id);chk.setAttribute('aria-label',`Enable ${p.label}`);
      chk.addEventListener('change',()=>{config.disabled=chk.checked?config.disabled.filter(x=>x!==id):[...new Set([...config.disabled,id])];this.persist();this.render();});
      const label=document.createElement('span');label.textContent=p.label;
      const up=document.createElement('button');up.textContent='↑';up.type='button';up.disabled=i===0;up.title='Move earlier in fallback priority';
      up.addEventListener('click',()=>{[config.order[i-1],config.order[i]]=[config.order[i],config.order[i-1]];this.persist();this.render();});
      const down=document.createElement('button');down.textContent='↓';down.type='button';down.disabled=i===config.order.length-1;down.title='Move later in fallback priority';
      down.addEventListener('click',()=>{[config.order[i],config.order[i+1]]=[config.order[i+1],config.order[i]];this.persist();this.render();});
      row.append(chk,label,up,down);details.append(row);
     });card.append(details);
   }
   const small=document.createElement('div');small.className='source-note';small.textContent=`${record.message||'Manual scenario'}${record.provider?' · '+record.provider:''}${record.timestamp?' · observed '+record.timestamp:''}${record.type?' · '+record.type:''}`;card.append(small);
   if(record.status==='action-needed' || (record.status==='unavailable' && this.settings.mode==='manual')){
     const alternatives=config.order.filter(id=>!config.disabled.includes(id) && id!==config.order[0]);
     if(alternatives.length){
       const replacement=document.createElement('div');replacement.className='source-toolbar';
       const choice=document.createElement('select');choice.setAttribute('aria-label',`Alternative source for ${info.label}`);
       for(const id of alternatives){const option=document.createElement('option');option.value=id;option.textContent=options.find(p=>p.id===id)?.label||id;choice.append(option);}
       const tryButton=document.createElement('button');tryButton.className='source-mini-btn';tryButton.textContent='SWITCH & RETRY';tryButton.type='button';
       if(category==='geocode')tryButton.textContent='USE FOR SEARCH';
       tryButton.addEventListener('click',()=>{config.order=[choice.value,...config.order.filter(id=>id!==choice.value)];this.persist();
         if(category==='geocode'){this.setStatus(category,'manual','Provider switched. Retry your city search in the World Map.');document.getElementById('map')?.scrollIntoView({behavior:'smooth'});}
         else this.importCategory(category,false);
       });
       replacement.append(choice,tryButton);card.append(replacement);
     }
   }
   this.host.append(card);
  }
  const active=Object.entries(this.provenance).filter(([_,v])=>v?.status==='imported');
  document.getElementById('sourceSummary').textContent=active.length?`${active.length} categories imported · sources and timestamps shown below. Unimported categories retain manual/simulation values.`:'No external observations applied. Simulation / manual values remain active.';
 }
 cancel(){
  this.abort?.abort();this.abort=null;
  for(const [category,ctrl] of this.activeControllers){this.generation[category]=(this.generation[category]||0)+1;ctrl.abort();if(this.status[category]?.status==='connecting')this.setStatus(category,'canceled','Import canceled; previously applied data unchanged.');}
  this.activeControllers.clear();this.searchController?.abort();this.searchController=null;
  this.onStatus('Import canceled. Previously applied categories remain.');
 }
 abortCategory(category){
  this.generation??={};this.activeControllers??=new Map();
  this.generation[category]=(this.generation[category]||0)+1;
  this.activeControllers.get(category)?.abort();this.activeControllers.delete(category);
 }
 contextMatches(category,context){
  if(!['terrain','sfi','kp','ssn'].includes(category))return true;
  if(category!=='terrain'&&this.state.dateISO!==context.dateISO)return false;
  if(category==='terrain'&&['txLat','txLon','rxLat','rxLon'].some(k=>this.state[k]!==context[k]))return false;
  return true;
 }
 async fetchProvider(category,provider,signal){
   const response=await fetch(providerUrl(provider,category,this.state),{signal,cache:'no-store'});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   const data=await response.json();const parsed=parseMeasurements(category,provider.id,data,this.state.dateISO);
   if(parsed.timestamp && category!=='ssn' && provider.maxAgeHours!==null){
     const hours=(Date.now()-new Date(parsed.timestamp).getTime())/3600000;
     if(!Number.isFinite(hours)||hours>provider.maxAgeHours || hours < -4)throw Error(`Observation stale (${hours.toFixed(1)} h old)`);
   }
   if(category==='ssn'){
     const month=String(parsed.timestamp).slice(0,7),selected=this.state.dateISO?.slice(0,7);
     if(selected && month!==selected)throw Error(`Latest monthly record is ${month}; requested ${selected}. No matching monthly observation selected.`);
   }
   return parsed;
 }
 async importCategory(category,test=false,sharedSignal=null){
  if(category==='geocode'&&!test){this.setStatus('geocode','simulation','Use the TX/RX city search controls in the World Map.');return false;}
  const providers=SOURCE_PROVIDERS[category];if(!providers.length){this.setStatus(category,'unsupported','No validated browser-readable provider is configured.');return false;}
  const compatibility=checkTimeCompatibility(category,this.state.dateISO);
  if(!compatibility.ok){this.setStatus(category,'unsupported',compatibility.reason);return false;}
  const config=this.settings.categories[category];
  const ordered=config.order.map(id=>providers.find(p=>p.id===id)).filter(Boolean);
  const usable=ordered.filter(p=>!config.disabled.includes(p.id));
  if(!usable.length){this.setStatus(category,'disabled','Enable a compatible provider.');return false;}
  if(this.settings.mode!=='automatic' && config.disabled.includes(config.order[0])){
    this.setStatus(category,'disabled','Preferred provider is disabled. Enable it or explicitly select a different preferred provider.');return false;
  }
  // Each category owns its request. Invalidating the date/location, editing a value,
  // or starting another import cancels the old response so it cannot overwrite newer inputs.
  this.abortCategory(category);
  const generation=this.generation[category];
  const context={dateISO:this.state.dateISO,txLat:this.state.txLat,txLon:this.state.txLon,rxLat:this.state.rxLat,rxLon:this.state.rxLon};
  const request=new AbortController();this.activeControllers.set(category,request);
  const relay=()=>request.abort();
  sharedSignal?.addEventListener('abort',relay,{once:true});
  if(sharedSignal?.aborted)request.abort();
  const operationSignal=request.signal;
  const current=()=>this.generation[category]===generation && this.contextMatches(category,context);
  const release=()=>{sharedSignal?.removeEventListener('abort',relay);if(this.activeControllers.get(category)===request)this.activeControllers.delete(category);};
  this.setStatus(category,'connecting',test?'Testing selected endpoint…':'Fetching and validating…');
  const candidates=this.settings.mode==='automatic'&&!test?usable:[usable[0]];
  let failures=[];
  for(const provider of candidates){
   try{
    const ctrl=new AbortController();
    const stop=()=>ctrl.abort();operationSignal?.addEventListener('abort',stop,{once:true});if(operationSignal?.aborted)ctrl.abort();
    const timeout=setTimeout(()=>ctrl.abort(),9000);
    let result;try{result=await this.fetchProvider(category,provider,ctrl.signal);}finally{clearTimeout(timeout);operationSignal?.removeEventListener('abort',stop);}

    if(!current()||operationSignal.aborted){release();return false;}
    const status=test?'available':'imported';
    this.setStatus(category,status,`${Array.isArray(result.value)?result.value.join(' / ')+ ' m':result.value} · ${result.description}`,provider.label,result.timestamp,provider.type);
    if(!test){this.provenance[category]={status,provider:provider.label,timestamp:result.timestamp,value:result.value,type:provider.type};this.onData(category,result,provider);}
    release();return true;
   }catch(error){if(operationSignal?.aborted || !current()){
      if(current()&&this.status[category]?.status==='connecting')this.setStatus(category,'canceled','Request canceled or scenario changed.');
      release();return false;
    }
    failures.push(`${provider.label}: ${error.message}`);
   }
  }
  if(!current()||operationSignal.aborted){release();return false;}
  const mode=this.settings.mode;
  const last=this.provenance[category];
  if(last){last.status='stale';this.setStatus(category,'stale',`Fetch failed. Last imported value (${JSON.stringify(last.value)}) remains in scenario, observed ${last.timestamp||'unknown'}; it is NOT a new measurement. ${failures.join(' | ')}`);}
  else this.setStatus(category,mode==='ask'?'action-needed':'unavailable',`${failures.join(' | ')}${mode==='ask'?' · Change provider above and click Import.':''}`);
  release();return false;
 }
 async importAll(){
  if(this.abort)this.abort.abort();this.abort=new AbortController();
  const signal=this.abort.signal;
  const before={sfi:this.state.sfi,ssn:this.state.ssn,k:this.state.k};
  this.onStatus('Importing available categories. Source failures do not disable manual simulation.');
  let done=0;
  for(const category of Object.keys(SOURCE_CATEGORIES)){
    if(signal.aborted)break;
    if(category==='geocode')continue;
    const good=await this.importCategory(category,false,signal);if(good)done++;
  }
  if(!signal.aborted)this.onStatus(`${done} data categories imported. Before → after: SFI ${before.sfi} → ${this.state.sfi}; SSN ${before.ssn} → ${this.state.ssn}; Kp ${before.k} → ${this.state.k}.`);
  if(this.abort?.signal===signal)this.abort=null;
 }
 async searchLocation(query){
  const category='geocode',options=SOURCE_PROVIDERS.geocode,config=this.settings.categories.geocode;
  const usable=config.order.map(id=>options.find(x=>x.id===id)).filter(p=>p&&!config.disabled.includes(p.id));
  if(!usable.length)throw Error('No geocoding providers enabled; enable a source in Data Source Manager.');
  if(this.settings.mode!=='automatic' && config.disabled.includes(config.order[0]))throw Error('Preferred geocoding provider is disabled; explicitly enable or switch providers.');
  const candidates=this.settings.mode==='automatic'?usable:[usable[0]];let errors=[];
  this.searchController?.abort();this.searchController=new AbortController();
  const searchController=this.searchController;
  this.setStatus(category,'connecting',`Searching for ${query}…`);
  for(const provider of candidates){
   if(searchController.signal.aborted)throw Error('Search canceled by a newer request.');
   const ctrl=new AbortController();const stop=()=>ctrl.abort();searchController.signal.addEventListener('abort',stop,{once:true});
   const timeout=setTimeout(()=>ctrl.abort(),8500);
   try{const res=await fetch(providerUrl(provider,'geocode',this.state,query),{signal:ctrl.signal});if(!res.ok)throw Error(`HTTP ${res.status}`);
    const parsed=parseMeasurements(category,provider.id,await res.json());
    if(searchController.signal.aborted)throw Error('Search canceled by a newer request.');
    this.setStatus(category,'available',`Search matched ${parsed.value.name}, ${parsed.value.country}`,provider.label,null,provider.type);
    return parsed.value;
   }catch(err){if(searchController.signal.aborted)throw Error('Search canceled by a newer request.');errors.push(`${provider.label}: ${err.message}`);}finally{clearTimeout(timeout);searchController.signal.removeEventListener('abort',stop);} 
  }
  this.setStatus(category,this.settings.mode==='ask'?'action-needed':'unavailable',errors.join(' | '));
  throw Error(`${errors.join(' | ')}. Switch geocoding provider under Sources, or enter coordinates/grid manually.`);
 }
 invalidateLocation(){
  this.abortCategory('terrain');this.searchController?.abort();
  for(const category of ['terrain','geocode']){
   if(this.provenance[category])this.provenance[category].status='stale';
   if(['imported','connecting','available'].includes(this.status[category]?.status))this.setStatus(category,'stale','Station coordinates changed; prior result refers to the old coordinates. Refresh this category.');
  }
 }
 invalidateDate(){
  for(const category of ['sfi','kp','ssn']){
   this.abortCategory(category);
   if(this.provenance[category])this.provenance[category].status='stale';
   if(['imported','connecting','available'].includes(this.status[category]?.status))this.setStatus(category,'stale','Simulation date changed; imported value remains as a manual scenario input, not a measurement for the selected date.');
  }
 }
 resetStatuses(){this.cancel();this.status={};this.provenance={};this.render();}
 markManual(key){
  const category=Object.entries(SOURCE_CATEGORIES).find(([,v])=>v.field===key)?.[0];
  if(category){this.abortCategory(category);delete this.provenance[category];this.setStatus(category,'manual','Value was changed by the user; previously imported observation no longer applies.');}
 }
}
