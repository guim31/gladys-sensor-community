// -----------------------------------------------------------------------------
// The "Air quality" dashboard widget (Gladys 5.1+).
//
// With a sensor chosen in its settings: live tiles (PM2.5, PM10, temperature,
// humidity, bound to the device features so they follow every state), the
// European index level colored by its band, and how old the measurement is.
// Without one: one row per added sensor, its level colored.
//
// The content is built from what the integration already read: showing the
// widget never calls the API. The core caches it per (settings, language,
// units), so the texts are localized in the language it asks for.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LEVELS, MESSAGES, NAMES, TEXT } from './i18n.js';
import { deviceName, featureOf, hasAirQuality, idsOf } from './devices.js';
import { LANGUAGES } from './config.js';

export const WIDGET_KEY = 'air_quality';

/** Seconds the core keeps a content: the age row moves by the minute. */
const TTL_SECONDS = 120;

/** The tiles of the single-sensor view, in order (4 at most fit nicely). */
const TILES = ['pm25', 'pm10', 'temperature', 'humidity'];

/** Color of a level of the European index (good/fair green, moderate orange, worse red). */
export function levelColor(level) {
  if (level <= 2) {
    return WIDGET_COLORS.SUCCESS;
  }
  return level === 3 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.DANGER;
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The level row of a record: its label and color, neutral when stale. */
function levelItem(hub, record, label, language) {
  const index = hub.indexOf(record);
  const stale = hub.isStale(record);
  if (!hasAirQuality(record)) {
    return { label, value: TEXT.noPm[language], color: WIDGET_COLORS.NEUTRAL };
  }
  if (!index || hub.ageMinutes(record) === null) {
    return { label, value: TEXT.noData[language], color: WIDGET_COLORS.NEUTRAL };
  }
  if (stale) {
    const value = MESSAGES.measuredAgo(hub.ageMinutes(record), true)[language];
    return { label, value: clip(value, 40), color: WIDGET_COLORS.NEUTRAL, icon: 'clock' };
  }
  return { label, value: LEVELS[index.key][language], color: levelColor(index.level) };
}

/**
 * The widget content.
 * @param {object} options
 * @param {import('./hub.js').Hub} options.hub
 * @param {object} options.gladys
 * @param {{ sensor?: string }} [options.settings]
 * @param {string} [options.language]
 */
export function buildAirQualityContent({ hub, gladys, settings = {}, language = 'en' }) {
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const caption = { type: 'text', variant: 'caption', text: TEXT.indicative[lang] };

  if (settings.sensor) {
    const record = hub.recordByDevice(settings.sensor);
    if (!record) {
      return {
        ttl_seconds: TTL_SECONDS,
        components: [{ type: 'text', text: TEXT.unknownSensor[lang] }],
      };
    }
    const ids = idsOf(gladys, record);
    const tiles = TILES.map((measure) => featureOf(record, measure))
      .filter(Boolean)
      .map((feature) => ({
        type: 'value',
        label: NAMES[lang][feature.measure],
        device_feature: ids.feature(feature.key),
      }));
    const minutes = hub.ageMinutes(record);
    const items = [levelItem(hub, record, TEXT.airQuality[lang], lang)];
    if (minutes !== null && !hub.isStale(record)) {
      items.push({
        label: TEXT.measured[lang],
        value: clip(MESSAGES.measuredAgo(minutes, false)[lang], 40),
        color: WIDGET_COLORS.NEUTRAL,
        icon: 'clock',
      });
    }
    return {
      ttl_seconds: TTL_SECONDS,
      components: [...tiles, { type: 'status', items }, caption],
    };
  }

  const created = hub.configuredRecords().filter((record) => hub.isCreated(record));
  if (created.length === 0) {
    return { ttl_seconds: TTL_SECONDS, components: [{ type: 'text', text: TEXT.noSensor[lang] }] };
  }
  // The name the user gave the device in Gladys, else ours.
  const nameOf = (record) =>
    (gladys.devices ?? []).find((device) => device.external_id === idsOf(gladys, record).device)
      ?.name || deviceName(record);
  const withPm = created.filter(hasAirQuality);
  const shown = (withPm.length > 0 ? withPm : created).slice(0, 10);
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'status',
        items: shown.map((record) => levelItem(hub, record, clip(nameOf(record), 40), lang)),
      },
      caption,
    ],
  };
}
