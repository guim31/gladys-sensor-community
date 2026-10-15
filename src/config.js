// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. This module provides the
// defaults and normalizes the received object, so the rest of the code never
// deals with `undefined`, strings typed with spaces, or invalid values.
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface, the ones every text carries. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** The refresh intervals offered, in minutes (the public API moves every 5 minutes). */
export const REFRESH_MINUTES = ['5', '10', '15', '30'];

/**
 * At most this many sensors are read from the public API: it is a community
 * service that asks for moderation, and each sensor is one request per cycle.
 */
export const MAX_SENSORS = 20;

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  sensor_ids: '', // API ids of public sensors, e.g. "12345, 67890"
  local_address: '', // address of the user's own airRohr box, e.g. 192.0.2.20
  refresh_minutes: '5', // how often the public API is read
  language: 'fr', // language of the feature names and of the generated texts
};

/**
 * Merge the user config with the defaults and normalize every value.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const ids = parseSensorIds(raw.sensor_ids ?? DEFAULT_CONFIG.sensor_ids);
  const refresh = String(raw.refresh_minutes ?? DEFAULT_CONFIG.refresh_minutes).trim();
  const language = String(raw.language ?? DEFAULT_CONFIG.language).trim();
  return {
    sensorIds: ids.valid.slice(0, MAX_SENSORS),
    invalidSensorIds: ids.invalid,
    droppedSensorIds: ids.valid.slice(MAX_SENSORS),
    localUrl: parseLocalAddress(raw.local_address ?? DEFAULT_CONFIG.local_address),
    refreshMinutes: REFRESH_MINUTES.includes(refresh)
      ? Number(refresh)
      : Number(DEFAULT_CONFIG.refresh_minutes),
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
  };
}

/**
 * Split a typed list of sensor ids. Commas, semicolons and spaces separate the
 * ids; a "#" in front (as the map shows them) is accepted. Duplicates are
 * dropped, the order is kept.
 * @param {unknown} text
 * @returns {{ valid: string[], invalid: string[] }}
 */
export function parseSensorIds(text) {
  const valid = [];
  const invalid = [];
  for (const token of String(text).split(/[\s,;]+/)) {
    const id = token.replace(/^#/, '');
    if (id === '') {
      continue;
    }
    if (/^\d{1,9}$/.test(id) && Number(id) > 0) {
      const normalized = String(Number(id));
      if (!valid.includes(normalized)) {
        valid.push(normalized);
      }
    } else {
      invalid.push(token);
    }
  }
  return { valid, invalid };
}

/**
 * The base URL of the local airRohr box, or '' when none (or an unusable one)
 * is set. Users type a bare IP, a host name, or a full URL copied from the
 * browser (with /data.json or a trailing slash): all lead to the same base.
 * Credentials typed in the URL are dropped: the data endpoints need none, and
 * they must never reach the logs.
 * @param {unknown} text
 * @returns {string}
 */
export function parseLocalAddress(text) {
  let value = String(text).trim();
  if (value === '') {
    return '';
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return '';
  }
  const path = url.pathname.replace(/\/(data\.json|metrics|values)?\/?$/i, '');
  return `${url.protocol}//${url.host}${path}`;
}

/** The refresh period of the public API, in milliseconds. */
export function apiPeriodMs(config) {
  return config.refreshMinutes * 60_000;
}

/**
 * The refresh period of the local box. The box measures every 145 s by
 * default and serves its last measurement: reading it once a minute is enough,
 * and light for its small web server.
 */
export const LOCAL_PERIOD_MS = 60_000;
