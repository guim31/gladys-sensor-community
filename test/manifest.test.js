// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, LANGUAGES, REFRESH_MINUTES } from '../src/config.js';
import { ACTION, RADII_KM } from '../src/actions.js';
import { GET_AIR_QUALITY } from '../src/scenes.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { AIR_QUALITY_CHANGED } from '../src/hub.js';
import { EAQI_LEVELS } from '../src/measures.js';
import { LEVELS } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...(manifest.contact_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Manifest fields older Gladys releases reject as unknown, with the first
// release accepting them. The store validator refuses a manifest whose
// `gladys_version` minimum is lower: these tests catch it before a release.
const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
// A `source: "houses"` select (the nearby search) needs the 5.2.0 core.
const HOUSES_SOURCE_MIN_GLADYS_VERSION = [5, 2, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 1, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action has a registered handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.values(ACTION).sort());
  for (const name of Object.keys(ACTION)) {
    assert.ok(appSource.includes(`onAction(ACTION.${name}`), `no onAction for ${name}`);
  }
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  // The store vocabulary itself is checked by the store validator (unknown
  // keys are dropped with a warning there) — what this test pins is the
  // coupling rule: older cores reject any unknown manifest field, so a
  // manifest declaring `categories` must not claim compatibility below the
  // first release that accepts it.
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(
    isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION),
    `categories requires gladys_version >= 4.86.0, got "${manifest.gladys_version}"`,
  );
});

test('declaring scene triggers, scene actions or widgets requires Gladys >= 5.1.0', () => {
  const declared = CAPABILITY_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.ok(declared.length > 0);
  assert.ok(
    isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION),
    `${declared.join(', ')} requires gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
});

test('a source "houses" select requires Gladys >= 5.2.0, and the location contract', () => {
  assert.ok(allFields.some((field) => field.source === 'houses'));
  assert.ok(isAtLeast(minGladysVersion(), HOUSES_SOURCE_MIN_GLADYS_VERSION));
  // getHouses (the coordinates of the house) is a 403 without it.
  assert.equal(manifest.location, true);
});

test('the scene action, the trigger and the widget are the ones the code serves', () => {
  assert.deepEqual(keysOf(manifest.scene_actions), [GET_AIR_QUALITY]);
  assert.ok(appSource.includes('onSceneAction(GET_AIR_QUALITY'));
  assert.deepEqual(keysOf(manifest.scene_triggers), [AIR_QUALITY_CHANGED]);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.ok(appSource.includes('onWidgetGet(WIDGET_KEY'));
});

test('the published keys are English, lowercase and stable', () => {
  // Frozen once published: renaming one breaks the users' scenes and dashboards.
  assert.deepEqual(keysOf(manifest.actions), ['find_nearby', 'check_sensors']);
  assert.equal(GET_AIR_QUALITY, 'get_air_quality');
  assert.equal(AIR_QUALITY_CHANGED, 'air_quality_changed');
  assert.equal(WIDGET_KEY, 'air_quality');
  assert.deepEqual(EAQI_LEVELS, [
    'good',
    'fair',
    'moderate',
    'poor',
    'very_poor',
    'extremely_poor',
  ]);
});

test('the select options are the values the code understands', () => {
  const field = (list, key) => list.find((f) => f.key === key);
  assert.deepEqual(
    field(manifest.config_schema, 'refresh_minutes').options.map((o) => o.value),
    REFRESH_MINUTES,
  );
  assert.deepEqual(
    field(manifest.config_schema, 'language').options.map((o) => o.value),
    LANGUAGES,
  );
  const nearby = manifest.actions.find((a) => a.key === 'find_nearby');
  assert.deepEqual(
    field(nearby.fields, 'radius_km').options.map((o) => o.value),
    RADII_KM,
  );
  const trigger = manifest.scene_triggers[0];
  const levels = field(trigger.fields, 'level').options;
  assert.deepEqual(
    levels.map((o) => o.value),
    EAQI_LEVELS,
  );
  for (const option of levels) {
    assert.deepEqual(option.label, LEVELS[option.value], `${option.value}: same words as the code`);
  }
});

test('actions apply no default: no action field is required (Gladys#3155)', () => {
  for (const action of manifest.actions) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.required, true, `${action.key}.${field.key}`);
      assert.equal(field.default, undefined, `${action.key}.${field.key}`);
      assert.notEqual(field.type, 'secret', `${action.key}.${field.key}`);
    }
  }
});

test('the manifest identity: name, category, transports, image', () => {
  assert.equal(manifest.name, 'Sensor.Community');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.deepEqual(manifest.categories, ['environment']);
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-sensor-community:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-sensor-community/main/cover.png',
  );
});

test('every config key the code relies on is declared, with no number field', () => {
  const declared = new Set(
    manifest.config_schema.filter((f) => f.type !== 'section').map((f) => f.key),
  );
  assert.deepEqual([...declared].sort(), Object.keys(DEFAULT_CONFIG).sort());
  // A number field is rendered without `step`: avoided altogether.
  assert.ok(manifest.config_schema.every((f) => f.type !== 'number'));
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0, 'the form opens with an onboarding section');
  for (const section of sections) {
    // A section stores NO value: declaring `required`, `default` or
    // `placeholder` on it rejects the manifest, and its key must never leak
    // into the config the code manipulates.
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(
      section.placeholder,
      undefined,
      `section "${section.key}" must not have a placeholder`,
    );
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" stores no value and must not appear in DEFAULT_CONFIG`,
    );
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.ok(['devices', 'houses'].includes(field.source), `field "${field.key}": source`);
    assert.equal(
      field.options,
      undefined,
      `field "${field.key}": declaring source and options together rejects the manifest`,
    );
    assert.equal(field.default, undefined, `field "${field.key}": no default with a source`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  // A store rule (the catalog card is short): a longer text rejects the
  // manifest.
  assert.ok(manifest.description.en, 'the description needs an English text');
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  // Like `label` and `description`: a plain string rejects the manifest.
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
