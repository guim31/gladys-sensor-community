// -----------------------------------------------------------------------------
// A simulated network: the public Sensor.Community API and an airRohr box,
// answering with the fixtures of test/fixtures. Tests never touch the real
// network.
//
// The API fixtures carry the timestamps of the day they were taken: `fresh()`
// moves them to "now", so the same answer reads as a recent measurement.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');

/** API fixture by name (test/fixtures/api/<name>.json). */
export const apiFixture = (name) => JSON.parse(read(`api/${name}.json`));

/** Local box fixtures. */
export const localData = (name = 'data') => JSON.parse(read(`local/${name}.json`));
export const localMetrics = () => read('local/metrics.txt');

/** The API id of the sensor of a fixture. */
export const sensorIdOf = (name) => String(apiFixture(name)[0].sensor.id);

/** "2026-10-14 08:02:31", the API way of writing a UTC time. */
export function apiTimestamp(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * The entries of a fixture, the newest measured `ageMs` before `now` and the
 * older ones shifted alike.
 */
export function fresh(entries, now, ageMs = 60_000) {
  const times = entries.map((entry) => Date.parse(`${entry.timestamp.replace(' ', 'T')}Z`));
  const newest = Math.max(...times);
  return entries.map((entry, index) => ({
    ...entry,
    timestamp: apiTimestamp(now - ageMs - (newest - times[index])),
  }));
}

/**
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.sensors] API id → entries, or a
 *   function (now) => entries, or an Error to throw, or { status } for an HTTP error
 * @param {unknown} [options.box] the answer of the box filter
 * @param {Record<string, { data?: unknown, metrics?: string | null }>} [options.boxes]
 *   local boxes by base URL ("http://192.0.2.20"); metrics null = 404
 * @param {() => number} [options.now] the clock passed to the sensor functions
 */
export function createNetwork({ sensors = {}, box = [], boxes = {}, now = () => Date.now() } = {}) {
  const calls = [];

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  async function answer(route) {
    const value = typeof route === 'function' ? route(now()) : route;
    if (value instanceof Error) {
      throw value;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && value.status) {
      return json({ error: 'nope' }, value.status);
    }
    return json(value);
  }

  async function fetch(url, options = {}) {
    const href = String(url);
    calls.push({ url: href, headers: options.headers ?? {} });
    const sensor = /^https:\/\/data\.sensor\.community\/airrohr\/v1\/sensor\/(\d+)\/$/.exec(href);
    if (sensor) {
      return answer(sensors[sensor[1]] ?? []);
    }
    if (href.startsWith('https://data.sensor.community/airrohr/v1/filter/box=')) {
      return answer(box);
    }
    for (const [base, local] of Object.entries(boxes)) {
      if (local.down && href.startsWith(`${base}/`)) {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'EHOSTUNREACH' } });
      }
      if (href === `${base}/data.json`) {
        return answer(local.data ?? localData());
      }
      if (href === `${base}/metrics`) {
        if (local.metrics === null) {
          return new Response('Not found', { status: 404 });
        }
        if (local.metrics instanceof Error) {
          throw local.metrics;
        }
        return new Response(local.metrics ?? localMetrics(), { status: 200 });
      }
    }
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  }

  return {
    fetch,
    calls,
    sensors,
    boxes,
    /** Calls to the API for one sensor id. */
    sensorCalls: (id) => calls.filter((call) => call.url.endsWith(`/sensor/${id}/`)).length,
    /** Calls to a local box's data.json. */
    localCalls: (base) => calls.filter((call) => call.url === `${base}/data.json`).length,
  };
}
