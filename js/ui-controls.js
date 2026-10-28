import {ANTENNAS} from './antenna-models.js?v=2.4';
export const EXPLAIN = {
 dateISO:['UTC simulation date','Later dates shift Earth-Sun geometry and supported historical or forecast context.','Earlier dates may change season and available observations; date-dependent solar geometry is not monotonic.'],
 txAntenna:['TX antenna type','A more directional design may increase gain toward a selected bearing and elevation.','Less directional designs distribute power more broadly; total gain depends on installation.'],
 rxAntenna:['RX antenna type','Directional receive antennas can increase target-direction gain and reduce some interference.','Other antenna choices trade gain against coverage and noise pickup.'],
 noisePreset:['Receiver noise environment','Higher-noise presets make weak signals harder to decode.','Quieter environments increase the calculated SNR.'],
 layer:['Ionospheric layer','Higher F2 layers often support longer virtual hops.','Lower E layers normally support shorter distances in this model.'],
 mode:['Demodulation mode','A more robust weak-signal mode can decode at lower SNR.','A more demanding mode requires more received signal above noise.'],
 academyLayer:['Selected academy layer','Higher layers persist differently with solar illumination.','Lower layers include D absorption, E refraction and sporadic E behavior.'],

 txLat:['TX latitude','Moving TX north/south changes the path geometry, bearing, solar illumination and which antenna lobes point toward RX.','Moving it in the opposite direction reverses those geographic changes.'],
 txLon:['TX longitude','Moving TX east changes great-circle geometry and solar local time.','Moving west reverses the longitude contribution.'],
 rxLat:['RX latitude','Moving RX north modifies distance, bearing and midpoint daylight.','Moving south can improve or worsen a given path.'],
 rxLon:['RX longitude','Moving RX east changes path length, azimuth and day/night geometry.','Moving west changes those factors in the reverse direction.'],
 frequency:['Frequency','Higher frequency raises free-space loss and generally reduces D-region absorption, but may exceed MUF.','Lower frequency usually increases D-layer absorption and can fall below LUF.'],
 elevation:['Takeoff angle','Higher angles shorten virtual hops and can favor NVIS but lower angle-specific MUF.','Lower angles lengthen hops and can exploit directional low-angle gain; the antenna must radiate there.'],
 virtualHeight:['Virtual ionospheric height','Higher virtual reflection height extends hop geometry at a fixed angle.','Lower virtual height shortens the hop distance at a fixed angle.'],
 hops:['Hop count','More hops provide additional range geometry but introduce ionospheric and ground-bounce losses.','Fewer hops can reduce loss but may be too short to reach the receiver.'],
 academyFrequency:['Academy frequency','Higher frequencies eventually penetrate the demonstration ionosphere.','Lower frequencies can return but may experience more absorption in reality.'],
 academyCritical:['Critical frequency fo','Higher fo raises the maximum usable frequency in the secant-law illustration.','Lower fo makes higher operating frequencies escape.'],
 sfi:['10.7 cm solar flux','Sustained higher solar activity can increase F-region ionization and MUF.','Lower activity often lowers F-region critical frequencies. F10.7 is only a proxy.'],
 ssn:['Sunspot number','A larger multiweek mean often indicates stronger solar EUV and F-region ionization.','A lower mean often reduces usable upper-HF bands; effects are not instantaneous.'],
 k:['Planetary Kp','Higher Kp suggests geomagnetic disturbance; modeled path MUF/absorption may deteriorate.','Lower Kp generally corresponds to quieter conditions, but does not guarantee propagation.'],
 a:['Daily A-index','Higher A indicates accumulated geomagnetic disturbance and may reduce HF reliability.','Lower A generally indicates a calmer global field.'],
 month:['UTC calendar month','Moving later changes solar declination and seasonal ionospheric assumptions.','Moving earlier changes them in the opposite direction; seasonal effects are not monotonic.'],
 utcHour:['UTC hour','Moving later shifts the daylight terminator and local solar time along the route.','Moving earlier shifts daylight to an earlier time; nighttime D-layer losses usually decrease.'],
 txPower:['Transmitter power','Doubling power adds about +3 dB to received signal power, with all else fixed.','Halving power reduces received power by about 3 dB.'],
 feedlineLoss:['Feedline loss','Every 1 dB additional line loss removes 1 dB from the transmitted link budget.','Reducing line loss directly improves modeled receive strength.'],
 txGain:['TX calibration gain offset','Adds dB to the calculated TX directional antenna gain.','Subtracts dB from the modeled TX contribution; use to calibrate known measurements.'],
 rxGain:['RX calibration gain offset','Adds dB to the calculated receive-direction gain.','Subtracts dB from RX gain. Antenna noise behavior is more complex than a gain number.'],
 antennaHeight:['TX antenna height in wavelengths','Changing height shifts horizontal antenna vertical lobes and nulls.','Lowering height can favor high-angle NVIS; response oscillates and is not monotonic.'],
 noiseOffset:['Noise adjustment','Higher noise floor reduces SNR by an equal number of dB.','Lower noise floor increases SNR; improvements can enable weaker modes.'],
 txHeightM:['TX antenna height','Raising a horizontal radiator changes height in wavelengths and its elevation lobes.','Lowering it shifts lobes; vertical or other designs behave differently.'],
 rxHeightM:['RX antenna height','Raising receiving antenna changes its elevation response in this model.','Lowering it may favor a different elevation angle.'],
 txAzimuth:['TX orientation','Rotating toward the receiving bearing can increase gain, depending on antenna broadside/beam axis.','Rotating away can create pattern nulls; omnidirectional verticals change little.'],
 rxAzimuth:['RX orientation','Pointing a directional receive antenna toward TX generally increases modeled gain.','Turning away often reduces signal and sometimes interference.'],
 txEfficiency:['TX radiation efficiency','Improving efficiency directs more accepted power into radiation.','Lower efficiency increases resistive loss, reducing received power.'],
 rxEfficiency:['RX efficiency','Higher efficiency increases modeled receiver signal capture.','Lower efficiency decreases the modeled signal; it may also change received noise.'],
 groundIndex:['Ground-loss index','Higher soil/radial loss reduces efficiency of ground-mounted verticals.','Improved radial/soil systems reduce ground losses; horizontal pattern differs.'],
 txCustomGain:['TX custom gain','Higher calibrated gain increases modeled transmitter gain in target direction.','Lower gain reduces received power. Applies only with custom antenna.'],
 rxCustomGain:['RX custom gain','Higher calibrated RX gain raises modeled received power.','Lower RX gain lowers signal strength. Applies only with custom antenna.'],
};
export const ANTENNA_CONTROLS = {
 tx:[['txHeightM','Installation height',1,80,.5,'m'],['txAzimuth','Orientation / azimuth',0,359,1,'°'],['txEfficiency','Radiation efficiency',1,100,1,'%'],['txCustomGain','Custom gain (custom antenna)',-20,25,.5,'dBi'],['groundIndex','Ground / radial loss index',0,10,.5,'index']],
 rx:[['rxHeightM','Installation height',1,80,.5,'m'],['rxAzimuth','Orientation / azimuth',0,359,1,'°'],['rxEfficiency','Radiation efficiency',1,100,1,'%'],['rxCustomGain','Custom gain (custom antenna)',-20,25,.5,'dBi']],
};
export function makeInfo(key){
 const details=EXPLAIN[key];const info=document.createElement('button');info.type='button';info.className='info-icon';info.textContent='?';info.dataset.help=details?`${details[0]}. ↑ ${details[1]} ↓ ${details[2]}`:`${key}: Changing this setting updates the relevant simulation and diagnostics.`;
 info.setAttribute('aria-label',info.dataset.help);info.title=info.dataset.help;
 info.addEventListener('click',(e)=>{e.preventDefault();document.getElementById('helpBoxText').textContent=info.dataset.help;document.getElementById('helpBox').hidden=false;});
 return info;
}
export function setupEducationalControls(){
 for(const side of ['tx','rx']){
  const sel=document.getElementById(`${side}Antenna`);
  for(const [value,ant] of Object.entries(ANTENNAS)){
    if(side==='tx'&&ant.rxOnly)continue;
    const opt=document.createElement('option');opt.value=value;opt.textContent=ant.label;sel.append(opt);
  }
  const host=document.getElementById(`${side}AntennaControls`);
  for(const [key,label,min,max,step,unit] of ANTENNA_CONTROLS[side]){
   const line=document.createElement('div');line.className='v2-control';
   const title=document.createElement('div');title.className='v2-control-label';
   const span=document.createElement('span');span.textContent=label;title.append(span,makeInfo(key));
   const inputs=document.createElement('div');inputs.className='v2-control-row';
   for(const type of ['range','number']){
    const input=document.createElement('input');Object.assign(input,{type,min:String(min),max:String(max),step:String(step)});
    input.dataset.field=key;input.setAttribute('aria-label',`${label}, ${type==='number'?'type number':'slider'}`);
    if(type==='number')input.className='value-input';inputs.append(input);
   }
   const units=document.createElement('small');units.textContent=unit;units.style.color='var(--muted)';inputs.append(units);
   line.append(title,inputs);host.append(line);
  }
 }
 for(const [key,help] of Object.entries(EXPLAIN)){
   const field=document.querySelector(`[data-field="${key}"]`);if(!field)continue;
   const label=field.closest('label')||field.parentElement;
   if(label && !label.querySelector('.info-icon'))label.append(makeInfo(key));
 }
 const box=document.createElement('aside');box.id='helpBox';box.className='help-box';box.hidden=true;box.setAttribute('role','status');box.setAttribute('aria-live','polite');
 const close=document.createElement('button');close.type='button';close.textContent='×';close.title='Close explanation';close.addEventListener('click',()=>box.hidden=true);
 const content=document.createElement('span');content.id='helpBoxText';box.append(close,content);document.body.append(box);
 // Native titles provide a fallback on browser configurations without hover/focus pseudo-elements.
 document.querySelectorAll('select[data-field],input[data-field]').forEach(el=>{const h=EXPLAIN[el.dataset.field];if(h)el.title=`${h[0]}. Increase: ${h[1]} Decrease: ${h[2]}`;});
}
