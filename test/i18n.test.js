// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the texts of the code and
// the user documentation. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { LEVELS, MESSAGES, NAMES, TEXT } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 40,
  caption: 80,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(NAMES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 60, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the brand, the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('the feature names exist in every language, for every measure', () => {
  const found = [];
  for (const lang of LANGS) {
    if (
      JSON.stringify(sorted(Object.keys(NAMES[lang]))) !==
      JSON.stringify(sorted(Object.keys(NAMES.en)))
    ) {
      found.push(`NAMES.${lang} does not have the keys of NAMES.en`);
    }
    for (const [key, name] of Object.entries(NAMES[lang])) {
      // The local box adds the sensor family to its measures: "Température (BME280)".
      const longest = ['aqi', 'age'].includes(key) ? name : `${name} (IPS-7100)`;
      found.push(...textProblems(longest, `NAMES.${lang}.${key}`, lang, MAX.featureName));
    }
  }
  assert.deepEqual(found, []);
});

test('the levels of the index and the fixed texts exist in every language', () => {
  const short = new Set(['airQuality', 'measured', 'noData', 'noPm']);
  const found = [
    ...Object.entries(LEVELS).flatMap(([key, value]) =>
      problems(value, `LEVELS.${key}`, MAX.short),
    ),
    ...Object.entries(TEXT).flatMap(([key, value]) =>
      problems(
        value,
        `TEXT.${key}`,
        short.has(key) ? MAX.short : key === 'indicative' ? MAX.caption : MAX.message,
      ),
    ),
  ];
  assert.deepEqual(found, []);
});

test('the texts built from values exist in every language', () => {
  const samples = {
    measuredAgo: MESSAGES.measuredAgo(3, false),
    measuredStale: MESSAGES.measuredAgo(3000, true),
    summary: MESSAGES.summary({ level: 'poor', pm25: 62.4, pm10: 80, minutes: 3, stale: false }),
    invalidIds: MESSAGES.invalidIds(['abc']),
    tooManyIds: MESSAGES.tooManyIds(20),
    checkSensor: MESSAGES.checkSensor({ id: '1', sensorType: 'SDS011', minutes: 3, stale: false }),
    checkOffline: MESSAGES.checkSensor({ id: '1', minutes: null }),
    checkError: MESSAGES.checkSensor({ id: '1', error: 'HTTP 503' }),
    checkLocal: MESSAGES.checkLocal({ nodeId: 'esp8266-1', software: 'NRZ', sensors: ['SDS011'] }),
    checkLocalError: MESSAGES.checkLocal({ error: 'timeout' }),
    nearbyNone: MESSAGES.nearby({ house: 'Maison', radiusKm: 2, sensors: [] }),
  };
  const found = Object.entries(samples).flatMap(([key, value]) =>
    problems(value, `MESSAGES.${key}`, MAX.message),
  );
  assert.deepEqual(found, []);
  const nearby = MESSAGES.nearby({
    house: 'Maison',
    radiusKm: 2,
    sensors: [
      { id: '1', sensorType: 'SDS011', distanceKm: 0.4, indoor: true, measures: ['PM2.5'] },
    ],
  });
  assert.deepEqual(problems(nearby, 'MESSAGES.nearby', 1000), []);
  assert.equal(MESSAGES.measuredAgo(3, false).de, 'vor 3 Min.');
  assert.equal(MESSAGES.measuredAgo(3000, true).fr, 'Périmée (2 j)');
  assert.equal(MESSAGES.thrown(TEXT.noReading).split(' / ').length, 4);
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Light', fr: 'Éclairage', de: 'Licht' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Light', fr: 'Éclairage', de: '', es: 'Luz' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre IP', 'mit Ihrem', 'Ihnen']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.actions[0].fields[0].label.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.actions[0].fields[0].label has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

// --- User documentation --------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

/** The heading levels of a document, in order ("##", "###"...). */
const outline = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => /^#{1,4} /.test(line))
    .map((line) => line.split(' ')[0]);

test('the four docs exist, long enough for the store, with the same sections', () => {
  for (const lang of LANGS) {
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
    assert.deepEqual(outline(docs[lang]), outline(docs.en), `docs/${lang}.md has other sections`);
  }
  const headings = docs.en.split('\n').filter((line) => line.startsWith('## '));
  for (const section of [
    'What it does',
    'Requirements',
    'Configuration',
    'Devices',
    'Widget',
    'Scenes',
    'Scene examples',
    'Troubleshooting',
    'Limits',
  ]) {
    assert.ok(headings.includes(`## ${section}`), `docs/en.md lacks "## ${section}"`);
  }
});

test('the docs say the integration was developed without the hardware', () => {
  assert.match(docs.en, /Developed without the hardware: feedback welcome/);
  assert.match(docs.fr, /Développée sans le matériel : vos retours sont bienvenus/);
  assert.match(docs.de, /Ohne die Hardware entwickelt: Rückmeldungen willkommen/);
  assert.match(docs.es, /Desarrollada sin el hardware: sus comentarios son bienvenidos/);
  assert.ok(!POLITE_GERMAN.test(docs.de), 'docs/de.md uses the polite form');
});
