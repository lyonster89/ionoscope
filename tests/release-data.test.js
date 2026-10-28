import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMeasurements} from '../js/source-manager.js';

test('NOAA zone-less timestamps normalize to UTC and monthly records to first of month',()=>{
 assert.equal(parseMeasurements('kp','swpc-kp-1m',[{time_tag:'2026-10-28T16:46:00',kp_index:1}]).timestamp,'2026-10-28T16:46:00Z');
 assert.equal(parseMeasurements('sfi','swpc-f107',[{time_tag:'2026-10-28 12:00:00',flux:100}]).timestamp,'2026-10-28T12:00:00Z');
 assert.equal(parseMeasurements('ssn','swpc-ssn-monthly',[{time_tag:'2026-09',ssn:60.3}]).timestamp,'2026-09-01T00:00:00Z');
});

test('missing and implausible terrain elevations never become zero-height observations',()=>{
 for(const bad of [null,'',false,' ',10000,-1000]) {
  assert.throws(()=>parseMeasurements('terrain','openmeteo-elev',{elevation:[bad,20]}));
  assert.throws(()=>parseMeasurements('terrain','opentopo-elev',{results:[{elevation:bad},{elevation:20}]}));
 }
 assert.deepEqual(parseMeasurements('terrain','openmeteo-elev',{elevation:[0,-100]}).value,[0,-100]);
});
test('empty geocoding coordinates never move a station to zero latitude or longitude',()=>{
 for(const bad of [null,'',' ']) {
  assert.throws(()=>parseMeasurements('geocode','openmeteo-geo',{results:[{latitude:bad,longitude:10}]}));
  assert.throws(()=>parseMeasurements('geocode','nominatim-geo',[{lat:10,lon:bad}]));
 }
 assert.equal(parseMeasurements('geocode','nominatim-geo',[{lat:'0',lon:'0'}]).value.lat,0);
});
