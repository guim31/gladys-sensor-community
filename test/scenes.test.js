// -----------------------------------------------------------------------------
// The scene trigger "Air quality changed" and the scene action "Get the air
// quality".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAll, createWorld } from './helpers/world.js';
import { apiFixture, fresh, sensorIdOf } from './helpers/network.js';
import { AIR_QUALITY_CHANGED } from '../src/hub.js';
import { MESSAGES, TEXT } from '../src/i18n.js';

const SDS = sensorIdOf('sds011');

/** Entries of the SDS011 with the given PM2.5 and PM10. */
const pm = (pm25, pm10) => (now) =>
  fresh(apiFixture('sds011'), now).map((entry) => ({
    ...entry,
    sensordatavalues: [
      { value_type: 'P1', value: String(pm10) },
      { value_type: 'P2', value: String(pm25) },
    ],
  }));

async function world({ language = 'fr' } = {}) {
  const w = await createWorld({
    network: { sensors: { [SDS]: pm(4, 10) } },
    config: { sensor_ids: SDS, language },
  });
  await createAll(w);
  w.read = async (pm25, pm10) => {
    w.network.sensors[SDS] = pm(pm25, pm10);
    w.advance(5 * 60_000);
    await w.app.poller.cycle();
  };
  return w;
}

test('a new level fires the trigger once it held on two readings in a row', async () => {
  const w = await world();
  const events = () => w.gladys.fake.sceneEvents;
  assert.equal(events().length, 0, 'the first reading sets the starting level');

  await w.read(62, 80); // poor, once: maybe a puff of smoke
  assert.equal(events().length, 0);
  await w.read(4, 10); // good again: nothing happened
  await w.read(62, 80);
  assert.equal(events().length, 0);
  await w.read(64, 85); // poor, twice in a row
  assert.equal(events().length, 1);
  const [event] = events();
  assert.equal(event.key, AIR_QUALITY_CHANGED);
  assert.deepEqual(event.data, {
    device: w.gladys.externalIds('sensor', SDS).device,
    sensor_name: `Sensor.Community #${SDS} (SDS011)`,
    level: 'poor',
    level_label: 'Mauvais',
    level_index: 4,
    previous_level: 'good',
    previous_level_index: 1,
    pollutant: 'pm25',
    pm25: 64,
    pm10: 85,
  });
  await w.read(70, 90);
  assert.equal(events().length, 1, 'same level: no new event');
});

test('the trigger data only uses declared keys', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
  );
  const trigger = manifest.scene_triggers.find((t) => t.key === AIR_QUALITY_CHANGED);
  const declared = new Set([...trigger.fields, ...trigger.variables].map((f) => f.key));
  const w = await world();
  await w.read(62, 80);
  await w.read(62, 80);
  const [event] = w.gladys.fake.sceneEvents;
  for (const key of Object.keys(event.data)) {
    assert.ok(declared.has(key), `${key} is not declared`);
  }
  const levels = trigger.fields.find((f) => f.key === 'level').options.map((o) => o.value);
  assert.ok(levels.includes(event.data.level));
});

test('no event for a device the user did not add', async () => {
  const w = await createWorld({
    network: { sensors: { [SDS]: pm(4, 10) } },
    config: { sensor_ids: SDS },
  });
  w.network.sensors[SDS] = pm(62, 80);
  for (let i = 0; i < 2; i += 1) {
    w.advance(5 * 60_000);
    await w.app.poller.refreshNow(w.app.hub.units());
  }
  assert.equal(w.gladys.fake.sceneEvents.length, 0);
});

test('get_air_quality: one sensor, with a sentence ready for a notification', async () => {
  const w = await world({ language: 'en' });
  const ack = await w.gladys.fake.sceneAction('get_air_quality', {
    sensor: w.gladys.externalIds('sensor', SDS).device,
  });
  assert.deepEqual(ack, {
    success: true,
    data: {
      outputs: {
        level: 'good',
        level_index: 1,
        level_label: 'Good',
        pm25: 4,
        pm10: 10,
        age_minutes: 1,
        summary: 'Good · PM2.5 4 µg/m³ · PM10 10 µg/m³ · 1 min ago',
      },
    },
  });
});

test('get_air_quality without a sensor: the worst fresh reading', async () => {
  const BAD = sensorIdOf('sds011-polluted');
  const w = await createWorld({
    fixtures: ['sds011', 'sds011-polluted'],
    config: { sensor_ids: `${SDS},${BAD}`, language: 'fr' },
  });
  await createAll(w);
  const ack = await w.gladys.fake.sceneAction('get_air_quality', {});
  assert.equal(ack.data.outputs.level, 'very_poor');
  assert.equal(
    ack.data.outputs.summary,
    'Très mauvais · PM2.5 118,7 µg/m³ · PM10 182,3 µg/m³ · il y a 1 min',
  );

  // The polluted one goes silent: it no longer counts.
  w.network.sensors[BAD] = [];
  w.advance(20 * 60_000);
  w.network.sensors[SDS] = (now) => fresh(apiFixture('sds011'), now);
  await w.app.poller.cycle();
  const after = await w.gladys.fake.sceneAction('get_air_quality', {});
  assert.equal(after.data.outputs.level, 'fair');
});

test('get_air_quality with no reading fails with a message in every language', async () => {
  const w = await createWorld({ config: { sensor_ids: SDS }, network: { sensors: { [SDS]: [] } } });
  const ack = await w.gladys.fake.sceneAction('get_air_quality', {});
  assert.equal(ack.success, false);
  assert.equal(ack.error, MESSAGES.thrown(TEXT.noReading));
});
