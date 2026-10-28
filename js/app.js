import {
  DEFAULT_STATE, BANDS, MODE_THRESHOLDS_DB, clamp, evaluatePath, evaluateBand,
  frequencyWindowCurve, angleMufMHz, criticalFrequencyMHz, sMeterLabel,
} from './propagation-engine.js?v=2.4';
import {
  drawRayCanvas, drawHopComparison, drawSkipCanvas, drawAntennaPattern, drawFallbackChart, drawAntennaPolar,
} from './visualizers.js?v=2.4';

import {ANTENNAS} from './antenna-models.js?v=2.4';
import {validatedScenario} from './scenario-validation.js?v=2.4';
import {antennaImpact} from './antenna-models.js?v=2.4';
import {initMap} from './map-controller.js?v=2.4';
import {DataImportManager} from './data-import.js?v=2.4';
import {setupEducationalControls,EXPLAIN} from './ui-controls.js?v=2.4';
import {bearingDeg,solarDate,solarPosition} from './solar-geometry.js?v=2.4';
const now = new Date();
const state = { ...DEFAULT_STATE, dateISO:now.toISOString().slice(0,10), month:now.getUTCMonth()+1,utcHour:now.getUTCHours()+now.getUTCMinutes()/60 };
state.antennaHeight=state.txHeightM*state.frequency/299.792458;
let mapApi=null, dataManager=null, baseline=null, lastChanged=null, timer=null, previousPath=null, previousValue=null;

const $ = (id) => document.getElementById(id);
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const numberFields = new Set(Object.keys(DEFAULT_STATE).filter((k) => typeof DEFAULT_STATE[k] === 'number'));
const coordinateFields = new Set(['txLat','txLon','rxLat','rxLon']);
const allowedFields = Object.keys(DEFAULT_STATE);
const routePresets = {
  'seattle-denver': [47.6062,-122.3321,39.7392,-104.9903],
  'newyork-chicago': [40.7128,-74.006,41.8781,-87.6298],
  'london-berlin': [51.5072,-.1276,52.52,13.405],
};
const ranges = { txLat: [-90,90], rxLat: [-90,90], txLon: [-180,180], rxLon: [-180,180] };
const scenarioBounds=()=>{const out={...ranges,antennaIds:Object.keys(ANTENNAS)};document.querySelectorAll('[data-field][type="range"]').forEach(input=>out[input.dataset.field]=[Number(input.min),Number(input.max)]);return out;};
const maxMin=(key,v)=>{const input=document.querySelector(`[data-field="${key}"][type="range"]`);return input?clamp(v,Number(input.min),Number(input.max)):v;};
let chart = null;
let scheduled = false;
let toastTimer = null;
let lastValidPath = null;

function fmt(n, decimals = 1) { return Number.isFinite(Number(n)) ? Number(n).toFixed(decimals) : '—'; }
function clock(hour){const mins=((Math.round(hour*60)%1440)+1440)%1440;return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;}
function syncInputs() {
  document.querySelectorAll('[data-field]').forEach((input) => {
    const key = input.dataset.field;
    if (Object.prototype.hasOwnProperty.call(state,key) && document.activeElement !== input) input.value = state[key];
  });
  document.querySelectorAll('[data-field][type="range"]').forEach((input) => {
    const lower = Number(input.min); const higher = Number(input.max);
    input.style.setProperty('--pct', `${clamp(100*(Number(input.value)-lower)/(higher-lower),0,100)}%`);
  });
}
function updateOutputs() {
  const templates = {
    frequency: `${fmt(state.frequency,2)} MHz`, elevation: `${fmt(state.elevation,1)}°`,
    virtualHeight: `${state.virtualHeight} km`, hops: `${state.hops} hop${state.hops > 1 ? 's' : ''}`,
    academyFrequency: `${fmt(state.academyFrequency,1)} MHz`, academyCritical: `${fmt(state.academyCritical,1)} MHz`,
    txPower: `${state.txPower} W`, feedlineLoss: `${fmt(state.feedlineLoss)} dB`,
    txGain: `${fmt(state.txGain)} dBi`, rxGain: `${fmt(state.rxGain)} dBi`,
    antennaHeight: `${fmt(state.antennaHeight,2)} λ`, noiseOffset: `${state.noiseOffset >= 0 ? '+' : ''}${state.noiseOffset} dB`,
    sfi: state.sfi, ssn: state.ssn, k: state.k, a: state.a,
    utcHour: clock(state.utcHour), month: months[state.month-1],
  };
  document.querySelectorAll('[data-out]').forEach((el) => { el.textContent = templates[el.dataset.out] ?? '—'; });
}
function validCoordinates() {
  for (const key of coordinateFields) {
    const [lo,hi] = ranges[key];
    if (!Number.isFinite(state[key]) || state[key] < lo || state[key] > hi) return false;
  }
  const diff = Math.abs(state.txLat-state.rxLat)+Math.abs(state.txLon-state.rxLon);
  return diff > .00001;
}
function requestRender() {
  if (scheduled) return;
  scheduled = true;
  // Some WebKit/background contexts suspend animation frames. Keep controls
  // responsive there too, while still coalescing normal foreground updates.
  let frame=null,timeout=null;
  const flush=()=>{
    if(!scheduled)return;
    scheduled=false;clearTimeout(timeout);if(frame!==null)cancelAnimationFrame(frame);
    render();
  };
  timeout=setTimeout(flush,100);
  frame=requestAnimationFrame(flush);
}
function setState(key, value) {
  if (!allowedFields.includes(key)) return;
  if (key === 'dateISO') {
    try { validatedScenario({dateISO:value},state,scenarioBounds()); } catch { return; }
  }
  previousPath=validCoordinates()?evaluatePath(state):null;previousValue=state[key];
  if (numberFields.has(key)) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    if (coordinateFields.has(key) && (next < ranges[key][0] || next > ranges[key][1])) return;
    state[key] = ['hops','month'].includes(key) ? Math.round(maxMin(key,next)) : maxMin(key,next);
  } else state[key] = value;
  if (key === 'layer') state.virtualHeight = value === 'E' ? 110 : 300;
  if (key === 'antennaHeight') state.txHeightM=clamp(state.antennaHeight*299.792458/state.frequency,1,80);
  if (key === 'txHeightM'||key==='frequency') state.antennaHeight=state.txHeightM*state.frequency/299.792458;
  if (key === 'dateISO' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {state.month=Number(value.slice(5,7));if(previousValue!==value)dataManager?.invalidateDate();}
  if (key === 'month' && Number.isInteger(state.month)) {dataManager?.invalidateDate();state.dateISO=`${state.dateISO.slice(0,5)}${String(state.month).padStart(2,'0')}-${String(Math.min(Number(state.dateISO.slice(8,10)),28)).padStart(2,'0')}`;}
  if (dataManager) dataManager.markManual(key);
  lastChanged=key;
  syncInputs(); updateOutputs(); updatePresetSelection(); requestRender();
}
function updatePresetSelection() {
  const keys = ['txLat','txLon','rxLat','rxLon'];
  document.querySelectorAll('[data-route]').forEach((button) => {
    const coords = routePresets[button.dataset.route];
    const matches = keys.every((k,i) => Math.abs(coords[i]-state[k]) < .0001);
    button.classList.toggle('active',matches);
  });
}
function readSharedScenario() {
  const query = new URLSearchParams(location.search);
  const candidate={};
  for (const key of allowedFields) {
    if (!query.has(key)) continue;
    const value = query.get(key);
    if (numberFields.has(key)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || value.trim() === '') continue;
      if (coordinateFields.has(key) && (parsed < ranges[key][0] || parsed > ranges[key][1])) continue;
      const input = document.querySelector(`[data-field="${key}"]`);
      if (input?.type === 'range' && (parsed < Number(input.min) || parsed > Number(input.max))) continue;
      candidate[key] = parsed;
    } else {
      const input = document.querySelector(`[data-field="${key}"]`);
      if (key === 'dateISO') candidate[key] = value;
      else if (key === 'academyLayer' && ['D','E','F1','F2'].includes(value)) candidate[key] = value;
      else if (input?.tagName === 'SELECT' && [...input.options].some((o) => o.value === value)) candidate[key] = value;
    }
  }
  try { Object.assign(state,validatedScenario(candidate,state,scenarioBounds())); }
  catch { showToast('Invalid shared scenario; using default settings.'); }
  // A shared URL includes layer and virtual height separately to preserve explicit scenarios.
}
function setupInputs() {
  document.querySelectorAll('[data-field]').forEach((input) => {
    const key = input.dataset.field;
    input.addEventListener('input', () => {
      if (input.type === 'number' && input.value.trim() === '') return;
      if (input.type === 'date' && !input.value) return;
      const next = numberFields.has(key) ? Number(input.value) : input.value;
      if (coordinateFields.has(key) && (!Number.isFinite(next) || next < ranges[key][0] || next > ranges[key][1])) {
        $('coordinateError').hidden = false;
        return;
      }
      if (key === 'txLat' || key === 'txLon' || key === 'rxLat' || key === 'rxLon') {
        previousPath=validCoordinates()?evaluatePath(state):null;previousValue=state[key];lastChanged=key;
        state[key] = next; dataManager?.invalidateLocation();
        $('coordinateError').hidden = validCoordinates();
        syncInputs(); requestRender(); updatePresetSelection(); return;
      }
      setState(key, next);
    });
    input.addEventListener('change', () => {
      if (numberFields.has(key) && !coordinateFields.has(key)) { const value=Number(input.value); if (!input.value.trim() || !Number.isFinite(value)) {input.value=state[key];} else {setState(key,value);input.value=state[key];} }
      if (coordinateFields.has(key)) {
        if (!input.value.trim() || !Number.isFinite(Number(input.value)) || Number(input.value) < ranges[key][0] || Number(input.value) > ranges[key][1]) {
          input.value = state[key]; $('coordinateError').hidden = validCoordinates();
        }
        if (input.value.trim() && Number.isFinite(Number(input.value))) { input.value=state[key]; }
        requestRender();
      }
    });
  });
  document.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => {
    const coords = routePresets[button.dataset.route];
    ['txLat','txLon','rxLat','rxLon'].forEach((key,i) => { state[key] = coords[i]; });dataManager?.invalidateLocation();
    $('coordinateError').hidden = true; syncInputs(); updatePresetSelection(); requestRender();
  }));
  document.querySelectorAll('[data-academy-layer]').forEach((button) => button.addEventListener('click', () => setState('academyLayer',button.dataset.academyLayer)));
  document.querySelectorAll('#layersSvg [data-layer]').forEach((layer) => {
    const choose = () => setState('academyLayer',layer.dataset.layer);
    layer.addEventListener('click', choose);
    layer.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); } });
  });
  $('utcTimeInput').addEventListener('input',()=>{if(!/^\d\d:\d\d$/.test($('utcTimeInput').value))return;const [h,m]=$('utcTimeInput').value.split(':').map(Number);setState('utcHour',h+m/60);});
  $('todayBtn').addEventListener('click',()=>{const d=new Date();setState('dateISO',d.toISOString().slice(0,10));setState('utcHour',d.getUTCHours()+d.getUTCMinutes()/60);});
  $('timePlayBtn').addEventListener('click',()=>{if(timer){clearInterval(timer);timer=null;$('timePlayBtn').textContent='▶ PLAY 24H';return;}
    $('timePlayBtn').textContent='Ⅱ PAUSE';timer=setInterval(()=>{let next=state.utcHour+.25;if(next>=24){next-=24;const d=new Date(state.dateISO+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);setState('dateISO',d.toISOString().slice(0,10));}setState('utcHour',next);},650);});
  $('themeBtn').addEventListener('click', () => {
    document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('ionoscope-theme', document.body.dataset.theme); } catch { /* storage may be unavailable */ }
    $('themeBtn').innerHTML = document.body.dataset.theme === 'dark' ? '<i data-lucide="sun"></i><span id="themeLabel">DAYLIGHT</span>' : '<i data-lucide="moon"></i><span id="themeLabel">DARK MODE</span>';
    $('themeBtn').setAttribute('aria-label',`Switch to ${document.body.dataset.theme === 'dark' ? 'daylight' : 'dark'} theme`);
    if (window.lucide) window.lucide.createIcons();
    if (chart) { chart.destroy(); chart = null; }
    requestRender();
  });
  $('resetBtn').addEventListener('click', () => {
    Object.assign(state, DEFAULT_STATE,{dateISO:new Date().toISOString().slice(0,10),month:new Date().getUTCMonth()+1,utcHour:new Date().getUTCHours()+new Date().getUTCMinutes()/60});state.antennaHeight=state.txHeightM*state.frequency/299.792458;dataManager?.resetStatuses();
    try { history.replaceState(null,'',location.pathname+location.hash); } catch { /* embedded preview */ }
    $('coordinateError').hidden = true; syncInputs(); updatePresetSelection(); updateOutputs(); requestRender(); showToast('Scenario reset to defaults.');
  });
  $('shareBtn').addEventListener('click', async () => {
    const query = new URLSearchParams();
    for (const key of allowedFields) query.set(key,String(state[key]));
    const url = `${location.origin}${location.pathname}?${query.toString()}#raylab`;
    try { await navigator.clipboard.writeText(url); showToast('Shareable scenario link copied.'); }
    catch { window.prompt('Copy this shareable scenario URL:',url); }
  });
}
function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderTelemetry(p) {
  $('metricDistance').textContent = Math.round(p.distanceKm).toLocaleString();
  $('metricMuf').textContent = p.aim === null ? '—' : fmt(p.pathMuf);
  $('metricRx').textContent = fmt(p.rxDbm);
  $('metricSUnits').textContent = `${sMeterLabel(p.rxDbm)}  /  2.5 kHz noise reference`;
  const labels = { open:'PATH REACHABLE', escape:'FREQUENCY TOO HIGH', absorption:'ABSORPTION LIMIT', overshoot:'OVERSHOOT / SKIP', undershoot:'UNDERSHOOT', weak:'SNR BELOW THRESHOLD', range:'OUT OF RANGE' };
  $('metricStatus').textContent = labels[p.status];
  $('metricStatus').className = `metric-status ${p.status === 'open' ? '' : (p.status === 'weak' || p.status === 'absorption' ? 'warning' : 'failure')}`;
  $('metricMargin').textContent = `${p.marginDb >= 0 ? '+' : ''}${fmt(p.marginDb)} dB ${state.mode} mode margin · modeled`;
  $('pathHeadline').textContent = {
    open:'The ray can reach the destination', escape:'Frequency above the angle-specific MUF',
    absorption:'D-region absorption / LUF failure', overshoot:'The ray overshoots the receiver',
    undershoot:'The ray falls inside the skip distance', weak:'Geometry works; receiver SNR does not',
    range:'The requested hop cannot span this path',
  }[p.status];
  $('pathReason').textContent = p.reason + (p.status === 'open' ? '' : ' Any RX dBm and SNR displayed are hypothetical link-budget terms, not a predicted delivered signal.');
  $('reasonPanel').className = `result-panel ${p.status === 'open' ? '' : (p.status === 'weak' || p.status === 'absorption' ? 'warning' : 'failure')}`;
  $('infoFo').textContent = `${fmt(p.fo)} MHz`;
  $('infoAngleMuf').textContent = `${fmt(p.angleMuf)} MHz`;
  $('infoHopRange').textContent = `${Math.round(p.geometry.hopKm).toLocaleString()} km`;
  $('infoAim').textContent = p.aim === null ? 'No solution' : `${fmt(p.aim)}°`;
  $('infoDaylight').textContent = p.day > .8 ? 'Day' : p.day < .15 ? 'Night' : 'Twilight';
}
const layerContent = {
  D: {
    subtitle:'D / ATTENUATION REGION', title:'Where HF energy disappears',
    description:'Dense lower atmosphere means electrons collide often with neutral molecules. Solar illumination creates the D region, where absorption can dominate lower HF bands.',
    day:'Strongly replenished by solar radiation. Collisional losses can be severe at the low end of HF.',
    night:'Free electrons recombine rapidly. D-region absorption falls greatly after sunset.',
    cycle:'Solar flares can increase X-ray ionization abruptly; SFI itself is not a flare or D-absorption meter.',
  },
  E: {
    subtitle:'E / SHORT-RANGE REFRACTION', title:'The lower return path',
    description:'The E layer can return lower HF signals along relatively short skywave paths. Sporadic E is an additional mechanism not represented by the model.',
    day:'Ionization rises in daylight. foE usually strengthens around local daytime.',
    night:'Regular E ionization diminishes, so ordinary E-layer refraction becomes less likely.',
    cycle:'Seasonal variations and sporadic E are important; solar flux is only a weak proxy in this simplified model.',
  },
  F1: {
    subtitle:'F1 / DAYTIME SUBLAYER', title:'The F layer divides in daylight',
    description:'During the day the F region often separates into F1 and F2. F1 can affect how a ray is refracted on the way to F2.',
    day:'Often recognizable around 150–220 km. Provides intermediate electron density.',
    night:'Frequently becomes indistinguishable from the F2 region as ionization changes.',
    cycle:'Sun angle, geographic latitude and the solar cycle affect its formation and apparent height.',
  },
  F2: {
    subtitle:'F2 / LONG-HAUL REFRACTION', title:'The long-distance workhorse',
    description:'A high-altitude electron-density maximum refracts oblique HF signals across thousands of kilometers. The electron density determines vertical foF2.',
    day:'Usually stronger from solar extreme-UV ionization; higher oblique-path MUF often follows.',
    night:'Persists after sunset because recombination is slower at altitude, supporting night skywave paths.',
    cycle:'Solar maximum tends to support higher foF2. Season, latitude and geomagnetic storms can alter the response.',
  },
};
function renderAcademy(p) {
  const content = layerContent[state.academyLayer];
  $('layerLabel').textContent = content.subtitle; $('layerTitle').textContent = content.title;
  $('layerDescription').textContent = content.description; $('layerDay').textContent = content.day;
  $('layerNight').textContent = content.night; $('layerCycle').textContent = content.cycle;
  const solar = { sfi:state.sfi, ssn:state.ssn, k:state.k, a:state.a, month:state.month };
  const fo = criticalFrequencyMHz(state.academyLayer,solar,p.day,p.midpoint.lat);
  $('layerCritical').textContent = state.academyLayer === 'D' ? 'N/A · absorption' : `${fmt(fo)} MHz`;
  $('academyDayTag').textContent = `${p.day > .8 ? 'DAY' : p.day < .15 ? 'NIGHT' : 'TWILIGHT'} / PATH MIDPOINT`;
  document.querySelectorAll('[data-academy-layer]').forEach((b) => b.classList.toggle('active',b.dataset.academyLayer === state.academyLayer));
  document.querySelectorAll('.solar-illustration').forEach((el) => { el.style.opacity = String(0.1 + 0.9 * p.day); });
  document.querySelectorAll('#layersSvg [data-layer]').forEach((el) => {
    const alpha = el.dataset.layer === 'D' ? .20 + .80 * p.day : el.dataset.layer === 'E' || el.dataset.layer === 'F1' ? .40 + .60 * p.day : .8;
    el.style.opacity = String(alpha);
    const selected = el.dataset.layer === state.academyLayer;
    el.classList.toggle('selected',selected);
    el.setAttribute('aria-pressed',String(selected));
  });
  const threshold = angleMufMHz(state.academyCritical,25);
  $('skipExplanation').textContent = state.academyFrequency <= threshold
    ? `${fmt(state.academyFrequency)} MHz is below the oblique-path MUF of ${fmt(threshold)} MHz at 25°. In the virtual-mirror model, the ray returns to Earth after a skip distance; stations closer than that first touchdown may not hear it.`
    : `${fmt(state.academyFrequency)} MHz exceeds the angle-specific MUF (${fmt(threshold)} MHz). The layer is not dense enough to turn this oblique ray back. Lower the frequency, increase fo, or reduce elevation to explore the secant-law boundary.`;
  const denominator = 30;
  const luf = clamp(p.luf,0,denominator); const muf = clamp(p.pathMuf,0,denominator);
  const usable = Math.max(0,muf-luf);
  $('windowLower').style.width = `${luf/denominator*100}%`;
  $('windowUsable').style.width = `${usable/denominator*100}%`;
  $('windowUpper').style.width = `${(denominator-Math.max(luf,muf))/denominator*100}%`;
  $('windowFrequency').style.left = `${clamp(state.frequency/denominator*100,0,100)}%`;
  $('windowLufLabel').textContent = `LUF ${fmt(p.luf)} MHz`;
  $('windowFotLabel').textContent = `FOT ${p.aim === null ? '—' : fmt(p.fot)}`;
  $('windowMufLabel').textContent = `MUF ${p.aim === null ? '—' : fmt(p.pathMuf)}`;
}
function renderBudget(p) {
  $('budgetRx').textContent = fmt(p.rxDbm);
  $('budgetSnr').textContent = `${p.snrDb >= 0 ? '+' : ''}${fmt(p.snrDb)}`;
  $('budgetMargin').textContent = `${p.marginDb >= 0 ? '+' : ''}${fmt(p.marginDb)}`;
  $('budgetEquation').textContent = `${p.status === 'open' ? '' : '[HYPOTHETICAL: path not usable] '}${fmt(p.txDbm)} dBm TX − ${fmt(state.feedlineLoss)} dB coax + ${fmt(state.txGain + p.txAntennaGain + state.rxGain + p.rxAntennaGain)} dB pattern & corrections − ${fmt(p.fsplDb)} dB FSPL − ${fmt(p.absorptionDb + p.ordinaryIonoDb + p.groundDb+p.polarizationLossDb)} dB other = ${fmt(p.rxDbm)} dBm RX`;
  $('snrIndicator').style.left = `${clamp((p.marginDb + 20) / 60 * 100,1,99)}%`;
  $('lobeGainLabel').textContent = `${fmt(p.txAntennaGain)} dBi TX · ${fmt(p.rxAntennaGain)} dBi RX · ${fmt(state.elevation)}°`;
  const rows = [
    ['TX available power','Transmitter output',p.txDbm,'positive'],
    ['Feedline insertion loss','Cable / connectors',-state.feedlineLoss,'negative'],
    ['TX antenna pattern',`${ANTENNAS[state.txAntenna]?.label}, ${p.txBearing.toFixed(0)}° bearing`,p.txAntennaGain,p.txAntennaGain>=0?'positive':'negative'],
    ['TX gain correction','User calibration offset',state.txGain,state.txGain>=0?'positive':'negative'],
    ['RX antenna pattern',`${ANTENNAS[state.rxAntenna]?.label}, ${p.rxBearing.toFixed(0)}° bearing`,p.rxAntennaGain,p.rxAntennaGain>=0?'positive':'negative'],
    ['RX gain correction','User calibration offset',state.rxGain,state.rxGain>=0?'positive':'negative'],
    ['Polarization allowance','Illustrative mismatch; ionosphere rotates polarization',-p.polarizationLossDb,'negative'],
    ['Free-space path loss',`${Math.round(p.geometry.slantKm*p.hops).toLocaleString()} km ray / ${fmt(state.frequency)} MHz`,-p.fsplDb,'negative'],
    ['D-region absorption',`${state.hops} hop(s) · solar illumination`,-p.absorptionDb,'negative'],
    ['Other ionospheric loss','Heuristic scatter / fading',-p.ordinaryIonoDb,'negative'],
    ['Ground reflections',`${Math.max(0,state.hops-1)} intermediate bounce(s)`,-p.groundDb,'negative'],
  ];
  const holder = $('budgetBreakdown'); holder.replaceChildren();
  for (const [name,description,value,sign] of rows) {
    const row = document.createElement('div'); row.className = 'waterfall-row';
    const title = document.createElement('div'); title.className='waterfall-title';
    const strong = document.createElement('strong'); strong.textContent=name;
    const small = document.createElement('small'); small.textContent=description;
    title.append(strong,small);
    const track = document.createElement('div'); track.className='waterfall-track';
    const bar = document.createElement('i'); bar.style.width=`${clamp(Math.abs(value)/135*100, value === 0 ? 0 : 2,100)}%`; bar.className=sign==='positive'?'positive':'';
    track.append(bar);
    const end = document.createElement('span'); end.className='waterfall-value';
    end.textContent = `${value >= 0 ? '+' : ''}${fmt(value)} ${name === 'TX available power' ? 'dBm' : 'dB'}`;
    row.append(title,track,end); holder.append(row);
  }
}
function renderHops(p) {
  for (let hop = 1; hop <= 3; hop++) {
    const info = drawHopComparison($(`hop${hop}Canvas`),state,p,hop);
    $(`hop${hop}Label`).textContent = info.aim === null ? 'NO GEOMETRY' : `${fmt(info.aim)}° / ${info.ok ? 'RETURN' : 'ESCAPE'}`;
    $(`hop${hop}Label`).style.color = info.ok ? 'var(--green)' : 'var(--rose)';
  }
}
function renderBands() {
  const holder = $('bandMatrix'); holder.replaceChildren();
  for (const band of BANDS) {
    const result = evaluateBand(state,band.frequency);
    const button = document.createElement('button'); button.type='button';
    button.className='band-row';
    button.title=`${band.name}: ${result.reason}. Click to set operating frequency.`;
    button.setAttribute('aria-label',`${band.name}, ${fmt(band.frequency,2)} MHz, modeled ${result.status}. Select band.`);
    const name = document.createElement('strong'); name.className='band-name'; name.textContent=band.name;
    const mid = document.createElement('span'); mid.className='band-data'; mid.textContent=`${fmt(band.frequency,2)} MHz`;
    const sm = document.createElement('small'); sm.textContent = result.margin === null ? '—' : `${result.margin >= 0 ? '+' : ''}${fmt(result.margin)} dB ${state.mode} margin`;
    mid.append(sm);
    const status = document.createElement('strong'); status.className=`band-status ${result.status}`;
    status.textContent = result.status.toUpperCase();
    button.append(name,mid,status);
    if (Math.abs(band.frequency - state.frequency) < .051) button.style.borderColor='var(--green)';
    button.addEventListener('click',() => setState('frequency',band.frequency));
    holder.append(button);
  }
}
function renderChart() {
  const curve = frequencyWindowCurve(state);
  $('chartDayLabel').textContent=`UTC / ${state.dateISO}`;
  $('chartInsight').textContent=`At ${String(Math.floor(state.utcHour)).padStart(2,'0')}:${String(Math.round((state.utcHour%1)*60)).padStart(2,'0')} UTC, approximate LUF is ${fmt(curve[Math.floor(state.utcHour)].luf)} MHz, FOT is ${fmt(curve[Math.floor(state.utcHour)].fot)} MHz, and path MUF is ${fmt(curve[Math.floor(state.utcHour)].muf)} MHz. Path-specific ionization is illustrative.`;
  if (!window.Chart) { drawFallbackChart($('windowChart'),curve); return; }
  const isLight = document.body.dataset.theme==='light';
  const grid = isLight ? '#dce6e9' : '#27384c';
  const font = isLight ? '#586b78' : '#8fa5b9';
  const values = [
    { label:'LUF', key:'luf',color:isLight?'#ad6300':'#f3b66e' },
    { label:'MUF', key:'muf',color:isLight?'#087fbd':'#73d3f4' },
    { label:'FOT', key:'fot',color:isLight?'#058b70':'#78ecc6' },
  ];
  const datasets = values.map((v) => ({ label:v.label, data:curve.map((a)=>a[v.key]),
    borderColor:v.color, backgroundColor: v.label==='MUF' ? (isLight?'#058b7019':'#78ecc624') : 'transparent',
    pointRadius: 0, pointHoverRadius: 4, borderWidth:v.label==='FOT'?1.8:2.4,
    tension:.35, fill:v.label==='MUF' ? '-1' : false, borderDash:v.label==='FOT'?[5,5]:[],
  }));
  const config = {type:'line',data:{labels:curve.map((p)=>`${String(p.hour).padStart(2,'0')}:00`),datasets},
    options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{intersect:false,mode:'index'},
      plugins:{legend:{display:false}, tooltip:{backgroundColor:isLight?'#fff':'#101b2a',titleColor:isLight?'#152536':'#eaf3f6',bodyColor:font,borderColor:grid,borderWidth:1,callbacks:{label:(ctx)=>`${ctx.dataset.label}: ${fmt(ctx.parsed.y)} MHz`}}},
      scales:{x:{grid:{color:grid,drawTicks:false},ticks:{color:font,font:{family:'JetBrains Mono',size:9},maxTicksLimit:8,maxRotation:0},border:{display:false}},
        y:{min:0,suggestedMax:35,grid:{color:grid},ticks:{color:font,font:{family:'JetBrains Mono',size:10},callback:(v)=>`${v} MHz`},border:{display:false}}}}};
  if (chart) { chart.data.labels=config.data.labels; chart.data.datasets=datasets; chart.update('none'); }
  else chart = new window.Chart($('windowChart').getContext('2d'),config);
}
function renderAntenna(p){
 const omni=new Set(['vertical','groundplane','custom']);
 for(const [key,enabled] of [
  ['txHeightM',!omni.has(state.txAntenna)&&state.txAntenna!=='beverage'],
  ['rxHeightM',!omni.has(state.rxAntenna)&&state.rxAntenna!=='beverage'&&state.rxAntenna!=='vertloop'],
  ['txAzimuth',!omni.has(state.txAntenna)],['rxAzimuth',!omni.has(state.rxAntenna)],
  ['txCustomGain',state.txAntenna==='custom'],['rxCustomGain',state.rxAntenna==='custom'],
  ['groundIndex',['vertical','groundplane'].includes(state.txAntenna)||['vertical','groundplane'].includes(state.rxAntenna)],
 ]){
  const row=document.querySelector(`#antenna [data-field="${key}"]`)?.closest('.v2-control');
  if(row){row.classList.toggle('control-inactive',!enabled);row.title=enabled?'':'Not modeled for the currently selected antenna. Choose a relevant antenna to activate this control.';row.querySelectorAll('input').forEach(el=>el.disabled=!enabled);}
 }
 drawAntennaPolar($('antennaElevationCanvas'),state,'elevation');drawAntennaPolar($('antennaAzimuthCanvas'),state,'azimuth');
 $('antennaNarrative').textContent=antennaImpact(state.txAntenna,{frequency:state.frequency,heightM:state.txHeightM,elevation:state.elevation,azimuth:state.txAzimuth,bearing:p.txBearing,efficiency:state.txEfficiency,ground:state.groundIndex,customGain:state.txCustomGain});
 $('antennaRxNarrative').textContent=`${ANTENNAS[state.rxAntenna]?.label} · RX directional gain ${fmt(p.rxAntennaGain)} dBi toward TX on ${fmt(p.rxBearing)}° bearing. TX→RX difference, efficiency and polarization enter link budget.`;
}
function updateComparison(p){
 const holder=$('comparisonPanel');if(!baseline){holder.innerHTML='<div class="compare-cell">No baseline yet. Click CAPTURE BASELINE, change a variable, and view the results side by side.</div>';return;}
 holder.replaceChildren();
 for(const [title,snapshot,path] of [['BASELINE',baseline.state,baseline.path],['CURRENT',state,p]]){
  const card=document.createElement('div');card.className='compare-cell';
  const h=document.createElement('h3');h.textContent=title;card.append(h);
  const fields=[`TX: ${ANTENNAS[snapshot.txAntenna]?.label}` ,`RX: ${ANTENNAS[snapshot.rxAntenna]?.label}`,`Frequency: ${snapshot.frequency.toFixed(2)} MHz`,`Time: ${snapshot.dateISO} ${snapshot.utcHour.toFixed(2)} UTC`,`RX power: ${path.rxDbm.toFixed(1)} dBm`,`SNR: ${path.snrDb.toFixed(1)} dB`,`Status: ${path.status.toUpperCase()}`];
  fields.forEach(t=>{const line=document.createElement('p');line.textContent=t;card.append(line);});holder.append(card);
 }
 const diff=document.createElement('div');diff.className='compare-cell';diff.style.gridColumn='1/-1';
 const delta=p.rxDbm-baseline.path.rxDbm;diff.textContent=`RECEIVED SIGNAL CHANGE: ${delta>=0?'+':''}${delta.toFixed(1)} dB. TX antenna pattern ${p.txAntennaGain.toFixed(1)} vs ${baseline.path.txAntennaGain.toFixed(1)} dBi; RX antenna ${p.rxAntennaGain.toFixed(1)} vs ${baseline.path.rxAntennaGain.toFixed(1)} dBi; absorption ${p.absorptionDb.toFixed(1)} vs ${baseline.path.absorptionDb.toFixed(1)} dB. The selected change ${lastChanged||'in scenario'} caused the recalculated outcome.`;holder.append(diff);
}
function setupComparison(){
 const key='ionoscope-scenarios-v2';let saved=[];try{saved=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(saved))saved=[];}catch{}
 const refresh=()=>{$('savedScenarios').replaceChildren();saved.slice(-8).forEach((v,i)=>{const b=document.createElement('button');b.textContent=`LOAD ${v.label}`;b.addEventListener('click',()=>{try{Object.assign(state,validatedScenario(v.state,DEFAULT_STATE,scenarioBounds()));dataManager?.resetStatuses();syncInputs();updateOutputs();requestRender();showToast('Saved scenario loaded.');}catch(err){showToast(`Invalid saved scenario: ${err.message}`);}});$('savedScenarios').append(b);});};
 $('baselineBtn').addEventListener('click',()=>{baseline={state:{...state},path:evaluatePath(state)};requestRender();showToast('Baseline captured. Change a variable to compare.');});
 $('saveScenarioBtn').addEventListener('click',()=>{const label=`${new Date().toLocaleString()} / ${state.frequency} MHz`;saved.push({label,state:{...state}});saved=saved.slice(-8);try{localStorage.setItem(key,JSON.stringify(saved));}catch{}refresh();showToast('Scenario saved in this browser.');});
 $('exportScenarioBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({schema:'ionoscope-v2',state,sourcePreferences:dataManager?.settings},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ionoscope-scenario.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});
 $('importScenarioBtn').addEventListener('click',()=>$('scenarioFile').click());
 $('scenarioFile').addEventListener('change',async(e)=>{const f=e.target.files[0];if(!f)return;try{if(f.size>100_000)throw Error('File too large.');const data=JSON.parse(await f.text());if(data.schema!=='ionoscope-v2'||!data.state)throw Error('Invalid IONOSCOPE v2 file.');Object.assign(state,validatedScenario(data.state,DEFAULT_STATE,scenarioBounds()));dataManager?.resetStatuses();syncInputs();updateOutputs();requestRender();showToast('Scenario imported.');}catch(err){showToast(`Import rejected: ${err.message}`);}e.target.value='';});refresh();
}
function render() {
  if (!validCoordinates()) { $('coordinateError').hidden=false; return; }
  $('coordinateError').hidden=true;
  const p=evaluatePath(state); lastValidPath=p;
  if(previousPath&&lastChanged){
   const delta=p.rxDbm-previousPath.rxDbm,muf=p.pathMuf-previousPath.pathMuf,loss=p.absorptionDb-previousPath.absorptionDb;
   const info=EXPLAIN[lastChanged];
   $('changeInsight').textContent=`${info?.[0]||lastChanged}: ${previousValue??'previous'} → ${state[lastChanged]??'new location'}. Modeled RX ${delta>=0?'+':''}${delta.toFixed(1)} dB; path MUF ${muf>=0?'+':''}${muf.toFixed(1)} MHz; absorption ${loss>=0?'+':''}${loss.toFixed(1)} dB. ${info?.[1]||'The simulated path and antenna alignment have been recalculated.'}`;
   previousPath=null;
  }
  syncInputs(); updateOutputs();
  renderTelemetry(p); renderAcademy(p); renderBudget(p); renderBands(); renderChart();
  drawRayCanvas($('rayCanvas'),state,p); renderHops(p);
  drawSkipCanvas($('skipCanvas'),state); drawAntennaPattern($('lobeCanvas'),state);
  renderAntenna(p);mapApi?.update();updateComparison(p);
  if(document.activeElement!==$('utcTimeInput'))$('utcTimeInput').value=clock(state.utcHour);
}
function navObserver() {
  const sections = document.querySelectorAll('main > section');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    const visible=entries.filter((e)=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);
    if (!visible.length) return;
    document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active',link.dataset.nav===visible[0].target.id));
  },{rootMargin:'-10% 0px -57% 0px',threshold:[0,.1,.25,.5]});
  sections.forEach((section)=>io.observe(section));
}
function boot() {
  try { if (localStorage.getItem('ionoscope-theme') === 'light') document.body.dataset.theme='light'; } catch { /* private mode may prohibit storage */ }
  if (document.body.dataset.theme==='light') {
    $('themeBtn').innerHTML='<i data-lucide="moon"></i><span id="themeLabel">DARK MODE</span>';
    $('themeBtn').setAttribute('aria-label','Switch to dark theme');
  }
  setupEducationalControls();readSharedScenario();state.month=Number(state.dateISO.slice(5,7));state.antennaHeight=state.txHeightM*state.frequency/299.792458;
  syncInputs(); updateOutputs(); setupInputs(); updatePresetSelection();
  dataManager=new DataImportManager({state,onData:(category,result,provider)=>{
    const fields={sfi:'sfi',ssn:'ssn',kp:'k',a:'a'};
    if(fields[category]){previousPath=evaluatePath(state);previousValue=state[fields[category]];state[fields[category]]=result.value;lastChanged=fields[category];}
    if(category==='terrain'){$('sourceSummary').dataset.elevation=result.value.map(n=>n.toFixed(0)).join('m / ')+'m';}
    syncInputs();updateOutputs();requestRender();
  },onStatus:showToast});
  mapApi=initMap({state,onChange:(values)=>{previousPath=validCoordinates()?evaluatePath(state):null;previousValue='previous coordinates';lastChanged='location';Object.assign(state,values);dataManager?.invalidateLocation();syncInputs();updatePresetSelection();requestRender();},showStatus:showToast,dataManager});
  setupComparison();
  if (window.lucide) window.lucide.createIcons();
  navObserver();
  window.addEventListener('resize',requestRender,{passive:true});
  if ('ResizeObserver' in window) {
    const observer=new ResizeObserver(requestRender);
    ['rayCanvas','hop1Canvas','hop2Canvas','hop3Canvas','skipCanvas','lobeCanvas','antennaElevationCanvas','antennaAzimuthCanvas'].forEach((id)=>observer.observe($(id)));
  }
  // Populate telemetry before yielding: WebKit may defer the first animation
  // frame even though the map and document have already become visible.
  render();
}
boot();
