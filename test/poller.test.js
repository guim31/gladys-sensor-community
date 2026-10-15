// -----------------------------------------------------------------------------
// The container's own timer (Gladys#3198): the states refresh without any
// onPoll from the core, at the pace of each source, and the core's onPoll is
// a fallback that never adds a request while the timer runs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX_URL, START, createAll, createWorld, discovered } from './helpers/world.js';
import { apiFixture, sensorIdOf } from './helpers/network.js';
import { STATE_HEARTBEAT_MS } from '../src/hub.js';

const SDS = sensorIdOf('sds011');

/** Let the cycle started by a fired timer run to its end. */
async function settle() {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** A world on mocked timers, every device added. */
async function setup(t, config = { sensor_ids: SDS, local_address: '192.0.2.20' }) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START });
  const world = await createWorld({
    timers: true,
    fixtures: ['sds011'],
    config,
    network: { boxes: { [BOX_URL]: {} } },
  });
  await createAll(world);
  t.after(() => world.app.stop());
  return world;
}

test('the states refresh on the container timer, without any onPoll (Gladys#3198)', async (t) => {
  const { gladys, network } = await setup(t);
  const pm25 = gladys.externalIds('sensor', SDS).feature('pm25');
  assert.equal(network.sensorCalls(SDS), 1);
  assert.equal(network.localCalls(BOX_URL), 1);

  // A new value on the API: read at the next 5-minute mark, not before.
  network.sensors[SDS] = (now) =>
    apiFixture('sds011').map((entry) => ({
      ...entry,
      timestamp: new Date(now - 30_000).toISOString().slice(0, 19).replace('T', ' '),
      sensordatavalues: entry.sensordatavalues.map((v) => ({
        ...v,
        value: v.value_type === 'P2' ? '31.00' : v.value,
      })),
    }));
  for (let minute = 1; minute <= 4; minute += 1) {
    t.mock.timers.tick(60_000);
    await settle();
  }
  assert.equal(network.sensorCalls(SDS), 1, 'the public API is not read before 5 minutes');
  assert.equal(network.localCalls(BOX_URL), 5, 'the box is read every minute');
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(network.sensorCalls(SDS), 2);
  assert.equal(gladys.fake.lastState(pm25), 31, 'published without the core asking');
});

test('the configured pace is followed (every 15 minutes)', async (t) => {
  const { network } = await setup(t, { sensor_ids: SDS, refresh_minutes: '15' });
  for (let minute = 1; minute <= 30; minute += 1) {
    t.mock.timers.tick(60_000);
    await settle();
  }
  assert.equal(network.sensorCalls(SDS), 3, 'at start, then at 15 and 30 minutes');
});

test("the core's onPoll is a fallback: it never reads the API twice in a period", async (t) => {
  const world = await setup(t, { sensor_ids: SDS });
  const { gladys, network, app } = world;
  const device = discovered(world, SDS);

  // The core polls every minute: nothing is read while the timer runs.
  for (let i = 0; i < 4; i += 1) {
    t.mock.timers.tick(55_000);
    assert.deepEqual(await gladys.fake.poll(device), { success: true });
  }
  assert.equal(network.sensorCalls(SDS), 1);

  // The timer stalls: the core takes over, once a period.
  app.poller.stop();
  t.mock.timers.tick(5 * 60_000);
  await gladys.fake.poll(device);
  assert.equal(network.sensorCalls(SDS), 2);
  t.mock.timers.tick(60_000);
  await gladys.fake.poll(device);
  assert.equal(network.sensorCalls(SDS), 2);
});

test('an unchanged value is sent again past the heartbeat, which stays under 12 h', async (t) => {
  assert.ok(STATE_HEARTBEAT_MS <= 12 * 60 * 60 * 1000);
  const { gladys } = await setup(t, { local_address: '192.0.2.20' });
  const pm25 = gladys.externalIds('airrohr', 'esp8266-1234567').feature('sds_pm25');
  const sent = () => gladys.fake.states.filter((s) => s.device_feature_external_id === pm25).length;
  const first = sent();
  // The box serves the same measurement, always 104 s old, read every minute.
  const minutes = async (count) => {
    for (let i = 0; i < count; i += 1) {
      t.mock.timers.tick(60_000);
      await settle();
    }
  };
  await minutes(60);
  assert.equal(sent(), first, 'an unchanged value is not sent every minute');
  await minutes(STATE_HEARTBEAT_MS / 60_000 - 60);
  assert.equal(sent(), first + 1, 'sent again once the heartbeat elapsed');
});
