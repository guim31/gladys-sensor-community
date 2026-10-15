// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a simulated network, a store
// in memory, a clock, and the integration wired on top (registerHandlers).
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import { apiFixture, createNetwork, fresh, sensorIdOf } from './network.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

/** The test clock starts here (the day the fixtures were taken). */
export const START = Date.parse('2026-10-14T08:05:00Z');

/** Base URL of the simulated airRohr box. */
export const BOX_URL = 'http://192.0.2.20';

/**
 * Public sensors answering fresh fixtures, by API id.
 * @param {string[]} names fixture names
 */
export function freshSensors(names) {
  return Object.fromEntries(
    names.map((name) => [sensorIdOf(name), (now) => fresh(apiFixture(name), now)]),
  );
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {string[]} [options.fixtures] API fixtures served fresh (their ids are not configured by default)
 * @param {object} [options.network] createNetwork options, merged over the fixtures
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.houses] houses of Gladys
 * @param {object} [options.store] persistence (MemoryStore by default)
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] run the polling timer, on Date.now
 */
export async function createWorld({
  config = {},
  fixtures = [],
  network: networkOptions = {},
  devices = [],
  houses = [],
  store = new MemoryStore(),
  connect = true,
  timers = false,
} = {}) {
  // With the timers on, the clock is Date.now (to be mocked by the test).
  const clock = { now: START };
  const now = timers ? () => Date.now() : () => clock.now;
  const network = createNetwork({
    ...networkOptions,
    sensors: { ...freshSensors(fixtures), ...networkOptions.sensors },
    now,
  });
  const gladys = createFakeGladys({ config, devices, houses });
  const app = registerHandlers(gladys, { store, fetch: network.fetch, timers, now });
  if (connect) {
    await gladys.connect();
  }
  return {
    gladys,
    app,
    network,
    store,
    clock,
    hub: app.hub,
    /** Move the clock forward. */
    advance(ms) {
      clock.now += ms;
    },
  };
}

/** Add every discovered device to Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.gladys.fake.discoveredDevices) {
    await world.gladys.fake.deviceCreated(device);
  }
}

/** The discovered device of a public sensor. */
export function discovered(world, sensorId) {
  const id = world.gladys.externalIds('sensor', sensorId).device;
  return world.gladys.fake.discoveredDevices.find((device) => device.external_id === id);
}
