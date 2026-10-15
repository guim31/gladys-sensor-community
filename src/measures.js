// -----------------------------------------------------------------------------
// What a sensor measures, and how to read it.
//
// The public API and the local box name the same measurement differently:
//   - public API (one API id per physical sensor): P1, P2, temperature...
//   - local box  (/data.json, every sensor of the box): SDS_P1, BME280_temperature...
// Both are mapped here to the measures of the integration (pm25, pm10...),
// with the unit conversion Gladys needs (the pressure comes in pascals).
//
// The European Air Quality Index (EAQI) of the European Environment Agency is
// computed here too, from PM2.5 and PM10 (the only pollutants these sensors
// measure).
// -----------------------------------------------------------------------------

/**
 * The measures the integration publishes. `decimals` rounds the published
 * value (sensors give two decimals, more than their accuracy).
 */
export const MEASURES = {
  pm25: { decimals: 1 },
  pm10: { decimals: 1 },
  pm1: { decimals: 1 },
  temperature: { decimals: 1 },
  humidity: { decimals: 1 },
  pressure: { decimals: 1, pascals: true },
  pressure_sealevel: { decimals: 1, pascals: true },
  noise_laeq: { decimals: 0 },
  noise_min: { decimals: 0 },
  noise_max: { decimals: 0 },
  co2: { decimals: 0 },
};

/** Display order of the measures on a device and in the widget. */
export const MEASURE_ORDER = Object.keys(MEASURES);

// Public API value types. P0 is PM1, P1 PM10 and P2 PM2.5 (historical names
// of the first dust sensor). P4 (PM4) and the particle counts (N1...) have no
// Gladys category and are ignored.
const API_VALUE_TYPES = {
  P0: 'pm1',
  P1: 'pm10',
  P2: 'pm25',
  temperature: 'temperature',
  humidity: 'humidity',
  pressure: 'pressure',
  pressure_at_sealevel: 'pressure_sealevel',
  noise_LAeq: 'noise_laeq',
  noise_LA_min: 'noise_min',
  noise_LA_max: 'noise_max',
  co2_ppm: 'co2',
  co2: 'co2',
};

/**
 * The measure of a public API value type, or null when ignored.
 * @param {string} valueType
 */
export function apiMeasure(valueType) {
  return API_VALUE_TYPES[valueType] ?? null;
}

// Local box: "<SENSOR>_<value>" (and the DHT22 without prefix). The family
// names the sensor in the feature name, since a box may carry two sensors of
// the same measure (a BME280 and a DHT22 both give a temperature).
const LOCAL_FAMILIES = {
  SDS: 'SDS011',
  PMS: 'PMS',
  HPM: 'HPM',
  NPM: 'NextPM',
  SPS30: 'SPS30',
  IPS: 'IPS-7100',
  BME280: 'BME280',
  BMP280: 'BMP280',
  BMP: 'BMP180',
  SHT3X: 'SHT3x',
  HTU21D: 'HTU21D',
  DS18B20: 'DS18B20',
  SCD30: 'SCD30',
  DNMS: 'DNMS',
  DHT: 'DHT22',
};

const LOCAL_SUFFIXES = {
  P0: 'pm1',
  P1: 'pm10',
  P2: 'pm25',
  temperature: 'temperature',
  humidity: 'humidity',
  pressure: 'pressure',
  noise_LAeq: 'noise_laeq',
  noise_LA_min: 'noise_min',
  noise_LA_max: 'noise_max',
  co2_ppm: 'co2',
};

/**
 * The measure of a local value type, or null when ignored (Wi-Fi signal,
 * sample counters, GPS, particle counts...).
 * @param {string} valueType e.g. "BME280_temperature", "SDS_P2", "humidity"
 * @returns {{ family: string, label: string, measure: string } | null}
 */
export function localMeasure(valueType) {
  const match = /^([A-Z0-9]+)_(.+)$/.exec(valueType);
  const [prefix, suffix] = match ? [match[1], match[2]] : ['DHT', valueType];
  const measure = LOCAL_SUFFIXES[suffix];
  const label = LOCAL_FAMILIES[prefix];
  if (!measure || !label) {
    return null;
  }
  // The DHT22 has no prefix: only its two value types are taken.
  if (prefix === 'DHT' && !['temperature', 'humidity'].includes(measure)) {
    return null;
  }
  return { family: prefix.toLowerCase(), label, measure };
}

/**
 * Parse a raw value into the number Gladys gets, or null when unusable.
 * Pressures arrive in pascals (some old sensors already send hectopascals).
 * @param {string} measure
 * @param {unknown} raw
 */
export function toValue(measure, raw) {
  const definition = MEASURES[measure];
  if (!definition || raw === null || raw === undefined || raw === '') {
    return null;
  }
  let value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  if (definition.pascals && value > 2000) {
    value /= 100;
  }
  return round(value, definition.decimals);
}

/**
 * @param {number} value
 * @param {number} decimals
 */
export function round(value, decimals) {
  const factor = 10 ** decimals;
  // toPrecision first: a mean like 79.94999999999999 is 79.95, rounded to 80.
  return Math.round(Number(value.toPrecision(12)) * factor) / factor;
}

// --- European Air Quality Index ---------------------------------------------
//
// Bands of the EEA European Air Quality Index, revised in 2024 to follow the
// WHO 2021 guidelines (µg/m³, upper bounds of levels 1 to 5; above the last
// one is level 6). https://airindex.eea.europa.eu
// The EEA computes it on validated hourly and daily means of reference
// stations: on the readings of a low-cost sensor it is an indication.
export const EAQI_BANDS = {
  pm25: [5, 15, 50, 90, 140],
  pm10: [15, 45, 120, 195, 270],
};

/** Level keys, index 0 = level 1. Stable: they are scene filter values. */
export const EAQI_LEVELS = ['good', 'fair', 'moderate', 'poor', 'very_poor', 'extremely_poor'];

/**
 * Level 1 (good) to 6 (extremely poor) of one pollutant.
 * @param {'pm25' | 'pm10'} pollutant
 * @param {number} value µg/m³
 */
export function pollutantLevel(pollutant, value) {
  const bands = EAQI_BANDS[pollutant];
  const index = bands.findIndex((upper) => value <= upper);
  return index === -1 ? bands.length + 1 : index + 1;
}

/**
 * The index of a reading: the worst level of its pollutants, and which one
 * sets it. Null without PM2.5 nor PM10.
 * @param {{ pm25?: number, pm10?: number }} values
 * @returns {{ level: number, key: string, pollutant: 'pm25' | 'pm10' } | null}
 */
export function airQualityIndex(values) {
  let worst = null;
  for (const pollutant of ['pm25', 'pm10']) {
    const value = values[pollutant];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    const level = pollutantLevel(pollutant, value);
    if (!worst || level > worst.level) {
      worst = { level, pollutant };
    }
  }
  return worst ? { ...worst, key: EAQI_LEVELS[worst.level - 1] } : null;
}
