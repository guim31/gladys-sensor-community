import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLocal, fetchNodeId } from '../src/local.js';
import { createNetwork, localData } from './helpers/network.js';

const BASE = 'http://192.0.2.20';
const NOW = Date.parse('2026-10-14T08:05:00Z');

test('data.json of a box with an SDS011, a BME280 and a DHT22', async () => {
  const network = createNetwork({ boxes: { [BASE]: {} } });
  const reading = await fetchLocal(BASE, { fetch: network.fetch, now: () => NOW });
  assert.equal(reading.software, 'NRZ-2020-133');
  assert.equal(reading.measuredAt, NOW - 104_000, 'age is in seconds');
  assert.deepEqual(reading.values, {
    sds_pm10: 12.3,
    sds_pm25: 6.7,
    bme280_temperature: 18.9,
    bme280_pressure: 1010.4,
    bme280_humidity: 49,
    dht_temperature: 19.4,
    dht_humidity: 47.1,
  });
  assert.deepEqual(
    reading.features.map((feature) => feature.label),
    ['SDS011', 'SDS011', 'BME280', 'BME280', 'BME280', 'DHT22', 'DHT22'],
  );
});

test('a box that has not measured yet answers without measurement', async () => {
  const network = createNetwork({ boxes: { [BASE]: { data: localData('data-starting') } } });
  const reading = await fetchLocal(BASE, { fetch: network.fetch, now: () => NOW });
  assert.equal(reading.measuredAt, null);
  assert.deepEqual(reading.values, {});
});

test('the chip id comes from /metrics; an old firmware without it gives null', async () => {
  const network = createNetwork({
    boxes: { [BASE]: {}, 'http://192.0.2.21': { metrics: null } },
  });
  assert.equal(await fetchNodeId(BASE, { fetch: network.fetch }), 'esp8266-1234567');
  assert.equal(await fetchNodeId('http://192.0.2.21', { fetch: network.fetch }), null);
});

test('a box that is down, or that is not an airRohr', async () => {
  const network = createNetwork({
    boxes: { [BASE]: { down: true }, 'http://192.0.2.22': { data: { hello: 'world' } } },
  });
  await assert.rejects(
    fetchLocal(BASE, { fetch: network.fetch }),
    /does not answer \(EHOSTUNREACH\)/,
  );
  await assert.rejects(fetchNodeId(BASE, { fetch: network.fetch }), /does not answer/);
  await assert.rejects(
    fetchLocal('http://192.0.2.22', { fetch: network.fetch }),
    /without measurements \(is it an airRohr\?\)/,
  );
});
