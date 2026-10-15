// -----------------------------------------------------------------------------
// The "Air quality" widget: every content fits the core's vocabulary and
// budget (validateWidgetContent), and every tile is bound to a feature the
// device really has.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { BOX_URL, createAll, createWorld } from './helpers/world.js';
import { sensorIdOf } from './helpers/network.js';
import { levelColor } from '../src/widgets.js';
import { TEXT } from '../src/i18n.js';

const SDS = sensorIdOf('sds011');
const BAD = sensorIdOf('sds011-polluted');
const BME = sensorIdOf('bme280');
const LANGS = ['en', 'fr', 'de', 'es'];

async function world() {
  const w = await createWorld({
    fixtures: ['sds011', 'sds011-polluted', 'bme280'],
    config: { sensor_ids: `${SDS},${BAD},${BME}`, local_address: '192.0.2.20' },
    network: { boxes: { [BOX_URL]: {} } },
  });
  await createAll(w);
  return w;
}

async function content(w, settings, language) {
  const ack = await w.gladys.fake.widgetGet('air_quality', { settings, language });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

/** Every device_feature of a content exists on a discovered device. */
function assertBound(w, widgetContent) {
  const known = new Set(
    w.gladys.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
  );
  for (const component of widgetContent.components) {
    if (component.device_feature) {
      assert.ok(known.has(component.device_feature), `unknown feature ${component.device_feature}`);
    }
  }
}

test('one sensor: live tiles, the level colored by its band, the measurement age', async () => {
  const w = await world();
  const sensor = w.gladys.externalIds('sensor', SDS).device;
  for (const language of LANGS) {
    const c = await content(w, { sensor }, language);
    assert.deepEqual(validateWidgetContent(c), [], language);
    assertBound(w, c);
  }
  const c = await content(w, { sensor }, 'fr');
  assert.deepEqual(
    c.components.filter((x) => x.type === 'value').map((x) => x.device_feature.split(':').pop()),
    ['pm25', 'pm10'],
  );
  const status = c.components.find((x) => x.type === 'status');
  assert.deepEqual(status.items[0], {
    label: "Qualité de l'air",
    value: 'Moyen',
    color: WIDGET_COLORS.SUCCESS,
  });
  assert.equal(status.items[1].value, 'il y a 1 min');
});

test('the local box: its first sensor of each measure', async () => {
  const w = await world();
  const sensor = w.gladys.externalIds('airrohr', 'esp8266-1234567').device;
  const c = await content(w, { sensor }, 'en');
  assert.deepEqual(validateWidgetContent(c), []);
  assertBound(w, c);
  assert.deepEqual(
    c.components.filter((x) => x.type === 'value').map((x) => x.device_feature.split(':').pop()),
    ['sds_pm25', 'sds_pm10', 'bme280_temperature', 'bme280_humidity'],
  );
});

test('no sensor chosen: one row per sensor measuring particles, colored', async () => {
  const w = await world();
  for (const language of LANGS) {
    assert.deepEqual(validateWidgetContent(await content(w, {}, language)), [], language);
  }
  const c = await content(w, {}, 'en');
  const status = c.components.find((x) => x.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.value, item.color]),
    [
      ['Fair', WIDGET_COLORS.SUCCESS],
      ['Very poor', WIDGET_COLORS.DANGER],
      ['Fair', WIDGET_COLORS.SUCCESS],
    ],
    'the BME280 (no particles) is left out',
  );
});

test('a stale sensor shows how old its measurement is, never a level', async () => {
  const w = await world();
  w.network.sensors[SDS] = [];
  w.advance(2 * 60 * 60_000);
  await w.app.poller.cycle();
  const sensor = w.gladys.externalIds('sensor', SDS).device;
  const c = await content(w, { sensor }, 'en');
  assert.deepEqual(validateWidgetContent(c), []);
  const status = c.components.find((x) => x.type === 'status');
  assert.deepEqual(status.items, [
    { label: 'Air quality', value: 'Stale (2 h)', color: WIDGET_COLORS.NEUTRAL, icon: 'clock' },
  ]);
});

test('empty states: no sensor added, a sensor no longer configured', async () => {
  const w = await createWorld({ fixtures: ['sds011'], config: { sensor_ids: SDS } });
  const none = await content(w, {}, 'de');
  assert.deepEqual(validateWidgetContent(none), []);
  assert.equal(none.components[0].text, TEXT.noSensor.de);
  const gone = await content(w, { sensor: w.gladys.externalIds('sensor', '999').device }, 'es');
  assert.equal(gone.components[0].text, TEXT.unknownSensor.es);
});

test('level colors: good and fair green, moderate orange, worse red', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(levelColor), [
    'success',
    'success',
    'warning',
    'danger',
    'danger',
    'danger',
  ]);
});
