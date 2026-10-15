// -----------------------------------------------------------------------------
// Scene action "Get the air quality" (Gladys 5.1+).
//
// Gives a scene the air quality of one sensor, or the worst among the fresh
// readings of every added sensor, as outputs a notification can quote:
// "{{...summary}}" reads "Poor · PM2.5 62 µg/m³ · PM10 80 µg/m³ · 3 min ago".
// The devices already give each value to the scene conditions; what this
// action adds is the choice of the worst sensor, the level as a word in the
// configured language, and a ready-made sentence.
//
// The trigger "Air quality changed" is fired by the hub (src/hub.js) when the
// level of a sensor changes.
// -----------------------------------------------------------------------------

import { MESSAGES, LEVELS, TEXT } from './i18n.js';
import { hasAirQuality } from './devices.js';

export const GET_AIR_QUALITY = 'get_air_quality';

/**
 * @param {import('./hub.js').Hub} hub
 * @param {{ sensor?: string }} fields
 * @param {string} language
 */
export function getAirQuality(hub, fields, language) {
  const created = hub
    .configuredRecords()
    .filter((record) => hub.isCreated(record) && hasAirQuality(record));
  let record;
  if (fields.sensor) {
    record = created.find((candidate) => candidate === hub.recordByDevice(fields.sensor));
  } else {
    // The worst level among the fresh readings; the most recent one on a tie.
    const fresh = created.filter((candidate) => !hub.isStale(candidate) && hub.indexOf(candidate));
    record = fresh.sort(
      (a, b) =>
        hub.indexOf(b).level - hub.indexOf(a).level || (b.measuredAt ?? 0) - (a.measuredAt ?? 0),
    )[0];
  }
  const index = record && hub.indexOf(record);
  if (!index || hub.ageMinutes(record) === null) {
    throw new Error(MESSAGES.thrown(TEXT.noReading));
  }
  const values = hub.valuesByMeasure(record);
  const minutes = hub.ageMinutes(record);
  const stale = hub.isStale(record);
  const outputs = {
    level: index.key,
    level_index: index.level,
    level_label: LEVELS[index.key][language],
    pm25: values.pm25 ?? null,
    pm10: values.pm10 ?? null,
    age_minutes: minutes,
    summary: MESSAGES.summary({
      level: index.key,
      pm25: values.pm25,
      pm10: values.pm10,
      minutes,
      stale,
    })[language],
  };
  // A pollutant the sensor does not measure is left out (null for the scene).
  return Object.fromEntries(Object.entries(outputs).filter(([, value]) => value !== null));
}
