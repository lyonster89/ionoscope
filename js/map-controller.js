import {bearingDeg,interpolateGreatCircle,solarDate,solarPosition,terminatorCurve,unwrapPath,wrapLongitude,maidenheadToCoords} from './solar-geometry.js?v=2.4';
import {createVectorMap} from './vector-map.js?v=2.4';
import {greatCircleDistanceKm} from './propagation-engine.js?v=2.4';

const BASEMAPS={
 osm:{name:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'},
 topo:{name:'OpenTopoMap',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://opentopomap.org">OpenTopoMap</a> CC-BY-SA',subdomains:'abc'}
};
/** Interactive worldwide map with a genuinely local/offline vector fallback. */
export function initMap({state,onChange,showStatus,dataManager}){
 const host=document.getElementById('worldMap');if(!host)return {update(){}};
 host.dataset.target='rx';
 const selector=document.getElementById('mapBasemap');let controller=null,mode=selector?.value||'vector',chosen='rx',disposed=false;
 const message=(text)=>{const el=document.getElementById('mapEngineStatus');if(el)el.textContent=text;};
 const pathPoints=()=>unwrapPath(interpolateGreatCircle(state.txLat,state.txLon,state.rxLat,state.rxLon,120));
 function mapMetadata(){
   const pts=pathPoints(),date=solarDate(state.dateISO,state.utcHour),mid=pts[Math.floor(pts.length/2)];
   const sun=solarPosition(mid[0],mid[1],date),bearing=bearingDeg(state.txLat,state.txLon,state.rxLat,state.rxLon);
   const label=document.getElementById('mapMeta');if(label)label.textContent=`${greatCircleDistanceKm(state.txLat,state.txLon,state.rxLat,state.rxLon).toFixed(0)} km · initial bearing ${bearing.toFixed(1)}° · midpoint Sun ${sun.elevation.toFixed(1)}° · gold dashed: solar terminator`;
   const stations=document.getElementById('mapStationSummary');if(stations){stations.replaceChildren();for(const [id,lat,lon] of [['TX',state.txLat,state.txLon],['RX',state.rxLat,state.rxLon]]){const span=document.createElement('span');const strong=document.createElement('strong');strong.textContent=id+' ';span.append(strong,document.createTextNode(`${lat.toFixed(4)}°, ${lon.toFixed(4)}°`));stations.append(span);}}
 }
 function vector(reason){
   if(disposed)return;
   controller?.destroy?.();controller=createVectorMap(host,{state,onChange,showStatus});
   message(reason||'Vector map active · bundled coastlines · no network or map tiles required');
 }
 function leaflet(base){
   if(!window.L){vector('Online map engine unavailable. Offline world map remains active.');if(selector)selector.value='vector';mode='vector';return;}
   const probe=document.createElement('div');probe.className='leaflet-pane';host.append(probe);const leafletCssOk=getComputedStyle(probe).position==='absolute';probe.remove();
   if(!leafletCssOk){vector('Leaflet styles were blocked. Offline world map remains active.');if(selector)selector.value='vector';mode='vector';return;}
   controller?.destroy?.();host.replaceChildren();host.classList.remove('is-vector-map');
   // SVG avoids Leaflet's queued Canvas repaint touching a disposed context
   // when a failed tile layer immediately switches back to the offline map.
   const map=L.map(host,{zoomControl:true,worldCopyJump:false,preferCanvas:false,attributionControl:true,minZoom:1,maxZoom:16,scrollWheelZoom:false});
   let alive=true,loadingTimer=null,okTiles=0,failedTiles=0,layer,activeBase=base;
   const selected=BASEMAPS[base]||BASEMAPS.osm;
   const layerOpt={maxZoom:19,maxNativeZoom:18,attribution:selected.attribution,...(selected.subdomains?{subdomains:selected.subdomains}:{})};
   layer=L.tileLayer(selected.url,layerOpt).addTo(map);
   const fallback=(reason)=>{
     if(!alive||mode==='vector')return;
     if(mode==='auto'&&activeBase==='osm'){
       const p=BASEMAPS.topo;message('OpenStreetMap tiles unavailable; trying OpenTopoMap…');
       // Switch only after reporting the source to avoid silently using another provider.
       activeBase='topo';layer.off();map.removeLayer(layer);layer=L.tileLayer(p.url,{...layerOpt,subdomains:p.subdomains,attribution:p.attribution}).addTo(map);
       attachEvents('topo');return;
     }
     // Never leave a blank or partially tiled map even when the user chose a
     // specific online basemap. The user can retry it from the selector.
     vector(reason+' Offline world map restored. You can retry an online basemap.');
     if(selector)selector.value='vector';mode='vector';
   };
   const attachEvents=(source)=>{
     okTiles=0;failedTiles=0;
     layer.on('tileload',()=>{okTiles++;if(okTiles===1){clearTimeout(loadingTimer);message(`${source==='topo'?'OpenTopoMap':selected.name} map tiles loaded · drag TX/RX markers to reposition`);}});
     layer.on('tileerror',()=>{failedTiles++;if(failedTiles>=5&&failedTiles>okTiles*1.5)fallback('Map tile service is not responding.');});
     clearTimeout(loadingTimer);
     loadingTimer=setTimeout(()=>{if(alive&&okTiles===0)fallback('Map imagery did not load.');},8500);
   };
   attachEvents(base);
   const marker=(name,color)=>L.marker([0,0],{
     draggable:true,title:`Drag ${name} station`,icon:L.divIcon({className:'ionoscope-marker',html:`<span class="ionoscope-pin ${color}">${name}</span>`,iconSize:[42,36],iconAnchor:[21,29]})
   }).addTo(map).bindPopup(`${name} / ${name==='TX'?'Transmitter':'Receiver'}`);
   const tx=marker('TX','tx'),rx=marker('RX','rx');
   const route=L.polyline([],{color:'#7ce9c3',weight:3,opacity:.95,interactive:false}).addTo(map);
   const terminatorLayer=L.layerGroup().addTo(map);let lastStamp='';
   const place=(id,m)=>{const v=m.getLatLng();onChange({[`${id}Lat`]:+Math.max(-90,Math.min(90,v.lat)).toFixed(5),[`${id}Lon`]:+wrapLongitude(v.lng).toFixed(5)});};
   tx.on('dragend',()=>place('tx',tx));rx.on('dragend',()=>place('rx',rx));
   map.on('click',e=>onChange({[`${chosen}Lat`]:+e.latlng.lat.toFixed(5),[`${chosen}Lon`]:+wrapLongitude(e.latlng.lng).toFixed(5)}));
   function update({center=false}={}){
      const pts=pathPoints(),date=solarDate(state.dateISO,state.utcHour),stamp=date.toISOString().slice(0,16);
      tx.setLatLng([state.txLat,pts[0][1]]);rx.setLatLng([state.rxLat,pts.at(-1)[1]]);route.setLatLngs(pts);
      if(stamp!==lastStamp){lastStamp=stamp;terminatorLayer.clearLayers();
        // Sweep a true ordered great circle, then render neighboring world copies.
        const curve=terminatorCurve(date,2);
        for(const offset of [-360,0,360]){
          let part=[],prev=null;
          const flush=()=>{if(part.length>1)L.polyline(part,{color:'#f6b96f',weight:1.7,opacity:.8,dashArray:'6 5',interactive:false}).addTo(terminatorLayer);part=[];};
          for(const p of curve){const point=[p[0],p[1]+offset];
            // At equinox the curve passes through a pole, where longitude is undefined.
            if(prev&&Math.abs(point[1]-prev[1])>45&&Math.abs(point[0])>85)flush();
            part.push(point);prev=point;
          }flush();
        }
      }
      if(center){const bounds=L.latLngBounds(pts);if(bounds.isValid())map.fitBounds(bounds.pad(.32),{maxZoom:7,animate:false});}
   }
   const resize=()=>map.invalidateSize({pan:false});
   const ob=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>resize()):null;ob?.observe(host);
   let delayed=setTimeout(()=>{if(!alive)return;resize();update({center:true});},120);
   controller={update,fit:()=>update({center:true}),resize,destroy:()=>{alive=false;clearTimeout(delayed);clearTimeout(loadingTimer);ob?.disconnect();map.off();map.remove();host.replaceChildren();}};
   message(`Connecting to ${selected.name} map tiles…`);
 }
 function start(){
   try {if(mode==='vector')vector();else leaflet(mode==='auto'?'osm':mode);}
   catch(error){vector('Map provider failed to initialize ('+error.message+'). Offline world map is active.');if(selector)selector.value='vector';}
   controller?.update?.({center:true});mapMetadata();
 }
 if(selector)selector.addEventListener('change',()=>{mode=selector.value;start();});
 document.querySelectorAll('[data-map-target]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mapTarget===chosen));b.addEventListener('click',()=>{
   chosen=b.dataset.mapTarget;host.dataset.target=chosen;document.querySelectorAll('[data-map-target]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});
 });});
 document.getElementById('zoomPathBtn')?.addEventListener('click',()=>controller?.fit?.());
 document.getElementById('swapStationsBtn')?.addEventListener('click',()=>{onChange({txLat:state.rxLat,txLon:state.rxLon,rxLat:state.txLat,rxLon:state.txLon});controller?.fit?.();});
 for(const endpoint of ['tx','rx']){
   document.getElementById(`${endpoint}GridGo`)?.addEventListener('click',()=>{
      try{const p=maidenheadToCoords(document.getElementById(`${endpoint}Grid`).value);onChange({[`${endpoint}Lat`]:p.lat,[`${endpoint}Lon`]:p.lon});controller?.fit?.();}
      catch(e){showStatus(e.message);}
   });
   // Search and grid fields must behave like ordinary forms when Enter is pressed.
   for(const kind of ['Grid','Search']){
     const field=document.getElementById(`${endpoint}${kind}`),go=document.getElementById(`${endpoint}${kind}Go`);
     field?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();go?.click();}});
   }
   document.getElementById(`${endpoint}SearchGo`)?.addEventListener('click',async()=>{
     const q=document.getElementById(`${endpoint}Search`).value.trim();if(!q)return;
     try{showStatus('Searching enabled geocoding provider(s)…');const p=await dataManager.searchLocation(q);
       onChange({[`${endpoint}Lat`]:p.lat,[`${endpoint}Lon`]:p.lon});controller?.fit?.();showStatus(`${endpoint.toUpperCase()} set to ${p.name}, ${p.country||''}`);
     }catch(e){showStatus(`Location search failed: ${e.message}`);}
   });
 }
 start();
 return {update:()=>{controller?.update?.();mapMetadata();},resize:()=>controller?.resize?.(),fit:()=>controller?.fit?.()};
}
