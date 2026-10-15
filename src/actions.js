// -----------------------------------------------------------------------------
// The buttons of the Configuration screen (manifest `actions`).
//
//   find_nearby   : the sensors that sent data around a house of Gladys (its
//                   location, `location: true` in the manifest), with their
//                   distance, type and measures — to pick the ids to read.
//   check_sensors : what each configured sensor answers right now.
// -----------------------------------------------------------------------------

import { fetchNearby } from './api.js';
import { MESSAGES, TEXT, NAMES } from './i18n.js';
import { MEASURE_ORDER } from './measures.js';

export const ACTION = {
  FIND_NEARBY: 'find_nearby',
  CHECK_SENSORS: 'check_sensors',
};

/** Radii offered by the search (km), and the one used when none is picked. */
export const RADII_KM = ['1', '2', '5', '10'];
const DEFAULT_RADIUS_KM = 2;

/** The search lists this many sensors at most (the message stays readable). */
const MAX_LISTED = 10;

/** Short labels of the measures, for the search result. */
const SHORT = { pm25: 'PM2.5', pm10: 'PM10', pm1: 'PM1', co2: 'CO2' };

/**
 * @param {object} gladys
 * @param {{ house?: string, radius_km?: string }} fields
 * @param {{ language: string }} config
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function findNearby(gladys, fields, config, deps) {
  const houses = (await gladys.getHouses()).filter(
    (house) => typeof house.latitude === 'number' && typeof house.longitude === 'number',
  );
  const house = fields.house
    ? houses.find((candidate) => candidate.selector === fields.house)
    : houses[0];
  if (!house) {
    throw new Error(MESSAGES.thrown(TEXT.noHouse));
  }
  const radiusKm = RADII_KM.includes(String(fields.radius_km))
    ? Number(fields.radius_km)
    : DEFAULT_RADIUS_KM;
  const found = await fetchNearby(house, radiusKm, deps);
  const language = config.language;
  const sensors = found.slice(0, MAX_LISTED).map((sensor) => ({
    id: sensor.id,
    sensorType: sensor.sensorType,
    distanceKm: Math.round(sensor.distanceKm * 10) / 10,
    indoor: sensor.location.indoor,
    measures: MEASURE_ORDER.filter((measure) => measure in sensor.values)
      .filter((measure) => !['noise_min', 'noise_max', 'pressure_sealevel'].includes(measure))
      .map((measure) => SHORT[measure] ?? NAMES[language][measure]),
  }));
  return MESSAGES.nearby({ house: house.name, radiusKm, sensors });
}

/**
 * Read every configured sensor (unless read in the last minute) and report.
 * @param {import('./hub.js').Hub} hub
 * @param {ReturnType<import('./poller.js').createPoller>} poller
 * @param {object} config the normalized config
 */
export async function checkSensors(hub, poller, config) {
  const units = hub.units(config);
  if (units.length === 0) {
    return TEXT.nothingConfigured;
  }
  await poller.refreshNow(units, { maxAgeMs: 60_000 });
  const lines = [];
  for (const unit of units) {
    const record = hub.recordOf(unit, config);
    const result = hub.lastResults.get(unit.key);
    const error = result && !result.ok ? result.error : null;
    if (unit.kind === 'api') {
      lines.push(
        MESSAGES.checkSensor({
          id: unit.id,
          sensorType: record?.sensorType ?? '?',
          minutes: error ? null : hub.ageMinutes(record),
          stale: hub.isStale(record),
          error,
        }),
      );
    } else {
      const sensors = record
        ? record.features
            .map((feature) => feature.label)
            .filter((label, index, all) => all.indexOf(label) === index)
        : [];
      lines.push(
        MESSAGES.checkLocal({
          nodeId: record?.id ?? '?',
          software: record?.software,
          sensors,
          error,
        }),
      );
    }
  }
  if (config.invalidSensorIds.length > 0) {
    lines.push(MESSAGES.invalidIds(config.invalidSensorIds));
  }
  if (config.droppedSensorIds.length > 0) {
    lines.push(MESSAGES.tooManyIds(config.sensorIds.length));
  }
  return Object.fromEntries(
    Object.keys(lines[0]).map((lang) => [lang, lines.map((line) => line[lang]).join('\n')]),
  );
}
