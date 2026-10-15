// -----------------------------------------------------------------------------
// Quiet logs: a normal cycle writes nothing at the info level, a failure that
// lasts writes one line when it starts and one when it ends, and no secret of
// the configuration ever reaches the logs, whatever the level.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX_URL, createAll, createWorld } from './helpers/world.js';
import { apiFixture, fresh, sensorIdOf } from './helpers/network.js';

const SDS = sensorIdOf('sds011');

/** Capture the log lines (the SDK logger writes through console) at a level. */
function capture(t, level) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  for (const stream of ['log', 'error']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  return lines;
}

test('a normal cycle writes nothing at the info level', async (t) => {
  const lines = capture(t, 'info');
  const w = await createWorld({
    fixtures: ['sds011'],
    config: { sensor_ids: SDS, local_address: '192.0.2.20' },
    network: { boxes: { [BOX_URL]: {} } },
  });
  await createAll(w);
  // Start-up says what it reads and what it found: lifecycle.
  assert.ok(lines.some((line) => line.includes('[INFO]') && line.includes(`Sensor #${SDS} found`)));
  const before = lines.length;
  for (let i = 0; i < 12; i += 1) {
    w.advance(5 * 60_000);
    await w.app.poller.cycle();
    await w.gladys.fake.widgetGet('air_quality', { language: 'fr' });
    await w.gladys.fake.poll(w.gladys.fake.discoveredDevices[0]);
  }
  assert.deepEqual(lines.slice(before), []);
});

test('a lasting failure: one line when it starts, one when it ends', async (t) => {
  const lines = capture(t, 'info');
  const w = await createWorld({ fixtures: ['sds011'], config: { sensor_ids: SDS } });
  await createAll(w);
  const before = lines.length;
  w.network.sensors[SDS] = { status: 503 };
  for (let i = 0; i < 6; i += 1) {
    w.advance(5 * 60_000);
    await w.app.poller.cycle();
  }
  w.network.sensors[SDS] = (now) => fresh(apiFixture('sds011'), now);
  w.advance(5 * 60_000);
  await w.app.poller.cycle();
  const logged = lines.slice(before);
  assert.equal(logged.filter((line) => line.includes('HTTP 503')).length, 1, logged.join('\n'));
  assert.equal(logged.filter((line) => line.includes('API answers again')).length, 1);
});

test('a sensor gone silent: said once when it becomes stale, once when it is back', async (t) => {
  const lines = capture(t, 'info');
  const w = await createWorld({ fixtures: ['sds011'], config: { sensor_ids: SDS } });
  await createAll(w);
  const before = lines.length;
  w.network.sensors[SDS] = [];
  for (let i = 0; i < 12; i += 1) {
    w.advance(5 * 60_000);
    await w.app.poller.cycle();
  }
  w.network.sensors[SDS] = (now) => fresh(apiFixture('sds011'), now);
  w.advance(5 * 60_000);
  await w.app.poller.cycle();
  const logged = lines.slice(before);
  assert.equal(logged.length, 2, logged.join('\n'));
  assert.match(logged[0], /\[WARN\].*#70001 \(SDS011\): no measurement for 16 min/);
  assert.match(logged[1], /\[INFO\].*#70001 \(SDS011\): measurements again/);
});

test('the credentials typed in the box address never reach the logs, even in debug', async (t) => {
  const lines = capture(t, 'debug');
  const w = await createWorld({
    config: { local_address: 'http://admin:hunter2@192.0.2.20/' },
    network: { boxes: { [BOX_URL]: { down: true } } },
  });
  await w.gladys.fake.action('check_sensors', {});
  await w.gladys.fake.configUpdated({ local_address: 'http://admin:hunter2@192.0.2.20/' });
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.ok(!line.includes('hunter2'), line);
    assert.ok(!line.includes('admin:'), line);
  }
});
