#!/usr/bin/env node
'use strict';
// Run: node tools/test-globe-math.cjs
// References are fixed official NOAA calculator output and published USNO
// phase instants. Production functions are never used to build these fixtures.
const assert = require('node:assert/strict');
const math = require('../js/globe-math.js');
const solarReference = require('./fixtures/globe/noaa-solar-reference.json');
const phaseReference = require('./fixtures/globe/usno-moon-reference.json');
const moonReference = require('./fixtures/globe/astronomy-moon-reference.json');
const DAY = 86400000;
let maxSolarSeconds = 0;
let maxPhaseMinutes = 0;
let maxMoonDegrees = 0;
let maxIllumination = 0;
function close(actual, expected, tolerance, message) {
  assert(Number.isFinite(actual), message + ': non-finite output');
  assert(Math.abs(actual - expected) <= tolerance, message + ': ' + actual + ' versus ' + expected);
}
function length(vector) { return Math.hypot(vector.x, vector.y, vector.z); }
for (const ref of solarReference.cases) {
  const label = ref.city + ' ' + ref.date;
  const instant = new Date(ref.positionInstant);
  const sun = math.solar(instant);
  close(sun.declination, ref.solarDeclinationDegrees, 1e-8, label + ' declination');
  close(sun.equationOfTime, ref.equationOfTimeMinutes, 1e-8, label + ' equation of time');
  close(math.solarElevation(instant, ref.latitude, ref.longitude), ref.geometricElevationDegrees, 1e-8, label + ' geometric elevation');
  close(length(sun.vector), 1, 1e-12, label + ' Sun vector');
  close(math.solarElevation(instant, sun.declination, sun.longitude), 90, 1e-5, label + ' subsolar point');
  // Select the stated local solar date even at east longitudes, where UTC
  // noon falls on the following local solar date.
  const localNoon = new Date(Date.parse(ref.date + 'T12:00:00Z') - ref.longitude * 240000);
  const result = math.daylight(localNoon, ref.latitude, ref.longitude);
  assert.equal(result.polar, ref.polarState, label + ' polar state');
  for (const event of ['sunrise', 'sunset']) {
    if (ref[event] === null) assert.equal(result[event], null, label + ' ' + event);
    else {
      assert(result[event] instanceof Date, label + ' ' + event + ' returns Date');
      const error = Math.abs(result[event].getTime() - Date.parse(ref[event].utc)) / 1000;
      assert(error <= 60, label + ' ' + event + ' exceeds one minute against NOAA: ' + error);
      maxSolarSeconds = Math.max(maxSolarSeconds, error);
      close(math.solarElevation(result[event], ref.latitude, ref.longitude), -0.833, 1e-5, label + ' ' + event + ' horizon');
    }
  }
  close(result.hours, ref.daylightMinutes / 60, 2 / 60, label + ' daylight duration');
}
// All new and full moons published by USNO in 2026. Solve circular ecliptic
// elongation around the independent known instant; no phase dates are hardcoded
// into the production algorithm.
for (const ref of phaseReference.cases) {
  const expected = Date.parse(ref.utc);
  const target = ref.phase === 'New Moon' ? 0 : 180;
  let lo = expected - DAY;
  let hi = expected + DAY;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const difference = ((math.moon(mid).phase - target + 540) % 360) - 180;
    if (difference < 0) lo = mid;
    else hi = mid;
  }
  const errorMinutes = Math.abs((lo + hi) / 2 - expected) / 60000;
  assert(errorMinutes <= phaseReference.toleranceHours * 60, ref.utc + ' phase exceeds USNO tolerance');
  maxPhaseMinutes = Math.max(maxPhaseMinutes, errorMinutes);
}
for (const ref of moonReference.cases) {
  const moon = math.moon(new Date(ref.utc));
  close(length(moon.vector), 1, 1e-12, ref.utc + ' Moon vector');
  const dot = moon.vector.x * ref.vector.x + moon.vector.y * ref.vector.y + moon.vector.z * ref.vector.z;
  const errorDegrees = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
  assert(errorDegrees < 0.15, ref.utc + ' Moon position exceeds 0.15 degree');
  close(moon.illumination, ref.illumination, 0.002, ref.utc + ' Moon illumination');
  close(moon.distance, ref.distanceEarthRadii, 0.25, ref.utc + ' Moon distance');
  assert(moon.phase >= 0 && moon.phase < 360, ref.utc + ' circular phase range');
  maxMoonDegrees = Math.max(maxMoonDegrees, errorDegrees);
  maxIllumination = Math.max(maxIllumination, Math.abs(moon.illumination - ref.illumination));
}
// A winter Sun appearance lasts less than four minutes and lies entirely
// between the half-hour grid samples. The extremum search must preserve it.
const briefDay = math.daylight(new Date('2026-12-21T12:00:00Z'), 67.395, 0);
assert.equal(briefDay.polar, null, 'brief polar daylight is not polar night');
assert(briefDay.sunrise && briefDay.sunset, 'brief day has both horizon events');
assert(briefDay.hours > 0 && briefDay.hours < 4 / 60, 'brief day duration');
// A day can end with only one event near the midnight-sun transition.
const transition = math.daylight(new Date('2026-06-21T12:00:00Z'), 65.7294, 0);
assert.equal(transition.polar, null, 'single sunset is not perpetual day');
assert.equal(transition.sunrise, null, 'no invented sunrise on transition day');
assert(transition.sunset && transition.hours < 24 && transition.hours > 23.99, 'partial-day sunset');
for (const longitude of [-179.9, 179.9]) {
  const date = new Date('2026-03-20T00:01:00Z');
  const events = math.daylight(date, 0, longitude);
  assert(events.sunrise < events.sunset, 'date-line events remain chronological');
  assert(events.sunrise >= events.start && events.sunset <= events.end, 'date-line events retain UTC dates');
  assert.equal(Math.floor((events.start.getTime() + longitude * 240000) / DAY), Math.floor((date.getTime() + longitude * 240000) / DAY), 'correct local solar date');
}
// Default obliquity comes from the observation date rather than the fixed
// what-if button. Explicit tilt changes declination coherently.
const june = new Date('2026-06-21T12:00:00Z');
assert.notEqual(math.solar(june).obliquity, 23.44, 'date-specific real obliquity');
close(math.solar(june).obliquity, math.solar(june).realObliquity, 0, 'real tilt default');
close(math.solar(june, 0).declination, 0, 0, 'zero tilt');
assert(math.solar(june, 45).declination > 44, '45 degree tilt seasonal what-if');
assert(math.daylight(june, 60, 0, 45).hours === 24, 'tilt changes daylight');
assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone.length > 0, true, 'viewer IANA timezone exists');
function offset(utc, zone) {
  return new Intl.DateTimeFormat('en', {timeZone: zone, timeZoneName: 'longOffset'}).formatToParts(new Date(utc)).find(part => part.type === 'timeZoneName').value;
}
assert.equal(offset('2026-03-08T06:59:00Z', 'America/New_York'), 'GMT-05:00');
assert.equal(offset('2026-03-08T07:00:00Z', 'America/New_York'), 'GMT-04:00');
assert.equal(offset('2026-11-01T05:59:00Z', 'America/New_York'), 'GMT-04:00');
assert.equal(offset('2026-11-01T06:00:00Z', 'America/New_York'), 'GMT-05:00');
assert.equal(offset('2026-10-03T15:59:00Z', 'Australia/Sydney'), 'GMT+10:00');
assert.equal(offset('2026-10-03T16:00:00Z', 'Australia/Sydney'), 'GMT+11:00');
assert.equal(offset('2026-06-21T12:00:00Z', 'Asia/Kathmandu'), 'GMT+05:45');
assert.equal(offset('2026-06-21T12:00:00Z', 'America/Phoenix'), 'GMT-07:00');
console.log('Solar: ' + solarReference.cases.length + ' NOAA city/date cases; maximum sunrise/set error ' + maxSolarSeconds.toFixed(3) + ' seconds.');
console.log('Moon phases: ' + phaseReference.cases.length + ' USNO new/full instants; maximum error ' + maxPhaseMinutes.toFixed(2) + ' minutes.');
console.log('Moon position: ' + moonReference.cases.length + ' independent ephemeris samples; maximum angular error ' + maxMoonDegrees.toFixed(4) + ' degree, illumination fraction error ' + maxIllumination.toFixed(6) + '.');
console.log('Polar transitions, date line, physical Sun vectors, hypothetical tilt, real obliquity and Intl DST checks passed.');
