/** Shared, dependency-free numeric helpers; breaks circular imports between physics and antenna/solar modules. */
export const EARTH_RADIUS_KM = 6371;
export const toRad = (degrees) => degrees * Math.PI / 180;
export const toDeg = (radians) => radians * 180 / Math.PI;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function antennaLobeDb(elevationDeg, antennaHeightLambda = 0.5) {
  const intensity = (angle) => Math.abs(Math.sin(2 * Math.PI * antennaHeightLambda * Math.sin(toRad(angle))));
  let max = 0;
  for (let i = 1; i <= 90; i += 0.5) max = Math.max(max, intensity(i));
  const ratio = intensity(elevationDeg) / Math.max(0.001, max);
  return clamp(20 * Math.log10(Math.max(0.0178, ratio)), -35, 0);
}

