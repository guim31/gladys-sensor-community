// -----------------------------------------------------------------------------
// Every text the integration shows to the user, in the four languages of the
// Gladys interface (en, fr, de, es). German says "du", Spanish says "usted",
// like the rest of guim31's integrations. The vocabulary follows the Gladys
// interface (front/src/config/i18n).
//
//   - NAMES    : the feature names, in the language of the configuration
//                (Gladys freezes a name when the device is created);
//   - LEVELS   : the levels of the European Air Quality Index;
//   - TEXT     : fixed texts (widget, statuses);
//   - MESSAGES : texts built from values (action results, errors).
//
// test/i18n.test.js checks that every entry carries the four languages.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

/** Feature names, by language then measure. */
export const NAMES = {
  en: {
    pm25: 'PM2.5',
    pm10: 'PM10',
    pm1: 'PM1',
    temperature: 'Temperature',
    humidity: 'Humidity',
    pressure: 'Pressure',
    pressure_sealevel: 'Sea-level pressure',
    noise_laeq: 'Noise (LAeq)',
    noise_min: 'Noise minimum',
    noise_max: 'Noise maximum',
    co2: 'CO2',
    aqi: 'Air quality index (EAQI)',
    age: 'Measurement age',
  },
  fr: {
    pm25: 'PM2.5',
    pm10: 'PM10',
    pm1: 'PM1',
    temperature: 'Température',
    humidity: 'Humidité',
    pressure: 'Pression',
    pressure_sealevel: 'Pression au niveau de la mer',
    noise_laeq: 'Bruit (LAeq)',
    noise_min: 'Bruit minimum',
    noise_max: 'Bruit maximum',
    co2: 'CO2',
    aqi: "Indice de qualité de l'air (EAQI)",
    age: 'Âge de la mesure',
  },
  de: {
    pm25: 'PM2.5',
    pm10: 'PM10',
    pm1: 'PM1',
    temperature: 'Temperatur',
    humidity: 'Luftfeuchtigkeit',
    pressure: 'Luftdruck',
    pressure_sealevel: 'Luftdruck auf Meereshöhe',
    noise_laeq: 'Lärm (LAeq)',
    noise_min: 'Lärm Minimum',
    noise_max: 'Lärm Maximum',
    co2: 'CO2',
    aqi: 'Luftqualitätsindex (EAQI)',
    age: 'Alter der Messung',
  },
  es: {
    pm25: 'PM2.5',
    pm10: 'PM10',
    pm1: 'PM1',
    temperature: 'Temperatura',
    humidity: 'Humedad',
    pressure: 'Presión',
    pressure_sealevel: 'Presión a nivel del mar',
    noise_laeq: 'Ruido (LAeq)',
    noise_min: 'Ruido mínimo',
    noise_max: 'Ruido máximo',
    co2: 'CO2',
    aqi: 'Índice de calidad del aire (EAQI)',
    age: 'Antigüedad de la medición',
  },
};

/** The six levels of the European Air Quality Index, in order. */
export const LEVELS = {
  good: { en: 'Good', fr: 'Bon', de: 'Gut', es: 'Buena' },
  fair: { en: 'Fair', fr: 'Moyen', de: 'Ausreichend', es: 'Razonablemente buena' },
  moderate: { en: 'Moderate', fr: 'Dégradé', de: 'Mäßig', es: 'Regular' },
  poor: { en: 'Poor', fr: 'Mauvais', de: 'Schlecht', es: 'Desfavorable' },
  very_poor: { en: 'Very poor', fr: 'Très mauvais', de: 'Sehr schlecht', es: 'Muy desfavorable' },
  extremely_poor: {
    en: 'Extremely poor',
    fr: 'Extrêmement mauvais',
    de: 'Extrem schlecht',
    es: 'Extremadamente desfavorable',
  },
};

/** Fixed texts. */
export const TEXT = {
  airQuality: {
    en: 'Air quality',
    fr: "Qualité de l'air",
    de: 'Luftqualität',
    es: 'Calidad del aire',
  },
  measured: { en: 'Measured', fr: 'Mesure', de: 'Gemessen', es: 'Medición' },
  noData: { en: 'No data', fr: 'Aucune donnée', de: 'Keine Daten', es: 'Sin datos' },
  noPm: {
    en: 'No particle sensor',
    fr: 'Pas de capteur de particules',
    de: 'Kein Feinstaubsensor',
    es: 'Sin sensor de partículas',
  },
  indicative: {
    en: 'European index (EEA), indicative: low-cost sensor, last 5 minutes.',
    fr: 'Indice européen (AEE), indicatif : capteur citoyen, 5 dernières minutes.',
    de: 'Europäischer Index (EUA), Richtwert: Bürgersensor, letzte 5 Minuten.',
    es: 'Índice europeo (AEMA), orientativo: sensor ciudadano, últimos 5 minutos.',
  },
  noSensor: {
    en: 'Add a sensor in the Discovery tab of the integration to see its air quality here.',
    fr: "Ajoutez un capteur depuis l'onglet Découverte de l'intégration pour voir ici sa qualité de l'air.",
    de: 'Füge im Tab „Entdecken“ der Integration einen Sensor hinzu, um hier seine Luftqualität zu sehen.',
    es: 'Añada un sensor desde la pestaña Descubrimiento de la integración para ver aquí su calidad del aire.',
  },
  unknownSensor: {
    en: 'This sensor is no longer read: pick another one in the widget settings.',
    fr: "Ce capteur n'est plus lu : choisissez-en un autre dans les réglages du widget.",
    de: 'Dieser Sensor wird nicht mehr gelesen: wähle in den Einstellungen des Widgets einen anderen.',
    es: 'Este sensor ya no se lee: elija otro en los ajustes del widget.',
  },

  // Configuration screen
  notConfigured: {
    en: 'Enter the ids of the sensors to read, or the address of your airRohr box.',
    fr: "Saisissez les identifiants des capteurs à lire, ou l'adresse de votre boîtier airRohr.",
    de: 'Gib die IDs der zu lesenden Sensoren oder die Adresse deiner airRohr-Box ein.',
    es: 'Introduzca los identificadores de los sensores que desea leer, o la dirección de su caja airRohr.',
  },
  apiUnreachable: {
    en: 'The Sensor.Community API does not answer: the readings will resume on their own.',
    fr: "L'API de Sensor.Community ne répond pas : les relevés reprendront d'eux-mêmes.",
    de: 'Die API von Sensor.Community antwortet nicht: die Messungen laufen von selbst wieder an.',
    es: 'La API de Sensor.Community no responde: las lecturas se reanudarán por sí solas.',
  },
  localUnreachable: {
    en: 'Your airRohr box does not answer: check its address and that it is powered.',
    fr: "Votre boîtier airRohr ne répond pas : vérifiez son adresse et qu'il est alimenté.",
    de: 'Deine airRohr-Box antwortet nicht: prüfe ihre Adresse und ihre Stromversorgung.',
    es: 'Su caja airRohr no responde: compruebe su dirección y que esté alimentada.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, sieh dir die Logs der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  noHouse: {
    en: 'No house of Gladys has a location: set it in Settings → Houses.',
    fr: "Aucune maison de Gladys n'a de position : renseignez-la dans Paramètres → Maisons.",
    de: 'Kein Haus in Gladys hat einen Standort: lege ihn unter Einstellungen → Häuser fest.',
    es: 'Ninguna casa de Gladys tiene ubicación: indíquela en Ajustes → Casas.',
  },
  nothingConfigured: {
    en: 'Nothing to check: enter sensor ids or the address of your box first.',
    fr: "Rien à vérifier : saisissez d'abord des identifiants de capteurs ou l'adresse de votre boîtier.",
    de: 'Nichts zu prüfen: gib zuerst Sensor-IDs oder die Adresse deiner Box ein.',
    es: 'Nada que comprobar: introduzca primero identificadores de sensores o la dirección de su caja.',
  },
  noReading: {
    en: 'No air quality reading yet: wait for the first measurements.',
    fr: "Aucune mesure de qualité de l'air pour l'instant : attendez les premiers relevés.",
    de: 'Noch keine Luftqualitätsmessung: warte auf die ersten Messungen.',
    es: 'Todavía no hay medición de la calidad del aire: espere las primeras lecturas.',
  },
};

/** Multi-language object built by a function of the language. */
function build(render) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, render(lang)]));
}

/**
 * A number written the way the language writes it (decimal comma in French,
 * German and Spanish).
 */
export function formatNumber(value, lang, decimals = 1) {
  return new Intl.NumberFormat(lang, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

/** How long ago, in short words: "3 min", "2 h", "4 d". */
export function formatAge(minutes, lang) {
  const units = {
    en: ['min', 'h', 'd'],
    fr: ['min', 'h', 'j'],
    de: ['Min.', 'Std.', 'T.'],
    es: ['min', 'h', 'd'],
  }[lang];
  if (minutes < 120) {
    return `${Math.max(0, Math.round(minutes))} ${units[0]}`;
  }
  if (minutes < 48 * 60) {
    return `${Math.round(minutes / 60)} ${units[1]}`;
  }
  return `${Math.round(minutes / 1440)} ${units[2]}`;
}

const AGO = {
  en: (age) => `${age} ago`,
  fr: (age) => `il y a ${age}`,
  de: (age) => `vor ${age}`,
  es: (age) => `hace ${age}`,
};

const STALE = {
  en: (age) => `Stale (${age})`,
  fr: (age) => `Périmée (${age})`,
  de: (age) => `Veraltet (${age})`,
  es: (age) => `Caducada (${age})`,
};

/** Texts built from values. */
export const MESSAGES = {
  /** "3 min ago", or "Stale (2 h)" past the freshness limit. */
  measuredAgo: (minutes, stale) =>
    build((lang) => (stale ? STALE : AGO)[lang](formatAge(minutes, lang))),

  /** One-line summary of a reading, for notifications. */
  summary: ({ level, pm25, pm10, minutes, stale }) =>
    build((lang) => {
      const parts = [level ? LEVELS[level][lang] : TEXT.noPm[lang]];
      if (typeof pm25 === 'number') {
        parts.push(`PM2.5 ${formatNumber(pm25, lang)} µg/m³`);
      }
      if (typeof pm10 === 'number') {
        parts.push(`PM10 ${formatNumber(pm10, lang)} µg/m³`);
      }
      parts.push(MESSAGES.measuredAgo(minutes, stale)[lang]);
      return parts.join(' · ');
    }),

  invalidIds: (ids) =>
    build((lang) => {
      const list = ids.join(', ');
      return {
        en: `Ignored, not a sensor id: ${list}.`,
        fr: `Ignoré, ce n'est pas un identifiant de capteur : ${list}.`,
        de: `Ignoriert, keine Sensor-ID: ${list}.`,
        es: `Ignorado, no es un identificador de sensor: ${list}.`,
      }[lang];
    }),

  tooManyIds: (max) =>
    build(
      (lang) =>
        ({
          en: `Only the first ${max} sensors are read.`,
          fr: `Seuls les ${max} premiers capteurs sont lus.`,
          de: `Nur die ersten ${max} Sensoren werden gelesen.`,
          es: `Solo se leen los ${max} primeros sensores.`,
        })[lang],
    ),

  /** One line of the check report, for a public sensor. */
  checkSensor: ({ id, sensorType, minutes, stale, error }) =>
    build((lang) => {
      if (error) {
        return {
          en: `#${id}: error (${error})`,
          fr: `#${id} : erreur (${error})`,
          de: `#${id}: Fehler (${error})`,
          es: `#${id}: error (${error})`,
        }[lang];
      }
      if (minutes === null) {
        return {
          en: `#${id}: no data in the last 5 minutes (offline, or a wrong id)`,
          fr: `#${id} : aucune donnée depuis 5 minutes (hors ligne, ou identifiant erroné)`,
          de: `#${id}: keine Daten in den letzten 5 Minuten (offline oder falsche ID)`,
          es: `#${id}: sin datos en los últimos 5 minutos (desconectado, o identificador erróneo)`,
        }[lang];
      }
      return `#${id} ${sensorType}: ${MESSAGES.measuredAgo(minutes, stale)[lang]}`;
    }),

  /** One line of the check report, for the local box. */
  checkLocal: ({ nodeId, software, sensors, error }) =>
    build((lang) => {
      if (error) {
        return {
          en: `airRohr box: ${error}`,
          fr: `Boîtier airRohr : ${error}`,
          de: `airRohr-Box: ${error}`,
          es: `Caja airRohr: ${error}`,
        }[lang];
      }
      const list = sensors.length > 0 ? sensors.join(', ') : TEXT.noData[lang];
      return {
        en: `airRohr box ${nodeId} (${software ?? '?'}): ${list}`,
        fr: `Boîtier airRohr ${nodeId} (${software ?? '?'}) : ${list}`,
        de: `airRohr-Box ${nodeId} (${software ?? '?'}): ${list}`,
        es: `Caja airRohr ${nodeId} (${software ?? '?'}): ${list}`,
      }[lang];
    }),

  /** Result of the nearby search. */
  nearby: ({ house, radiusKm, sensors }) =>
    build((lang) => {
      const radius = formatNumber(radiusKm, lang);
      if (sensors.length === 0) {
        return {
          en: `No sensor sent data within ${radius} km of "${house}" in the last 5 minutes: try a wider radius.`,
          fr: `Aucun capteur n'a envoyé de données à moins de ${radius} km de « ${house} » ces 5 dernières minutes : essayez un rayon plus grand.`,
          de: `Kein Sensor im Umkreis von ${radius} km um „${house}“ hat in den letzten 5 Minuten Daten gesendet: versuch einen größeren Radius.`,
          es: `Ningún sensor ha enviado datos a menos de ${radius} km de «${house}» en los últimos 5 minutos: pruebe un radio mayor.`,
        }[lang];
      }
      const indoor = { en: 'indoor', fr: 'intérieur', de: 'innen', es: 'interior' }[lang];
      const lines = sensors.map(
        (s) =>
          `#${s.id} ${s.sensorType} · ${formatNumber(s.distanceKm, lang)} km` +
          `${s.indoor ? ` · ${indoor}` : ''} · ${s.measures.join(', ')}`,
      );
      const ids = sensors.map((s) => s.id).join(', ');
      const head = {
        en: `${sensors.length} sensor(s) within ${radius} km of "${house}", nearest first:`,
        fr: `${sensors.length} capteur(s) à moins de ${radius} km de « ${house} », du plus proche au plus loin :`,
        de: `${sensors.length} Sensor(en) im Umkreis von ${radius} km um „${house}“, der nächste zuerst:`,
        es: `${sensors.length} sensor(es) a menos de ${radius} km de «${house}», del más cercano al más lejano:`,
      }[lang];
      const tail = {
        en: `Copy the ids you want into "Sensor ids": ${ids}`,
        fr: `Copiez les identifiants voulus dans « Identifiants des capteurs » : ${ids}`,
        de: `Kopiere die gewünschten IDs in „Sensor-IDs“: ${ids}`,
        es: `Copie los identificadores deseados en «Identificadores de los sensores»: ${ids}`,
      }[lang];
      return [head, ...lines, tail].join('\n');
    }),

  /** A thrown error: the core shows it as is, so every language is joined. */
  thrown: (text) => LANGUAGES.map((lang) => text[lang]).join(' / '),
};
