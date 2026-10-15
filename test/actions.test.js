// -----------------------------------------------------------------------------
// The buttons of the Configuration screen: the nearby search and the check.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX_URL, createWorld } from './helpers/world.js';
import { apiFixture, sensorIdOf } from './helpers/network.js';
import { MESSAGES, TEXT } from '../src/i18n.js';

const HOUSES = [
  { id: 'h1', name: 'Garage', selector: 'garage', latitude: null, longitude: null },
  { id: 'h2', name: 'Maison', selector: 'maison', latitude: 43.6047, longitude: 1.4442 },
];

test('find_nearby: the sensors around the first located house, nearest first, ids ready to copy', async () => {
  const { gladys, network } = await createWorld({
    houses: HOUSES,
    network: { box: apiFixture('box') },
  });
  const ack = await gladys.fake.action('find_nearby', {});
  assert.equal(ack.success, true, ack.error);
  const { message } = ack.data;
  assert.deepEqual(message.fr.split('\n'), [
    '4 capteur(s) à moins de 2 km de « Maison », du plus proche au plus loin :',
    '#70001 SDS011 · 0,1 km · PM2.5, PM10',
    '#70002 BME280 · 0,1 km · Température, Humidité, Pression',
    '#70004 SPS30 · 0,9 km · PM2.5, PM10, PM1',
    '#70005 DNMS (Laerm) · 0,9 km · Bruit (LAeq)',
    'Copiez les identifiants voulus dans « Identifiants des capteurs » : 70001, 70002, 70004, 70005',
  ]);
  assert.equal(network.calls.length, 1, 'one request to the API');
});

test('find_nearby: a chosen house and radius; an indoor sensor says so', async () => {
  const { gladys } = await createWorld({
    houses: HOUSES,
    network: { box: apiFixture('box') },
    config: { language: 'en' },
  });
  const ack = await gladys.fake.action('find_nearby', { house: 'maison', radius_km: '5' });
  assert.match(ack.data.message.en, /^6 sensor\(s\) within 5 km of "Maison"/);
  assert.match(ack.data.message.en, /#70006 SDS011 · \d\.\d km · indoor · PM2\.5, PM10/);
  assert.match(ack.data.message.de, /^6 Sensor\(en\) im Umkreis von 5 km um „Maison“/);
});

test('find_nearby: no located house, or nothing around', async () => {
  const unlocated = await createWorld({ houses: HOUSES.slice(0, 1) });
  const ack = await unlocated.gladys.fake.action('find_nearby', {});
  assert.equal(ack.success, false);
  assert.equal(ack.error, MESSAGES.thrown(TEXT.noHouse));

  const empty = await createWorld({ houses: HOUSES, network: { box: [] } });
  const none = await empty.gladys.fake.action('find_nearby', { radius_km: '1' });
  assert.match(none.data.message.fr, /^Aucun capteur .* moins de 1 km de « Maison »/);
});

test('check_sensors: each sensor, the box, the ignored ids', async () => {
  const SDS = sensorIdOf('sds011');
  const { gladys } = await createWorld({
    fixtures: ['sds011'],
    config: { sensor_ids: `${SDS}, 70099, abc`, local_address: '192.0.2.20', language: 'en' },
    network: { sensors: { 70099: [] }, boxes: { [BOX_URL]: {} } },
  });
  const ack = await gladys.fake.action('check_sensors', {});
  assert.deepEqual(ack.data.message.en.split('\n'), [
    `#${SDS} SDS011: 1 min ago`,
    '#70099: no data in the last 5 minutes (offline, or a wrong id)',
    'airRohr box esp8266-1234567 (NRZ-2020-133): SDS011, BME280, DHT22',
    'Ignored, not a sensor id: abc.',
  ]);
});

test('check_sensors: errors are reported, nothing configured is said', async () => {
  const { gladys } = await createWorld({
    config: { local_address: '192.0.2.20' },
    network: { boxes: { [BOX_URL]: { down: true } } },
  });
  const ack = await gladys.fake.action('check_sensors', {});
  assert.match(ack.data.message.fr, /^Boîtier airRohr : the box does not answer \(EHOSTUNREACH\)$/);
  const empty = await createWorld();
  assert.deepEqual(
    (await empty.gladys.fake.action('check_sensors', {})).data.message,
    TEXT.nothingConfigured,
  );
});
