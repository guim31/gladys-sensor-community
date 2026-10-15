// -----------------------------------------------------------------------------
// Client of the public Sensor.Community data API (no account, no key).
//
//   GET https://data.sensor.community/airrohr/v1/sensor/<api id>/
//       the measurements of ONE sensor over the last 5 minutes ([] when the
//       sensor sent nothing in that window)
//   GET https://data.sensor.community/airrohr/v1/filter/box=<lat1>,<lon1>,<lat2>,<lon2>
//       the same, for every sensor of a rectangle (used by the nearby search)
//
// Terms of use (github.com/opendata-stuttgart/meta/wiki/EN-APIs): send a
// User-Agent that identifies the source of the requests, prefer `box` over
// `area`, and keep the load reasonable: the data moves every 5 minutes, so
// the integration never reads a sensor more often than that.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { apiMeasure, toValue } from './measures.js';

export const API_BASE_URL = 'https://data.sensor.community/airrohr/v1';
const TIMEOUT_MS = 20_000;

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** Identifies the integration to the API operators, as they ask. */
export const USER_AGENT = `gladys-sensor-community/${version} (+https://github.com/guim31/gladys-sensor-community)`;

/** An HTTP error of the API (status kept for the messages). */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * GET a JSON document from the API.
 * @param {string} path e.g. "/sensor/12345/"
 * @param {{ fetch?: typeof fetch }} [deps]
 */
async function getJson(path, { fetch = globalThis.fetch } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timeout' : (err.cause?.code ?? err.message);
    throw new ApiError(`Sensor.Community API unreachable (${reason})`, 0);
  }
  if (!response.ok) {
    throw new ApiError(`Sensor.Community API answered HTTP ${response.status}`, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new ApiError('Sensor.Community API answered something that is not JSON', response.status);
  }
}

/**
 * The timestamps of the API are UTC, written "2021-11-07 11:16:45".
 * @param {unknown} text
 * @returns {number | null} epoch milliseconds
 */
export function parseApiTimestamp(text) {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(String(text ?? ''));
  if (!match) {
    return null;
  }
  const time = Date.parse(`${match[1]}T${match[2]}Z`);
  return Number.isFinite(time) ? time : null;
}

/**
 * Group the raw measurements of an API answer by sensor, newest last.
 * Malformed entries are skipped: one bad line never hides the others.
 * @param {unknown} body
 * @returns {Map<string, Array<object>>} API sensor id → its entries
 */
function groupBySensor(body) {
  const groups = new Map();
  if (!Array.isArray(body)) {
    return groups;
  }
  for (const entry of body) {
    const id = entry?.sensor?.id;
    if (id === undefined || id === null || !Array.isArray(entry.sensordatavalues)) {
      continue;
    }
    const key = String(id);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }
  return groups;
}

/**
 * Turn the entries of one sensor (last 5 minutes) into one reading: each
 * measure is the mean of the window, like the map of Sensor.Community, which
 * smooths the noise of a low-cost dust sensor; the time is the newest one.
 * @param {Array<object>} entries
 * @returns {{ sensorType: string, location: object, measuredAt: number, values: Record<string, number> } | null}
 */
export function readingFromEntries(entries) {
  const sums = {};
  let newest = null;
  for (const entry of entries) {
    const time = parseApiTimestamp(entry.timestamp);
    if (time === null) {
      continue;
    }
    if (!newest || time > newest.time) {
      newest = { time, entry };
    }
    for (const { value_type: valueType, value } of entry.sensordatavalues) {
      const measure = apiMeasure(valueType);
      const number = Number(value);
      if (!measure || value === null || value === '' || !Number.isFinite(number)) {
        continue;
      }
      sums[measure] ??= { total: 0, count: 0 };
      sums[measure].total += number;
      sums[measure].count += 1;
    }
  }
  if (!newest) {
    return null;
  }
  const values = {};
  for (const [measure, { total, count }] of Object.entries(sums)) {
    const value = toValue(measure, total / count);
    if (value !== null) {
      values[measure] = value;
    }
  }
  const { sensor, location = {} } = newest.entry;
  return {
    sensorType: String(sensor?.sensor_type?.name ?? '').trim() || 'unknown',
    location: {
      latitude: toNumber(location.latitude),
      longitude: toNumber(location.longitude),
      indoor: Number(location.indoor) === 1,
      country: typeof location.country === 'string' ? location.country : null,
    },
    measuredAt: newest.time,
    values,
  };
}

function toNumber(value) {
  const number = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(number)
    ? null
    : number;
}

/**
 * The latest reading of one public sensor, or null when it sent nothing in
 * the last 5 minutes (offline, or an id that does not exist: the API answers
 * the same empty list).
 * @param {string} sensorId API id, as the map shows it
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function fetchSensor(sensorId, deps) {
  const body = await getJson(`/sensor/${encodeURIComponent(sensorId)}/`, deps);
  if (!Array.isArray(body)) {
    throw new ApiError('Sensor.Community API answered an unexpected document', 200);
  }
  const entries = groupBySensor(body).get(String(sensorId)) ?? [];
  return entries.length === 0 ? null : readingFromEntries(entries);
}

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance, in kilometres.
 * @param {{ latitude: number, longitude: number }} a
 * @param {{ latitude: number, longitude: number }} b
 */
export function distanceKm(a, b) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The rectangle around a point that contains the circle of `radiusKm`.
 * @returns {string} "lat1,lon1,lat2,lon2" (south-west, then north-east)
 */
export function boxAround({ latitude, longitude }, radiusKm) {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cos = Math.max(Math.cos((latitude * Math.PI) / 180), 0.01);
  const dLon = dLat / cos;
  const fixed = (value) => value.toFixed(4);
  return [
    fixed(latitude - dLat),
    fixed(longitude - dLon),
    fixed(latitude + dLat),
    fixed(longitude + dLon),
  ].join(',');
}

/**
 * The sensors that sent data in the last 5 minutes within `radiusKm` of a
 * point, nearest first.
 * @param {{ latitude: number, longitude: number }} center
 * @param {number} radiusKm
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Promise<Array<{ id: string, distanceKm: number } & ReturnType<typeof readingFromEntries>>>}
 */
export async function fetchNearby(center, radiusKm, deps) {
  const body = await getJson(`/filter/box=${boxAround(center, radiusKm)}`, deps);
  if (!Array.isArray(body)) {
    throw new ApiError('Sensor.Community API answered an unexpected document', 200);
  }
  const found = [];
  for (const [id, entries] of groupBySensor(body)) {
    const reading = readingFromEntries(entries);
    const { latitude, longitude } = reading?.location ?? {};
    if (latitude === null || longitude === null || latitude === undefined) {
      continue;
    }
    const distance = distanceKm(center, { latitude, longitude });
    if (distance <= radiusKm) {
      found.push({ id, distanceKm: distance, ...reading });
    }
  }
  return found.sort((a, b) => a.distanceKm - b.distanceKm || Number(a.id) - Number(b.id));
}
