/** Strictly validate saved/imported scenarios before mutating live app state. */
export function validatedScenario(candidate, defaults, metadata={}) {
 if(!candidate || typeof candidate!=='object' || Array.isArray(candidate))throw Error('Missing scenario settings.');
 const result={...defaults};
 for(const [key,initial] of Object.entries(defaults)){
  if(!Object.prototype.hasOwnProperty.call(candidate,key))continue;
  const value=candidate[key];
  if(typeof value!==typeof initial)throw Error(`Invalid ${key} type.`);
  if(typeof value==='number'){
   if(!Number.isFinite(value))throw Error(`Invalid ${key} numeric value.`);
   const range=metadata[key];
   if(range && (value<range[0] || value>range[1]))throw Error(`${key} outside allowed range.`);
   if(['hops','month'].includes(key)&&!Number.isInteger(value))throw Error(`${key} must be a whole number.`);
   result[key]=value;
  }else if(key==='dateISO'){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'1900-01-01' || value>'2100-12-31' || Number.isNaN(Date.parse(value+'T12:00:00Z')) || new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Invalid calendar date.');
   result[key]=value;
  }else if(key==='layer'){if(!['F2','E'].includes(value))throw Error('Unsupported layer.');result[key]=value;}
  else if(key==='academyLayer'){if(!['D','E','F1','F2'].includes(value))throw Error('Unsupported academy layer.');result[key]=value;}
  else if(key==='noisePreset'){if(!['rural','suburban','urban','qrm'].includes(value))throw Error('Invalid noise preset.');result[key]=value;}
  else if(key==='mode'){if(!['CW','SSB','FT8'].includes(value))throw Error('Invalid communications mode.');result[key]=value;}
  else if(['txAntenna','rxAntenna'].includes(key)){if(!metadata.antennaIds?.includes(value))throw Error(`Unknown antenna: ${value}`);result[key]=value;}
  else result[key]=value;
 }
 if(Math.abs(result.txLat-result.rxLat)+Math.abs(result.txLon-result.rxLon)<0.00001)throw Error('TX and RX must have different coordinates.');
 result.month=Number(result.dateISO.slice(5,7));
 result.antennaHeight=result.txHeightM*result.frequency/299.792458;
 return result;
}
