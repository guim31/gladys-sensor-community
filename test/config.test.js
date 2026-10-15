import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_SENSORS,
  apiPeriodMs,
  normalizeConfig,
  parseLocalAddress,
  parseSensorIds,
} from '../src/config.js';

test('the defaults read nothing, every 5 minutes, in French', () => {
  const config = normalizeConfig();
  assert.deepEqual(config.sensorIds, []);
  assert.equal(config.localUrl, '');
  assert.equal(config.refreshMinutes, 5);
  assert.equal(config.language, 'fr');
  assert.equal(DEFAULT_CONFIG.language, 'fr');
});

test('sensor ids: commas, spaces, semicolons and a "#" in front are accepted', () => {
  assert.deepEqual(parseSensorIds(' 12345, #67890;12345  007 '), {
    valid: ['12345', '67890', '7'],
    invalid: [],
  });
  assert.deepEqual(parseSensorIds('12345, abc, 0, -4, 1.5'), {
    valid: ['12345'],
    invalid: ['abc', '0', '-4', '1.5'],
  });
  assert.deepEqual(parseSensorIds(''), { valid: [], invalid: [] });
});

test(`at most ${MAX_SENSORS} sensors are read, the others are reported`, () => {
  const ids = Array.from({ length: MAX_SENSORS + 2 }, (_, index) => String(1000 + index));
  const config = normalizeConfig({ sensor_ids: ids.join(',') });
  assert.equal(config.sensorIds.length, MAX_SENSORS);
  assert.deepEqual(config.droppedSensorIds, ids.slice(MAX_SENSORS));
});

test('the box address: a bare IP, a host, or a URL copied from the browser', () => {
  assert.equal(parseLocalAddress('192.0.2.20'), 'http://192.0.2.20');
  assert.equal(parseLocalAddress(' 192.0.2.20:8080/ '), 'http://192.0.2.20:8080');
  assert.equal(parseLocalAddress('http://192.0.2.20/data.json'), 'http://192.0.2.20');
  assert.equal(parseLocalAddress('https://airrohr.example/values'), 'https://airrohr.example');
  assert.equal(parseLocalAddress('airrohr-1234567'), 'http://airrohr-1234567');
  assert.equal(parseLocalAddress(''), '');
  assert.equal(parseLocalAddress('ftp://192.0.2.20'), '');
  assert.equal(parseLocalAddress('http://[bad'), '');
});

test('credentials typed in the box address are dropped', () => {
  assert.equal(parseLocalAddress('http://admin:secret@192.0.2.20/'), 'http://192.0.2.20');
});

test('the refresh interval is one of the offered values, never faster than 5 minutes', () => {
  assert.equal(normalizeConfig({ refresh_minutes: '15' }).refreshMinutes, 15);
  assert.equal(normalizeConfig({ refresh_minutes: '1' }).refreshMinutes, 5);
  assert.equal(normalizeConfig({ refresh_minutes: 'often' }).refreshMinutes, 5);
  assert.equal(apiPeriodMs(normalizeConfig({ refresh_minutes: '10' })), 600_000);
});

test('an unknown language falls back to French', () => {
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
