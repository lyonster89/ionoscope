/** UTC astronomical solar geometry; NOAA-style approximate equations, ~1° accuracy. */
import {clamp,toDeg,toRad,EARTH_RADIUS_KM} from './math-utils.js?v=2.4';
export function solarPosition(lat,lon, date) {
  const d = date instanceof Date ? date : new Date(date);
  const start = Date.UTC(d.getUTCFullYear(),0,0);
  const day = (d.getTime()-start)/86400000;
  const gamma = 2*Math.PI/365*(day-1);
  const eq = 229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
  const dec=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
  const minutes = d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60;
  const ha=toRad((((minutes+eq+4*lon)/4)%360+360)%360-180);
  const latitude=toRad(lat);
  const sinElev=Math.sin(latitude)*Math.sin(dec)+Math.cos(latitude)*Math.cos(dec)*Math.cos(ha);
  const elevation=toDeg(Math.asin(clamp(sinElev,-1,1)));
  return {elevation,daylight:clamp((elevation+6)/28,0,1),declination:toDeg(dec),hourAngle:toDeg(ha),equationOfTime:eq};
}
export function atUtc(dateISO, utcHour){
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dateISO||'')?dateISO:new Date().toISOString().slice(0,10);
  return new Date(`${day}T00:00:00.000Z`.replace('T00:00:00.000Z','T00:00:00.000Z')).getTime()+Math.round(utcHour*3600000);
}
export function solarDate(dateISO,utcHour){return new Date(atUtc(dateISO,utcHour));}
export function terminatorPoints(date,step=4){
  const out=[];
  for(let lon=-180;lon<=180;lon+=step){
    let prev=-90, v=solarPosition(-90,lon,date).elevation;
    const roots=[];
    for(let lat=-88;lat<=90;lat+=2){
      const next=solarPosition(lat,lon,date).elevation;
      if ((v<=0&&next>=0)||(v>=0&&next<=0)){
        let a=prev,b=lat;
        for(let k=0;k<10;k++){const m=(a+b)/2; if ((solarPosition(a,lon,date).elevation<=0)===(solarPosition(m,lon,date).elevation<=0))a=m;else b=m;}
        roots.push((a+b)/2);
      }prev=lat;v=next;
    }
    for(const lat of roots)out.push([lat,lon]);
  }
  return out;
}
/** Normalize longitudes when persisting station coordinates. */
export function wrapLongitude(lon){return ((lon+180)%360+360)%360-180;}
/** Unwrap a path onto one continuous world copy for map rendering near the date line. */
export function unwrapPath(points){
  if (!points.length) return [];
  const output=[[points[0][0],points[0][1]]];
  for(let i=1;i<points.length;i++){
    const last=output[i-1][1],raw=points[i][1];
    output.push([points[i][0],raw+360*Math.round((last-raw)/360)]);
  }
  return output;
}
/**
 * True solar grayline: intersection of Earth sphere with the plane perpendicular
 * to the Sun's unit vector. Sampling angle follows a continuous great circle.
 * Previous longitude-column root scans connected separate branches at the poles.
 */
export function terminatorCurve(date,stepDeg=2){
 const d=date instanceof Date?date:new Date(date),p=solarPosition(0,0,d);
 const minutes=d.getUTCHours()*60+d.getUTCMinutes()+d.getUTCSeconds()/60;
 const declination=toRad(p.declination);
 const subLon=toRad(wrapLongitude((720-minutes-p.equationOfTime)/4));
 const east=[-Math.sin(subLon),Math.cos(subLon),0];
 const north=[-Math.sin(declination)*Math.cos(subLon),-Math.sin(declination)*Math.sin(subLon),Math.cos(declination)];
 const pts=[];
 for(let deg=0;deg<=360;deg+=stepDeg){
   const t=toRad(deg),v=east.map((x,i)=>x*Math.cos(t)+north[i]*Math.sin(t));
   pts.push([toDeg(Math.atan2(v[2],Math.hypot(v[0],v[1]))),toDeg(Math.atan2(v[1],v[0]))]);
 }
 return unwrapPath(pts);
}
export function bearingDeg(aLat,aLon,bLat,bLon){
  const la=toRad(aLat),lb=toRad(bLat),dl=toRad(bLon-aLon);
  return (toDeg(Math.atan2(Math.sin(dl)*Math.cos(lb),Math.cos(la)*Math.sin(lb)-Math.sin(la)*Math.cos(lb)*Math.cos(dl)))+360)%360;
}
export function interpolateGreatCircle(aLat,aLon,bLat,bLon,steps=80){
 const a=[toRad(aLat),toRad(aLon)],b=[toRad(bLat),toRad(bLon)];
 const vector=([lat,lon])=>[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];
 const va=vector(a),vb=vector(b),dot=clamp(va.reduce((s,v,i)=>s+v*vb[i],0),-1,1),arc=Math.acos(dot);
 if(arc<1e-8)return [[aLat,aLon]];
 if(Math.PI-arc<1e-6){
   // Antipodal stations have infinitely many great circles; choose a deterministic orthogonal plane.
   const ref=Math.abs(va[2])<.95?[0,0,1]:[0,1,0];
   const orth=[va[1]*ref[2]-va[2]*ref[1],va[2]*ref[0]-va[0]*ref[2],va[0]*ref[1]-va[1]*ref[0]];
   const magnitude=Math.hypot(...orth);const u=orth.map(x=>x/magnitude);
   return Array.from({length:steps+1},(_,i)=>{const t=i/steps,cs=Math.cos(Math.PI*t),sn=Math.sin(Math.PI*t);
     const x=va[0]*cs+u[0]*sn,y=va[1]*cs+u[1]*sn,z=va[2]*cs+u[2]*sn;
     return [toDeg(Math.atan2(z,Math.hypot(x,y))),toDeg(Math.atan2(y,x))];});
 }
 return Array.from({length:steps+1},(_,i)=>{const t=i/steps,s=Math.sin(arc),w1=Math.sin((1-t)*arc)/s,w2=Math.sin(t*arc)/s;
 const x=va[0]*w1+vb[0]*w2,y=va[1]*w1+vb[1]*w2,z=va[2]*w1+vb[2]*w2;
 return [toDeg(Math.atan2(z,Math.hypot(x,y))),toDeg(Math.atan2(y,x))];});
}
export function maidenheadToCoords(locator){
 const s=locator.trim().toUpperCase();if(!/^[A-R]{2}\d{2}([A-X]{2}(\d{2})?)?$/.test(s))throw new Error('Maidenhead grid must have 4, 6, or 8 characters.');
 let lon=-180+(s.charCodeAt(0)-65)*20+Number(s[2])*2;
 let lat=-90+(s.charCodeAt(1)-65)*10+Number(s[3]);
 let lonW=2,latW=1;
 if(s.length>=6){lon+=(s.charCodeAt(4)-65)/12;lat+=(s.charCodeAt(5)-65)/24;lonW=1/12;latW=1/24;}
 if(s.length===8){lon+=Number(s[6])/120;lat+=Number(s[7])/240;lonW=1/120;latW=1/240;}
 return {lat:lat+latW/2,lon:lon+lonW/2};
}
export function kmToCentralAngle(km){return km/EARTH_RADIUS_KM;}
