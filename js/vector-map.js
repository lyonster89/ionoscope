import {solarDate,solarPosition,terminatorCurve,interpolateGreatCircle,unwrapPath,wrapLongitude} from './solar-geometry.js?v=2.4';
import {WORLD_GEOMETRIES} from './world-data.js?v=2.4';

/**
 * Completely self-contained map. No Leaflet, map servers, fetch, API keys or
 * browser geolocation are needed to draw continents or manipulate stations.
 * Natural Earth public-domain geometry is imported as a local ES module.
 */
export function createVectorMap(host,{state,onChange,showStatus}){
  host.replaceChildren();host.classList.add('is-vector-map');
  const canvas=document.createElement('canvas');
  canvas.className='offline-world-canvas';
  canvas.tabIndex=0;
  canvas.setAttribute('role','application');
  canvas.setAttribute('aria-label','Interactive world map: select PLACE TX or PLACE RX and click to move a station. Drag markers. Scroll or use plus/minus buttons to zoom.');
  host.append(canvas);
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx){showStatus('Your browser does not support Canvas 2D. Use the latitude and longitude fields below.');return {update(){},fit(){},resize(){},destroy(){}};}
  const background=document.createElement('canvas'),bg=background.getContext('2d',{alpha:false});
  let width=800,height=440,scaleDpr=1,zoom=1,centerLat=0,centerLon=0;
  let dirty=true,lastDateKey='',drag=null,active=true,moveStart=null,lastPoint=null;
  const limit=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const getScale=()=>Math.min(width/360,height/180)*zoom;
  const deltaLon=(lon)=>wrapLongitude(lon-centerLon);
  const xy=(lat,lon)=>[width/2+deltaLon(lon)*getScale(),height/2-(lat-centerLat)*getScale()];
  const xyUnwrapped=(lat,lon)=>[width/2+(lon-centerLon)*getScale(),height/2-(lat-centerLat)*getScale()];
  const coord=(x,y)=>({lat:limit(centerLat+(height/2-y)/getScale(),-90,90),lon:wrapLongitude(centerLon+(x-width/2)/getScale())});
  const setContext=(g)=>{g.setTransform(scaleDpr,0,0,scaleDpr,0,0);};
  const label=(g,txt,x,y,color='#b4d4e0',size=10)=>{g.font=`600 ${size}px ui-monospace, SFMono-Regular, monospace`;g.fillStyle=color;g.fillText(txt,x,y);};

  // All coastline vertices remain locally available even if the user is offline.
  function drawLand(){
    bg.fillStyle='#244958';bg.strokeStyle='#628d9a';bg.lineWidth=.75;
    const unit=getScale();
    const ring=(points,offset)=>{
      if(points.length<3)return;
      let first=null,prevLon=null;
      bg.beginPath();
      for(const c of points){
        let lon=c[0];
        if(prevLon!==null)lon+=360*Math.round((prevLon-lon)/360);
        if(first===null)first=lon;
        prevLon=lon;
        const x=width/2+(lon+offset-centerLon)*unit;
        const y=height/2-(c[1]-centerLat)*unit;
        if(c===points[0])bg.moveTo(x,y);else bg.lineTo(x,y);
      }
      bg.closePath();bg.fill();bg.stroke();
    };
    for(const g of WORLD_GEOMETRIES){
      const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
      for(const p of polys){
        // Render each landmass in adjacent world copies. This keeps Fiji and
        // Siberia correctly visible when panning across +/-180 degrees.
        for(const offset of [-360,0,360])for(const r of p)ring(r,offset);
      }
    }
  }
  function drawGrid(){
    bg.fillStyle='#0d2a3b';bg.fillRect(0,0,width,height);
    bg.strokeStyle='rgba(132,169,185,.20)';bg.lineWidth=.7;
    for(let lat=-80;lat<=80;lat+=20){const y=xy( lat,centerLon)[1];if(y<0||y>height)continue;bg.beginPath();bg.moveTo(0,y);bg.lineTo(width,y);bg.stroke();label(bg,`${lat}°`,7,y-5,'#7899aa',9);}
    for(let lon=-540;lon<=540;lon+=30){const x=xyUnwrapped(0,lon)[0];if(x<0||x>width)continue;bg.beginPath();bg.moveTo(x,0);bg.lineTo(x,height);bg.stroke();label(bg,`${wrapLongitude(lon)}°`,x+3,14,'#7899aa',9);}
  }
  function drawSolar(){
    const date=solarDate(state.dateISO,state.utcHour),unit=getScale();
    bg.fillStyle='rgba(3,11,28,.35)';
    // 6 degree mesh is sufficient for an educational day/night illustration.
    // This is cached, NOT recalculated during a station drag.
    for(let lat=-90;lat<90;lat+=6){for(let lon=-180;lon<180;lon+=6){
      if(solarPosition(lat+3,lon+3,date).elevation>=0)continue;
      for(const offset of [-360,0,360]){
        const a=xyUnwrapped(lat+6,lon+offset),b=xyUnwrapped(lat,lon+6+offset);
        if(b[0]<0||a[0]>width||b[1]<0||a[1]>height)continue;
        bg.fillRect(a[0],a[1],b[0]-a[0]+.7,b[1]-a[1]+.7);
      }
    }}
    const points=terminatorCurve(date,2);
    bg.strokeStyle='#ffc879';bg.lineWidth=1.7;bg.setLineDash([7,6]);
    // The solar terminator is a closed great circle; no pole-to-pole artifacts.
    for(const offset of [-360,0,360]){
      bg.beginPath();let prev=null;
      for(const [lat,lon] of points){const p=xyUnwrapped(lat,lon+offset);
        if(!prev||Math.abs(p[0]-prev[0])>150*unit)bg.moveTo(...p);else bg.lineTo(...p);prev=p;
      }bg.stroke();
    }bg.setLineDash([]);
  }
  function drawPlaceNames(){
    // Landmarks make the offline map intelligible even when imagery is blocked.
    const landmarks=[['Seattle',47.606,-122.332],['Denver',39.739,-104.99],['San Francisco',37.775,-122.419],['New York',40.713,-74.006],['Chicago',41.878,-87.63],['Honolulu',21.309,-157.858],['London',51.507,-.128],['Berlin',52.52,13.405],['Tokyo',35.68,139.69],['Sydney',-33.87,151.21],['Cape Town',-33.93,18.42],['São Paulo',-23.55,-46.63],['Anchorage',61.22,-149.9]];
    bg.lineWidth=1;
    for(const [name,lat,lon] of landmarks){const p=xy(lat,lon);if(p[0]<12||p[0]>width-70||p[1]<15||p[1]>height-15)continue;
      bg.fillStyle='#b7d7e6';bg.beginPath();bg.arc(p[0],p[1],2,0,2*Math.PI);bg.fill();label(bg,name,p[0]+5,p[1]-4,'#b7d7e6',10);
    }
  }
  function paintBackground(){
    if(!active)return;
    setContext(bg);bg.clearRect(0,0,width,height);
    drawGrid();drawLand();drawSolar();drawPlaceNames();dirty=false;
    lastDateKey=`${state.dateISO}/${state.utcHour}`;
  }
  function paintRoute(){
    const pts=unwrapPath(interpolateGreatCircle(state.txLat,state.txLon,state.rxLat,state.rxLon,120));
    ctx.strokeStyle='#7bffce';ctx.lineWidth=3.8;ctx.shadowColor='#37ceae';ctx.shadowBlur=9;
    for(const offset of [-360,0,360]){
      let prev=null;ctx.beginPath();
      for(const [lat,lon] of pts){const p=xyUnwrapped(lat,lon+offset);
        if(!prev||Math.abs(p[0]-prev[0])>170*getScale())ctx.moveTo(...p);else ctx.lineTo(...p);prev=p;
      }ctx.stroke();
    }
    ctx.shadowBlur=0;
    for(const [lat,lon,name,color] of [[state.txLat,state.txLon,'TX','#7cfecc'],[state.rxLat,state.rxLon,'RX','#ffd17d']]){
      const [x,y]=xy(lat,lon);if(x<-20||x>width+20||y<-20||y>height+20)continue;
      ctx.beginPath();ctx.arc(x,y,14,0,2*Math.PI);ctx.fillStyle='rgba(0,14,25,.75)';ctx.fill();
      ctx.beginPath();ctx.arc(x,y,8,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke();
      ctx.font='bold 12px ui-monospace, monospace';ctx.fillStyle='#fff';ctx.fillText(name,x+17,y-12);
    }
  }
  function draw(){
    if(!active)return;
    const dateKey=`${state.dateISO}/${state.utcHour}`;if(dirty||lastDateKey!==dateKey)paintBackground();
    setContext(ctx);ctx.clearRect(0,0,width,height);ctx.drawImage(background,0,0,width*scaleDpr,height*scaleDpr,0,0,width,height);
    paintRoute();
    ctx.fillStyle='rgba(4,20,32,.88)';ctx.fillRect(0,height-27,width,27);
    label(ctx,width<480?'CLICK TO PLACE  •  DRAG STATIONS  •  +/- ZOOM':'OFFLINE WORLD MAP  •  CLICK TO PLACE  •  DRAG STATIONS  •  SCROLL TO ZOOM',12,height-10,'#a9e5df',10);
  }
  function resize(){
    if(!active)return;
    const rect=host.getBoundingClientRect();const w=Math.max(260,Math.round(rect.width)),h=Math.max(280,Math.round(rect.height));
    const dpr=Math.min(2,window.devicePixelRatio||1);
    if(w===width&&h===height&&dpr===scaleDpr){draw();return;}
    width=w;height=h;scaleDpr=dpr;
    for(const c of [canvas,background]){c.width=Math.ceil(w*dpr);c.height=Math.ceil(h*dpr);}
    canvas.style.width='100%';canvas.style.height='100%';dirty=true;draw();
  }
  function fit(){
    const pts=unwrapPath(interpolateGreatCircle(state.txLat,state.txLon,state.rxLat,state.rxLon,100));
    let minLat=90,maxLat=-90,minLon=Infinity,maxLon=-Infinity;
    for(const [lat,lon] of pts){minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);}
    centerLon=wrapLongitude((minLon+maxLon)/2);centerLat=limit((minLat+maxLat)/2,-75,75);
    const base=Math.min(width/360,height/180);
    // Limit the zoom of the coarse offline basemap: very tight zooms look blank
    // because country boundaries are not street-level detail.
    zoom=limit(Math.min(width/Math.max(28,(maxLon-minLon)*1.65),height/Math.max(20,(maxLat-minLat)*1.8))/base,.85,4.5);
    dirty=true;draw();
  }
  function zoomBy(factor){zoom=limit(zoom*factor,.7,15);dirty=true;draw();}
  function eventPos(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*width/r.width,y:(e.clientY-r.top)*height/r.height};}
  function markerAt(p){for(const [id,lat,lon] of [['tx',state.txLat,state.txLon],['rx',state.rxLat,state.rxLon]]){const m=xy(lat,lon);if(Math.hypot(p.x-m[0],p.y-m[1])<21)return id;}return null;}
  function place(id,p){const {lat,lon}=coord(p.x,p.y);onChange({[`${id}Lat`]:+lat.toFixed(5),[`${id}Lon`]:+lon.toFixed(5)});draw();}
  canvas.addEventListener('pointerdown',e=>{const p=eventPos(e);drag=markerAt(p)||'background';moveStart=p;lastPoint=p;canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    const p=eventPos(e);
    if(!drag){const c=coord(p.x,p.y);const readout=host.querySelector('.map-coordinate-readout');if(readout)readout.textContent=`${c.lat.toFixed(2)}°, ${c.lon.toFixed(2)}°`;return;}
    if(drag==='background'&&Math.hypot(p.x-moveStart.x,p.y-moveStart.y)>8)drag='pan';
    if(drag==='pan'){centerLon=wrapLongitude(centerLon-(p.x-lastPoint.x)/getScale());centerLat=limit(centerLat+(p.y-lastPoint.y)/getScale(),-85,85);dirty=true;draw();}
    else if(drag==='tx'||drag==='rx')place(drag,p);
    lastPoint=p;
  });
  canvas.addEventListener('pointerup',e=>{
    if(drag==='background'){const p=eventPos(e),target=host.dataset.target||'rx';place(target,p);}
    drag=null;moveStart=null;
  });
  canvas.addEventListener('pointercancel',()=>{drag=null;moveStart=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1.25:.8);},{passive:false});
  canvas.addEventListener('dblclick',e=>{e.preventDefault();const p=eventPos(e),c=coord(p.x,p.y);centerLon=c.lon;centerLat=c.lat;zoomBy(1.5);});
  canvas.addEventListener('keydown',e=>{
    if(e.key==='+'||e.key==='='){zoomBy(1.25);e.preventDefault();}
    else if(e.key==='-'){zoomBy(.8);e.preventDefault();}
    else if(e.key==='Enter'||e.key===' '){place(host.dataset.target||'rx',{x:width/2,y:height/2});e.preventDefault();}
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      const step=12/getScale();if(e.key==='ArrowLeft')centerLon=wrapLongitude(centerLon-step);
      if(e.key==='ArrowRight')centerLon=wrapLongitude(centerLon+step);
      if(e.key==='ArrowUp')centerLat=limit(centerLat+step,-85,85);
      if(e.key==='ArrowDown')centerLat=limit(centerLat-step,-85,85);
      dirty=true;draw();e.preventDefault();
    }
  });
  const toolbar=document.createElement('div');toolbar.className='map-overlay-tools';
  toolbar.innerHTML='<button type="button" aria-label="Zoom in" title="Zoom in">+</button><button type="button" aria-label="Zoom out" title="Zoom out">−</button><span class="map-coordinate-readout" aria-live="off">Move pointer for coordinates</span>';
  host.append(toolbar);
  toolbar.children[0].addEventListener('click',()=>zoomBy(1.35));
  toolbar.children[1].addEventListener('click',()=>zoomBy(1/1.35));
  let observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>resize()):null;
  observer?.observe(host);
  const windowResize=()=>resize();window.addEventListener('resize',windowResize,{passive:true});
  resize();fit();
  return {
    update(){draw();},resize,fit,
    destroy(){active=false;observer?.disconnect();window.removeEventListener('resize',windowResize);host.classList.remove('is-vector-map');host.replaceChildren();}
  };
}
