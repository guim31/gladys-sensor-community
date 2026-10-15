// -----------------------------------------------------------------------------
// Client of the local web server of an airRohr box (the Sensor.Community
// firmware for ESP8266/ESP32), on the user's network. Read only, no
// credentials: these two pages are open even when the box protects its
// configuration pages with a password.
//
//   GET http://<box>/data.json
//     { "software_version": "NRZ-2020-133", "age": "104",
//       "sensordatavalues": [{ "value_type": "SDS_P1", "value": "10.80" }, ...] }
//     the last measurement sent, every sensor of the box, `age` in seconds
//     since that measurement (negative before the first one).
//   GET http://<box>/metrics
//     Prometheus lines carrying `node="esp8266-12345678"`: the chip id, the
//     stable identity of the box (its address may change with DHCP).
// -----------------------------------------------------------------------------

import { localMeasure, toValue } from './measures.js';

const TIMEOUT_MS = 10_000;

/** An error reading the box. */
export class LocalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocalError';
  }
}

async function get(url, { fetch = globalThis.fetch } = {}) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timeout' : (err.cause?.code ?? err.message);
    throw new LocalError(`the box does not answer (${reason})`);
  }
  if (!response.ok) {
    throw new LocalError(`the box answered HTTP ${response.status}`);
  }
  return response;
}

/**
 * The chip id of the box ("esp8266-12345678"), or null when its firmware has
 * no /metrics page (older than 2020).
 * @param {string} baseUrl
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function fetchNodeId(baseUrl, deps) {
  let text;
  try {
    text = await (await get(`${baseUrl}/metrics`, deps)).text();
  } catch (err) {
    if (/HTTP 404/.test(err.message)) {
      return null;
    }
    throw err;
  }
  const match = /node="([A-Za-z0-9_-]{3,40})"/.exec(text);
  return match ? match[1].toLowerCase() : null;
}

/**
 * The last measurement of the box.
 * @param {string} baseUrl
 * @param {{ fetch?: typeof fetch, now?: () => number }} [deps]
 * @returns {Promise<{ software: string | null, measuredAt: number | null,
 *   features: Array<{ key: string, family: string, label: string, measure: string }>,
 *   values: Record<string, number> }>}
 */
export async function fetchLocal(baseUrl, deps = {}) {
  const now = deps.now ?? Date.now;
  const response = await get(`${baseUrl}/data.json`, deps);
  let body;
  try {
    body = await response.json();
  } catch {
    throw new LocalError('the box answered something that is not JSON (is it an airRohr?)');
  }
  if (!body || !Array.isArray(body.sensordatavalues)) {
    throw new LocalError('the box answered without measurements (is it an airRohr?)');
  }
  const features = [];
  const values = {};
  for (const { value_type: valueType, value } of body.sensordatavalues) {
    const found = localMeasure(String(valueType ?? ''));
    if (!found) {
      continue;
    }
    const key = `${found.family}_${found.measure}`;
    const number = toValue(found.measure, value);
    if (number === null || key in values) {
      continue;
    }
    features.push({ key, ...found });
    values[key] = number;
  }
  const age = Number(body.age);
  const measuredAt =
    features.length > 0 && Number.isFinite(age) && age >= 0 ? now() - age * 1000 : null;
  return {
    software: typeof body.software_version === 'string' ? body.software_version : null,
    measuredAt,
    features,
    values,
  };
}
