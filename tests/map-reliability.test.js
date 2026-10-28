import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {terminatorCurve,solarPosition,interpolateGreatCircle,unwrapPath,wrapLongitude} from '../js/solar-geometry.js';

for(const when of ['2026-03-20T12:00:00Z','2026-06-21T00:00:00Z','2026-12-21T17:30:00Z']){
 test(`grayline curve tracks solar horizon on ${when}`,()=>{
  const d=new Date(when),curve=terminatorCurve(d,2);
  assert.equal(curve.length,181);
  for(const [lat,lon] of curve){
   assert.ok(Number.isFinite(lat)&&Number.isFinite(lon));
   assert.ok(Math.abs(lat)<=90);
   assert.ok(Math.abs(solarPosition(lat,lon,d).elevation)<.001,'grayline points must have ~0° solar elevation');
  }
 });
}
test('trans-Pacific stations follow short continuous path across date line',()=>{
 const pts=unwrapPath(interpolateGreatCircle(35,179,30,-179,100));
 assert.equal(pts.length,101);
 assert.ok(Math.abs(pts.at(-1)[1]-pts[0][1])<4,'short path must not wrap across the whole map');
 for(let i=1;i<pts.length;i++)assert.ok(Math.abs(pts[i][1]-pts[i-1][1])<5);
 assert.equal(wrapLongitude(pts.at(-1)[1]),-179);
});
test('longitude inputs normalize to canonical range',()=>{
 for(const lon of [-900,-540,-181,-180,-179,0,179,180,181,540,900]){
  const wrapped=wrapLongitude(lon);assert.ok(wrapped>=-180 && wrapped<180);
 }
});
test('map UI has selectable basemap and bundled vector geographic shapes',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const geo=JSON.parse(readFileSync(new URL('../assets/world-lowres.geojson',import.meta.url),'utf8'));
 assert.match(html,/id="mapBasemap"/);
 assert.match(html,/value="vector"/);
 assert.ok(geo.geometries.length>150);
 assert.equal(geo.type,'GeometryCollection');
 assert.ok(!html.includes('@tailwindcss/browser'),'CDN preflight should not rewrite Leaflet tile styles');
});

test('Leaflet stylesheet uses the published verified integrity hash',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/sha256-p4NxAoJBhIIN\+hmNHrzRCf9tD\/miZyoHS5obTRR9BMY=/);
 assert.doesNotMatch(html,/sha256-p4NxAoJBhIIN\+hmNHrzx8aAztA1\/0slsYp4B58z7D3E=/);
});
test('offline map embeds real geography and never requires a runtime fetch',()=>{
 const source=readFileSync(new URL('../js/vector-map.js',import.meta.url),'utf8');
 const data=readFileSync(new URL('../js/world-data.js',import.meta.url),'utf8');
 assert.match(source,/import\s*\{WORLD_GEOMETRIES\}/);
 assert.match(source,/canvas\.addEventListener\('pointerup'/);
 assert.match(source,/canvas\.addEventListener\('wheel'/);
 assert.doesNotMatch(source,/fetch\(/);
 assert.ok(data.length>100_000);
});
test('map selection is shared with the offline controller through host state',()=>{
 const source=readFileSync(new URL('../js/map-controller.js',import.meta.url),'utf8');
 assert.match(source,/host\.dataset\.target=chosen/);
 const map=readFileSync(new URL('../js/vector-map.js',import.meta.url),'utf8');
 assert.match(map,/host\.dataset\.target\|\|'rx'/);
});
