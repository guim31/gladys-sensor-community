import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  USER_AGENT,
  boxAround,
  distanceKm,
  fetchNearby,
  fetchSensor,
  parseApiTimestamp,
} from '../src/api.js';
import { apiFixture, createNetwork } from './helpers/network.js';

test('the API timestamps are UTC', () => {
  assert.equal(parseApiTimestamp('2021-11-07 11:16:45'), Date.parse('2021-11-07T11:16:45Z'));
  assert.equal(parseApiTimestamp('nope'), null);
  assert.equal(parseApiTimestamp(undefined), null);
});

test('a sensor answer: the mean of the 5-minute window, the newest time (python-luftdaten DHT22)', async () => {
  const network = createNetwork({ sensors: { 70003: apiFixture('dht22') } });
  const reading = await fetchSensor('70003', { fetch: network.fetch });
  assert.equal(reading.sensorType, 'DHT22');
  assert.equal(reading.measuredAt, Date.parse('2021-11-07T11:16:45Z'));
  assert.deepEqual(reading.values, { temperature: 10.5, humidity: 80 });
  assert.deepEqual(reading.location, {
    latitude: 48.792,
    longitude: 9.164,
    indoor: false,
    country: 'DE',
  });
});

test('a dust sensor: P1 is PM10, P2 is PM2.5, averaged over the window', async () => {
  const network = createNetwork({ sensors: { 70001: apiFixture('sds011') } });
  const reading = await fetchSensor('70001', { fetch: network.fetch });
  assert.deepEqual(reading.values, { pm10: 18, pm25: 9 });
});

test('a BME280: pressures in hPa; an SPS30: PM1, without PM4 nor counts', async () => {
  const network = createNetwork({
    sensors: { 70002: apiFixture('bme280'), 70004: apiFixture('sps30') },
  });
  const bme = await fetchSensor('70002', { fetch: network.fetch });
  assert.deepEqual(bme.values, {
    temperature: 14.6,
    pressure: 998.2,
    humidity: 71.3,
    pressure_sealevel: 1015.6,
  });
  const sps = await fetchSensor('70004', { fetch: network.fetch });
  assert.deepEqual(sps.values, { pm1: 3.1, pm25: 4.4, pm10: 5 });
});

test('no measurement in the last 5 minutes (offline, or an unknown id) is null', async () => {
  const network = createNetwork({ sensors: { 70009: [] } });
  assert.equal(await fetchSensor('70009', { fetch: network.fetch }), null);
});

test('every request identifies the integration with a User-Agent, as the API asks', async () => {
  const network = createNetwork({ sensors: { 70001: apiFixture('sds011') } });
  await fetchSensor('70001', { fetch: network.fetch });
  const [call] = network.calls;
  assert.equal(call.url, 'https://data.sensor.community/airrohr/v1/sensor/70001/');
  assert.equal(call.headers['User-Agent'], USER_AGENT);
  assert.match(USER_AGENT, /^gladys-sensor-community\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\//);
});

test('HTTP errors and network errors are ApiErrors with a short reason', async () => {
  const http = createNetwork({ sensors: { 1: { status: 503 } } });
  await assert.rejects(fetchSensor('1', { fetch: http.fetch }), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 503);
    assert.match(err.message, /HTTP 503/);
    return true;
  });
  const down = createNetwork({
    sensors: { 1: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }) },
  });
  await assert.rejects(fetchSensor('1', { fetch: down.fetch }), /unreachable \(ECONNRESET\)/);
  const odd = createNetwork({ sensors: { 1: { not: 'a list' } } });
  await assert.rejects(fetchSensor('1', { fetch: odd.fetch }), /unexpected document/);
});

test('a malformed entry is skipped, the others still count', async () => {
  const entries = apiFixture('sds011');
  entries.push({ sensor: { id: 70001 }, timestamp: 'garbage', sensordatavalues: [] });
  entries.push({ nothing: true });
  const network = createNetwork({ sensors: { 70001: entries } });
  const reading = await fetchSensor('70001', { fetch: network.fetch });
  assert.deepEqual(reading.values, { pm10: 18, pm25: 9 });
});

test('distance and search box', () => {
  const home = { latitude: 43.6047, longitude: 1.4442 };
  assert.ok(Math.abs(distanceKm(home, { latitude: 43.6137, longitude: 1.4442 }) - 1) < 0.01);
  const [lat1, lon1, lat2, lon2] = boxAround(home, 2).split(',').map(Number);
  assert.ok(lat1 < home.latitude && home.latitude < lat2);
  assert.ok(lon1 < home.longitude && home.longitude < lon2);
  // The box holds the circle: its half-width is the radius.
  assert.ok(Math.abs(distanceKm(home, { latitude: lat2, longitude: home.longitude }) - 2) < 0.01);
  assert.ok(Math.abs(distanceKm(home, { latitude: home.latitude, longitude: lon2 }) - 2) < 0.01);
});

test('nearby search: the box filter, then the circle, nearest first', async () => {
  const network = createNetwork({ box: apiFixture('box') });
  const found = await fetchNearby({ latitude: 43.6047, longitude: 1.4442 }, 2, {
    fetch: network.fetch,
  });
  assert.match(network.calls[0].url, /\/filter\/box=43\.58\d*,1\.41\d*,43\.62\d*,1\.46\d*$/);
  assert.deepEqual(
    found.map((sensor) => sensor.id),
    ['70001', '70002', '70004', '70005'],
    '70006 and 70007 lie beyond 2 km',
  );
  assert.ok(
    found.every((sensor, index) => index === 0 || found[index - 1].distanceKm <= sensor.distanceKm),
  );
  const wide = await fetchNearby({ latitude: 43.6047, longitude: 1.4442 }, 5, {
    fetch: network.fetch,
  });
  assert.ok(wide.some((sensor) => sensor.id === '70006' && sensor.location.indoor));
});
