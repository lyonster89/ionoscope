/** Educational antenna radiation models, not NEC or measured 3D far-field files.
 * All responses return directional relative gain in dB with explicitly assumed losses.
 */
import {antennaLobeDb,clamp,toRad} from './math-utils.js?v=2.4';
export const ANTENNAS = Object.freeze({
 dipole:{label:'Horizontal ½-wave dipole',base:2.15,desc:'Broadside gain with ground-interference lobes; height strongly affects launch angle.',horizontal:true},
 invertedV:{label:'Inverted-V dipole',base:1.7,desc:'Drooped ends broaden azimuth coverage and reduce gain slightly.',horizontal:true},
 vertical:{label:'¼-wave ground-mounted vertical',base:3.0,desc:'Low-angle omnidirectional pattern depends strongly on radials and soil.',horizontal:false},
 endfed:{label:'End-fed half-wave',base:1.8,desc:'Installation-dependent multi-lobed horizontal pattern; model is approximate.',horizontal:true},
 randomwire:{label:'Random wire / tuner',base:0.0,desc:'Very installation-specific response; illustrative quasi-omnidirectional model.',horizontal:true},
 loop:{label:'Horizontal loop',base:2.8,desc:'Height and size shape a broad response; installation and perimeter matter.',horizontal:true},
 vertloop:{label:'Vertical loop',base:2.0,desc:'Directional broadside response, influenced by feed point and orientation.',horizontal:false},
 yagi:{label:'3-element Yagi',base:8.0,desc:'Strong forward beam and rear rejection; must point toward target bearing.',horizontal:true},
 trap:{label:'Multiband trap dipole',base:1.8,desc:'Dipole-like at resonance, but traps and higher-band lobes affect radiation.',horizontal:true},
 nvis:{label:'Low horizontal NVIS antenna',base:2.0,desc:'Optimizes high-angle coverage when the ionosphere supports the frequency.',horizontal:true},
 groundplane:{label:'Elevated ground-plane vertical',base:3.0,desc:'Quarter-wave vertical response; radial efficiency and elevation matter.',horizontal:false},
 beverage:{label:'Beverage RX antenna',base:-2.0,desc:'Directional low-noise receiving antenna. Typically unsuitable as a TX radiator.',horizontal:false,rxOnly:true},
 custom:{label:'Custom calibrated antenna',base:0,desc:'User-defined isotropic-relative gain with optional beam azimuth.',horizontal:false},
});
export function antennaDirectionalGainDb(type,{frequency=14.2,heightM=12,elevation=16,azimuth=0,bearing=0,efficiency=90,ground=0,customGain=0}={}){
 const ant=ANTENNAS[type]||ANTENNAS.dipole;
 const heightLambda=Math.max(.01,heightM*frequency/299.792458);
 const delta=Math.abs(((bearing-azimuth+540)%360)-180);
 const rad=toRad(delta);let azLoss=0,elevationLoss=0,groundLoss=0;
 if(type==='custom')return customGain+10*Math.log10(clamp(efficiency,1,100)/100);
 if(ant.horizontal){
   elevationLoss=antennaLobeDb(elevation,heightLambda);
   azLoss=type==='loop'||type==='nvis'?-1.5*Math.cos(rad)**2:
     type==='randomwire'?-3*Math.abs(Math.cos(rad)):
     type==='invertedV'?-4*Math.cos(rad)**2:
     -15*Math.cos(rad)**2;
   if(type==='yagi')azLoss=-Math.min(27,18*(1-Math.cos(rad))/2)+2;
   if(type==='endfed')azLoss-=2*Math.abs(Math.sin(2*rad));
   if(type==='nvis')elevationLoss= -0.018*(elevation-75)**2 + Math.min(0,antennaLobeDb(elevation,Math.min(.28,heightLambda))*.15);
 }else{
   const e=toRad(clamp(elevation,0,90));
   elevationLoss=20*Math.log10(Math.max(.025,Math.cos(e)**1.2));
   if(type==='vertloop')azLoss=-15*Math.cos(rad)**2;
   if(type==='beverage')azLoss=-Math.min(27,16*(1-Math.cos(rad)));
   if(['vertical','groundplane'].includes(type))groundLoss=ground*(type==='vertical'?.38:.22);
 }
 return ant.base+azLoss+elevationLoss+10*Math.log10(clamp(efficiency,1,100)/100)-groundLoss;
}
export function antennaImpact(type,params){
 const gain=antennaDirectionalGainDb(type,params);const name=(ANTENNAS[type]||ANTENNAS.dipole).label;
 return `${name}: ${gain.toFixed(1)} dBi estimated along ${params.bearing.toFixed(0)}° bearing at ${params.elevation.toFixed(1)}° elevation. Includes pattern, antenna efficiency and simplified ground allowance; not an NEC simulation.`;
}
