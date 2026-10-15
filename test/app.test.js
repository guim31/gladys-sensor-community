// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a simulated
// Sensor.Community API and airRohr box: discovery, states, freshness,
// persistence, configuration changes and the status of the Configuration
// screen.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX_URL, createAll, createWorld, discovered } from './helpers/world.js';
import { apiFixture, fresh, localData, sensorIdOf } from './helpers/network.js';
import { MemoryStore } from '../src/store.js';
import { STALE_MINUTES } from '../src/hub.js';
import { TEXT } from '../src/i18n.js';

const SDS = sensorIdOf('sds011');
const BME = sensorIdOf('bme280');
const feature = (gladys, kind, id, key) => gladys.externalIds(kind, id).feature(key);
const featureKeys = (device) => device.features.map((f) => f.external_id.split(':').pop());

test('without configuration: nothing is read, the status says what to enter', async () => {
  const { gladys, network } = await createWorld();
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(network.calls.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: TEXT.notConfigured });
});

test('discovery: one device per sensor, with the measures its first reading showed', async () => {
  const world = await createWorld({
    fixtures: ['sds011', 'bme280'],
    config: { sensor_ids: `${SDS}, ${BME}` },
  });
  const { gladys } = world;
  const sds = discovered(world, SDS);
  assert.equal(sds.name, `Sensor.Community #${SDS} (SDS011)`);
  assert.deepEqual(featureKeys(sds), ['pm25', 'pm10', 'aqi', 'age']);
  assert.deepEqual(sds.params, [{ name: 'sensor_id', value: SDS }]);
  const bme = discovered(world, BME);
  assert.deepEqual(featureKeys(bme), [
    'temperature',
    'humidity',
    'pressure',
    'pressure_sealevel',
    'age',
  ]);
  assert.equal(bme.features[0].name, 'Température', 'French by default');
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  // Gladys drops the states of a device it does not know: none is sent.
  assert.equal(gladys.fake.states.length, 0);
});

test('adding a device sends its states at once, and nudges the widget', async () => {
  const world = await createWorld({ fixtures: ['sds011'], config: { sensor_ids: SDS } });
  const { gladys } = world;
  await createAll(world);
  assert.equal(gladys.fake.lastState(feature(gladys, 'sensor', SDS, 'pm25')), 9);
  assert.equal(gladys.fake.lastState(feature(gladys, 'sensor', SDS, 'pm10')), 18);
  assert.equal(gladys.fake.lastState(feature(gladys, 'sensor', SDS, 'aqi')), 2, 'fair');
  assert.equal(gladys.fake.lastState(feature(gladys, 'sensor', SDS, 'age')), 1);
  assert.ok(gladys.fake.widgetRefreshes.includes('air_quality'));
});

test('a sensor gone silent: its old values are not sent again, its age keeps growing', async () => {
  const world = await createWorld({ fixtures: ['sds011'], config: { sensor_ids: SDS } });
  const { gladys, app, network } = world;
  await createAll(world);
  const pm25 = feature(gladys, 'sensor', SDS, 'pm25');
  const age = feature(gladys, 'sensor', SDS, 'age');
  const sent = () => gladys.fake.states.filter((s) => s.device_feature_external_id === pm25).length;
  assert.equal(sent(), 1);

  network.sensors[SDS] = [];
  for (let minutes = 5; minutes <= 30; minutes += 5) {
    world.advance(5 * 60_000);
    await app.poller.cycle();
  }
  assert.equal(gladys.fake.lastState(age), 31);
  assert.equal(sent(), 1, 'never re-sent while silent');
  assert.ok(app.hub.isStale(app.hub.records.get(`api:${SDS}`)));

  // Back: the values go out again.
  network.sensors[SDS] = (now) => fresh(apiFixture('sds011'), now);
  world.advance(5 * 60_000);
  await app.poller.cycle();
  assert.equal(gladys.fake.lastState(age), 1);
  assert.equal(sent(), 2);
});

test(`a measurement older than ${STALE_MINUTES} minutes is stale, even if the API still has it`, async () => {
  const world = await createWorld({
    network: { sensors: { [SDS]: (now) => fresh(apiFixture('sds011'), now, 20 * 60_000) } },
    config: { sensor_ids: SDS },
  });
  await createAll(world);
  const { gladys } = world;
  assert.equal(gladys.fake.lastState(feature(gladys, 'sensor', SDS, 'age')), 20);
  assert.equal(gladys.fake.lastState(feature(gladys, 'sensor', SDS, 'pm25')), undefined);
});

test('a restart knows the devices from /data, even while the API is down', async () => {
  const store = new MemoryStore();
  const first = await createWorld({ store, fixtures: ['sds011'], config: { sensor_ids: SDS } });
  await first.app.stop();
  const expected = first.gladys.fake.discoveredDevices;

  const down = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  const second = await createWorld({
    store,
    devices: expected,
    config: { sensor_ids: SDS },
    network: { sensors: { [SDS]: down } },
  });
  assert.deepEqual(second.gladys.fake.discoveredDevices, expected);
  assert.deepEqual(second.gladys.fake.connectionStatus, {
    connected: false,
    message: TEXT.apiUnreachable,
  });
});

test('the API comes back: the status turns green again', async () => {
  const world = await createWorld({
    config: { sensor_ids: SDS },
    network: { sensors: { [SDS]: { status: 503 } } },
  });
  const { gladys, app, network } = world;
  assert.equal(gladys.fake.connectionStatus.connected, false);
  network.sensors[SDS] = (now) => fresh(apiFixture('sds011'), now);
  world.advance(5 * 60_000);
  await app.poller.cycle();
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('a new measure adds a feature, never removes nor renames the others', async () => {
  const world = await createWorld({
    config: { sensor_ids: SDS },
    network: {
      sensors: {
        [SDS]: (now) =>
          fresh(apiFixture('sds011'), now).map((entry) => ({
            ...entry,
            sensordatavalues: entry.sensordatavalues.filter((v) => v.value_type === 'P1'),
          })),
      },
    },
  });
  const { gladys, app, network } = world;
  const before = discovered(world, SDS);
  assert.deepEqual(featureKeys(before), ['pm10', 'aqi', 'age']);
  await createAll(world);
  network.sensors[SDS] = (now) => fresh(apiFixture('sds011'), now);
  world.advance(5 * 60_000);
  await app.poller.cycle();
  const after = discovered(world, SDS);
  assert.deepEqual(featureKeys(after), ['pm25', 'pm10', 'aqi', 'age']);
  for (const known of before.features) {
    assert.ok(
      after.features.some((f) => f.external_id === known.external_id && f.name === known.name),
    );
  }
  // A sensor that stops sending a measure keeps the feature.
  network.sensors[SDS] = (now) =>
    fresh(apiFixture('sds011'), now).map((entry) => ({
      ...entry,
      sensordatavalues: entry.sensordatavalues.filter((v) => v.value_type === 'P2'),
    }));
  world.advance(5 * 60_000);
  await app.poller.cycle();
  assert.deepEqual(featureKeys(discovered(world, SDS)), ['pm25', 'pm10', 'aqi', 'age']);
  assert.equal(gladys.fake.discoveredDevices.length, 1);
});

test('a sensor removed from the configuration leaves the Discovery list and /data', async () => {
  const store = new MemoryStore();
  const world = await createWorld({
    store,
    fixtures: ['sds011', 'bme280'],
    config: { sensor_ids: `${SDS},${BME}` },
  });
  await world.gladys.fake.configUpdated({ sensor_ids: BME });
  assert.deepEqual(
    world.gladys.fake.discoveredDevices.map((d) => d.name),
    [`Sensor.Community #${BME} (BME280)`],
  );
  await world.app.stop();
  assert.deepEqual(
    store.data.records.map((record) => record.id),
    [BME],
  );
});

test('the local box: one device named after its chip id, every sensor of the box', async () => {
  const world = await createWorld({
    config: { local_address: '192.0.2.20' },
    network: { boxes: { [BOX_URL]: {} } },
  });
  const { gladys } = world;
  const [box] = gladys.fake.discoveredDevices;
  assert.equal(box.name, 'airRohr esp8266-1234567');
  assert.equal(box.external_id, gladys.externalIds('airrohr', 'esp8266-1234567').device);
  assert.deepEqual(featureKeys(box), [
    'sds_pm25',
    'sds_pm10',
    'bme280_temperature',
    'dht_temperature',
    'bme280_humidity',
    'dht_humidity',
    'bme280_pressure',
    'aqi',
    'age',
  ]);
  assert.deepEqual(
    box.features.slice(2, 4).map((f) => f.name),
    ['Température (BME280)', 'Température (DHT22)'],
  );
  await createAll(world);
  assert.equal(
    gladys.fake.lastState(feature(gladys, 'airrohr', 'esp8266-1234567', 'sds_pm25')),
    6.7,
  );
  assert.equal(gladys.fake.lastState(feature(gladys, 'airrohr', 'esp8266-1234567', 'age')), 1);
});

test('a box without /metrics (old firmware) is named after its address', async () => {
  const world = await createWorld({
    config: { local_address: '192.0.2.20' },
    network: { boxes: { [BOX_URL]: { metrics: null } } },
  });
  const [box] = world.gladys.fake.discoveredDevices;
  assert.equal(box.external_id, world.gladys.externalIds('airrohr', 'host-192-0-2-20').device);
});

test('the box alone, unreachable: the status says so; with public sensors, they keep it green', async () => {
  const alone = await createWorld({
    config: { local_address: '192.0.2.20' },
    network: { boxes: { [BOX_URL]: { down: true } } },
  });
  assert.deepEqual(alone.gladys.fake.connectionStatus, {
    connected: false,
    message: TEXT.localUnreachable,
  });
  const mixed = await createWorld({
    fixtures: ['sds011'],
    config: { sensor_ids: SDS, local_address: '192.0.2.20' },
    network: { boxes: { [BOX_URL]: { down: true } } },
  });
  assert.deepEqual(mixed.gladys.fake.connectionStatus, { connected: true });
});

test('a box that has not measured yet: no device until it tells what it measures', async () => {
  const world = await createWorld({
    config: { local_address: '192.0.2.20' },
    network: { boxes: { [BOX_URL]: { data: localData('data-starting') } } },
  });
  assert.deepEqual(world.gladys.fake.discoveredDevices, []);
  world.network.boxes[BOX_URL].data = localData();
  world.advance(60_000);
  await world.app.poller.cycle();
  assert.equal(world.gladys.fake.discoveredDevices.length, 1);
});

test('a scan reads the sensors never read before', async () => {
  const world = await createWorld({
    config: { sensor_ids: SDS },
    network: { sensors: { [SDS]: [] } },
  });
  assert.deepEqual(world.gladys.fake.discoveredDevices, [], 'nothing known yet');
  world.network.sensors[SDS] = (now) => fresh(apiFixture('sds011'), now);
  await world.gladys.fake.scanRequest();
  assert.equal(world.gladys.fake.discoveredDevices.length, 1);
});

test('only the sensors added to Gladys are read on the timer (and the unknown ones)', async () => {
  const world = await createWorld({
    fixtures: ['sds011', 'bme280'],
    config: { sensor_ids: `${SDS},${BME}` },
  });
  await world.gladys.fake.deviceCreated(discovered(world, SDS));
  const before = world.network.sensorCalls(BME);
  world.advance(5 * 60_000);
  await world.app.poller.cycle();
  assert.equal(
    world.network.sensorCalls(SDS),
    2,
    'at start (the creation follows), then the timer',
  );
  assert.equal(world.network.sensorCalls(BME), before, 'not added: not read');
});
