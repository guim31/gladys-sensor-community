// -----------------------------------------------------------------------------
// The Gladys devices: one per public sensor (API id), one for the local box.
//
// External ids (forever, see CLAUDE.md):
//   public sensor : ext:<selector>:sensor:<API id>          features :pm25, :pm10, :temperature...
//   local box     : ext:<selector>:airrohr:<chip id>         features :sds_pm25, :bme280_temperature...
// plus, on both, :aqi (European index, when PM is measured) and :age (minutes
// since the measurement). A public sensor is ONE physical sensor (an airRohr
// box with an SDS011 and a BME280 has two API ids), whereas the local box
// carries every sensor plugged into it: its feature keys name the sensor
// family, since a box may measure the temperature twice (BME280 and DHT22).
//
// The features of a device are the measures it ever sent: they are learnt
// from the data, kept under /data, and never removed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { NAMES } from './i18n.js';
import { MEASURE_ORDER } from './measures.js';

const SENSOR = TYPES.SENSOR;

// The Gladys couple of each measure. Gladys has no PM1 category: PM1 is
// published as a PM2.5 sensor (same unit, same scale), named "PM1". min/max
// are display bounds (Gladys never clamps a state with them).
const FEATURES = {
  pm25: {
    category: CATEGORIES.PM25_SENSOR,
    type: SENSOR.DECIMAL,
    unit: UNITS.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 1000,
  },
  pm10: {
    category: CATEGORIES.PM10_SENSOR,
    type: SENSOR.DECIMAL,
    unit: UNITS.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 1000,
  },
  pm1: {
    category: CATEGORIES.PM25_SENSOR,
    type: SENSOR.DECIMAL,
    unit: UNITS.MICROGRAM_PER_CUBIC_METER,
    min: 0,
    max: 1000,
  },
  temperature: {
    category: CATEGORIES.TEMPERATURE_SENSOR,
    type: SENSOR.DECIMAL,
    unit: UNITS.CELSIUS,
    min: -50,
    max: 80,
  },
  humidity: {
    category: CATEGORIES.HUMIDITY_SENSOR,
    type: SENSOR.DECIMAL,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
  },
  pressure: {
    category: CATEGORIES.PRESSURE_SENSOR,
    type: SENSOR.DECIMAL,
    unit: UNITS.HECTO_PASCAL,
    min: 300,
    max: 1100,
  },
  pressure_sealevel: {
    category: CATEGORIES.PRESSURE_SENSOR,
    type: SENSOR.DECIMAL,
    unit: UNITS.HECTO_PASCAL,
    min: 300,
    max: 1100,
  },
  noise_laeq: {
    category: CATEGORIES.NOISE_SENSOR,
    type: SENSOR.INTEGER,
    unit: UNITS.DECIBEL,
    min: 0,
    max: 150,
  },
  noise_min: {
    category: CATEGORIES.NOISE_SENSOR,
    type: SENSOR.INTEGER,
    unit: UNITS.DECIBEL,
    min: 0,
    max: 150,
  },
  noise_max: {
    category: CATEGORIES.NOISE_SENSOR,
    type: SENSOR.INTEGER,
    unit: UNITS.DECIBEL,
    min: 0,
    max: 150,
  },
  co2: {
    category: CATEGORIES.CO2_SENSOR,
    type: SENSOR.INTEGER,
    unit: UNITS.PPM,
    min: 0,
    max: 10000,
  },
  aqi: {
    category: CATEGORIES.AIRQUALITY_SENSOR,
    type: TYPES.AIRQUALITY_SENSOR.AQI,
    unit: UNITS.AQI,
    min: 1,
    max: 6,
  },
  // A week shown on the scale; an older measurement still gets its real age.
  age: {
    category: CATEGORIES.DURATION,
    type: TYPES.DURATION.INTEGER,
    unit: UNITS.MINUTES,
    min: 0,
    max: 10080,
  },
};

/** Feature key of the European index and of the measurement age. */
export const AQI_KEY = 'aqi';
export const AGE_KEY = 'age';

/** The device type of a record, part of its external id. */
const DEVICE_TYPE = { api: 'sensor', local: 'airrohr' };

/**
 * The external ids of the device of a record.
 * @param {object} gladys
 * @param {{ kind: 'api' | 'local', id: string }} record
 */
export function idsOf(gladys, record) {
  return gladys.externalIds(DEVICE_TYPE[record.kind], record.id);
}

/**
 * The measured features of a record, in display order.
 * @param {{ features: Array<{ key: string, measure: string }> }} record
 */
export function sortedFeatures(record) {
  const rank = (feature) => MEASURE_ORDER.indexOf(feature.measure);
  return [...record.features].sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
}

/**
 * The first feature of a record measuring `measure` (the local box may have
 * two), or undefined.
 */
export function featureOf(record, measure) {
  return sortedFeatures(record).find((feature) => feature.measure === measure);
}

/** True when the record measures particles, so has a European index. */
export function hasAirQuality(record) {
  return record.features.some(
    (feature) => feature.measure === 'pm25' || feature.measure === 'pm10',
  );
}

/**
 * The device name: the brand and the identity, never translated.
 * @param {object} record
 */
export function deviceName(record) {
  if (record.kind === 'local') {
    return `airRohr ${record.id}`;
  }
  return record.sensorType && record.sensorType !== 'unknown'
    ? `Sensor.Community #${record.id} (${record.sensorType})`
    : `Sensor.Community #${record.id}`;
}

function feature(gladys, record, key, measure, name) {
  const ids = idsOf(gladys, record);
  return {
    name,
    external_id: ids.feature(key),
    ...FEATURES[measure],
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/**
 * The discovery payload of one record.
 * @param {object} gladys
 * @param {object} record
 * @param {string} language language of the feature names
 */
export function buildDevice(gladys, record, language) {
  const names = NAMES[language] ?? NAMES.fr;
  const features = sortedFeatures(record).map(({ key, measure, label }) =>
    feature(gladys, record, key, measure, label ? `${names[measure]} (${label})` : names[measure]),
  );
  if (hasAirQuality(record)) {
    features.push(feature(gladys, record, AQI_KEY, 'aqi', names.aqi));
  }
  features.push(feature(gladys, record, AGE_KEY, 'age', names.age));

  const params = [];
  if (record.kind === 'api') {
    params.push({ name: 'sensor_id', value: record.id });
  }
  return {
    name: deviceName(record),
    external_id: idsOf(gladys, record).device,
    model: record.kind === 'api' ? record.sensorType : 'airRohr',
    // The container reads the sensors itself (src/poller.js). These two
    // fields only keep the core's onPoll as a fallback: once a minute, the
    // slowest pace Gladys schedules, skipped while the container's timer runs.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features,
    params,
  };
}
