// -----------------------------------------------------------------------------
// The sensors the integration reads, what it knows about them, and what it
// publishes to Gladys.
//
// A "unit" is something the poller reads: one public sensor (API id) or the
// local box. Reading a unit updates its "record" (type, measures, last
// reading), persisted under /data; the record gives the Gladys device
// (src/devices.js) and its states.
//
// Freshness: the public API only serves the last 5 minutes. A sensor that
// sent nothing since keeps its last values, which are NOT published again: a
// value Gladys shows as recent is a recent measurement. Only the measurement
// age keeps moving, so a scene or the widget can tell a silent sensor.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { fetchSensor, ApiError } from './api.js';
import { fetchLocal, fetchNodeId } from './local.js';
import { airQualityIndex, EAQI_LEVELS } from './measures.js';
import { AGE_KEY, AQI_KEY, buildDevice, deviceName, featureOf, idsOf } from './devices.js';
import { createIssueLog } from './issues.js';
import { LEVELS } from './i18n.js';

const logger = createLogger({ name: 'sensors' });

/** Past this age, a measurement is stale: the widget and the logs say so. */
export const STALE_MINUTES = 15;

/** An unchanged value is published again this often (Gladys: "no recent value" past 48 h). */
export const STATE_HEARTBEAT_MS = 6 * 60 * 60 * 1000;

/** Key of the scene trigger fired when the European index changes level. */
export const AIR_QUALITY_CHANGED = 'air_quality_changed';

const STORE_VERSION = 1;

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {() => object} options.getConfig the current normalized config
   * @param {{ load: Function, save: Function }} options.store
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   */
  constructor({ gladys, getConfig, store, fetch, now = () => Date.now() }) {
    this.gladys = gladys;
    this.getConfig = getConfig;
    this.store = store;
    this.deps = { fetch, now };
    this.now = now;
    /** Record by key: "api:<id>" or "local:<chip id>". */
    this.records = new Map();
    /** Chip id of the box at each address (the box has no id in /data.json). */
    this.localIds = {};
    /** Set when the device list must be published again (new sensor, new measure). */
    this.devicesChanged = false;
    /** Set when the widget content changed (level, freshness). */
    this.widgetChanged = false;
    /** Records whose values must all be sent again (back from silence). */
    this.resend = new Set();
    /** Scene events waiting for the publication of their record's states. */
    this.pendingEvents = new Map();
    /** Outcome of the last read of each unit: { ok, error?, at }. */
    this.lastResults = new Map();
    this.issues = createIssueLog(logger);
  }

  async load() {
    const data = await this.store.load();
    if (data.version !== STORE_VERSION) {
      return;
    }
    for (const record of data.records ?? []) {
      if (record && (record.kind === 'api' || record.kind === 'local') && record.id) {
        this.records.set(recordKey(record), record);
      }
    }
    this.localIds = data.localIds && typeof data.localIds === 'object' ? data.localIds : {};
  }

  persist() {
    return this.store.save({
      version: STORE_VERSION,
      records: [...this.records.values()],
      localIds: this.localIds,
    });
  }

  /**
   * The units of the config: the public sensors, then the local box.
   * @returns {Array<{ key: string, kind: 'api' | 'local', id?: string }>}
   */
  units(config = this.getConfig()) {
    const units = config.sensorIds.map((id) => ({ key: `api:${id}`, kind: 'api', id }));
    if (config.localUrl) {
      units.push({ key: 'local', kind: 'local' });
    }
    return units;
  }

  /** The record of a unit, undefined until it was read once. */
  recordOf(unit, config = this.getConfig()) {
    if (unit.kind === 'api') {
      return this.records.get(unit.key);
    }
    const id = this.localIds[config.localUrl];
    return id ? this.records.get(`local:${id}`) : undefined;
  }

  /** The records of the configured units, in configuration order. */
  configuredRecords(config = this.getConfig()) {
    return this.units(config)
      .map((unit) => this.recordOf(unit, config))
      .filter(Boolean);
  }

  /** The record behind a device external id, among the configured ones. */
  recordByDevice(externalId, config = this.getConfig()) {
    return this.configuredRecords(config).find(
      (record) => idsOf(this.gladys, record).device === externalId,
    );
  }

  /** The unit that reads a record. */
  unitOfRecord(record, config = this.getConfig()) {
    return this.units(config).find((unit) => this.recordOf(unit, config) === record);
  }

  /**
   * The discovery payload: one device per configured record that measured
   * something (a device without its features would be added incomplete).
   */
  buildDevices(config = this.getConfig()) {
    return this.configuredRecords(config)
      .filter((record) => record.features.length > 0)
      .map((record) => buildDevice(this.gladys, record, config.language));
  }

  /** True when the user added the device of this record to Gladys. */
  isCreated(record) {
    const external = idsOf(this.gladys, record).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === external);
  }

  /** Minutes since the last measurement, null when there never was one. */
  ageMinutes(record) {
    if (!record?.measuredAt) {
      return null;
    }
    return Math.max(0, Math.floor((this.now() - record.measuredAt) / 60_000));
  }

  isStale(record) {
    const minutes = this.ageMinutes(record);
    return minutes === null || minutes > STALE_MINUTES;
  }

  /** The values of a record by measure (pm25, pm10...), the box's first sensor of each. */
  valuesByMeasure(record) {
    const values = {};
    for (const feature of record.features) {
      const first = featureOf(record, feature.measure);
      if (first && record.values[first.key] !== undefined) {
        values[feature.measure] = record.values[first.key];
      }
    }
    return values;
  }

  /** The European index of a record's last reading, null without PM. */
  indexOf(record) {
    return airQualityIndex(this.valuesByMeasure(record));
  }

  /**
   * Read one unit and publish what changed. Throws the read error (the poller
   * logs it), after recording it for the check action.
   * @param {{ key: string, kind: 'api' | 'local', id?: string }} unit
   */
  async refresh(unit) {
    const config = this.getConfig();
    try {
      const record =
        unit.kind === 'api' ? await this.readApi(unit) : await this.readLocal(config.localUrl);
      this.lastResults.set(unit.key, { ok: true, at: this.now() });
      if (record) {
        await this.publishStates(record);
      }
      return record;
    } catch (err) {
      this.lastResults.set(unit.key, { ok: false, error: err.message, at: this.now() });
      throw err;
    }
  }

  async readApi(unit) {
    let reading;
    try {
      reading = await fetchSensor(unit.id, this.deps);
      this.issues.ok('api', 'Sensor.Community API answers again');
    } catch (err) {
      if (err instanceof ApiError) {
        this.issues.fail('api', err.message);
      }
      throw err;
    }
    let record = this.records.get(unit.key);
    if (!reading) {
      logger.debug(`#${unit.id}: no measurement in the last 5 minutes`);
      if (record) {
        this.watchFreshness(record);
      }
      return record;
    }
    const isNew = !record;
    record ??= { kind: 'api', id: unit.id, features: [], values: {}, measuredAt: null };
    record.sensorType = reading.sensorType;
    record.location = reading.location;
    const added = this.learnFeatures(
      record,
      Object.keys(reading.values).map((measure) => ({ key: measure, measure })),
    );
    if (isNew) {
      this.records.set(unit.key, record);
      this.devicesChanged = true;
      logger.info(
        `Sensor #${unit.id} found: ${reading.sensorType} (${Object.keys(reading.values).join(', ')})`,
      );
    } else if (added.length > 0) {
      logger.info(`Sensor #${unit.id} also measures ${added.join(', ')}`);
    }
    this.applyReading(record, reading.values, reading.measuredAt);
    logger.debug(`#${unit.id}: ${JSON.stringify(reading.values)}`);
    return record;
  }

  async readLocal(url) {
    let id = this.localIds[url];
    try {
      if (!id || this.checkedLocalUrl !== url) {
        // The chip id is the stable identity of the box, checked once per
        // start (another box may have taken the address). A firmware without
        // the /metrics page (before 2020) falls back to its address.
        const nodeId = await fetchNodeId(url, this.deps);
        if (!nodeId) {
          logger.warn(
            'The airRohr box has no /metrics page: its device is named after its address',
          );
        }
        const found = nodeId ?? `host-${new URL(url).host.replace(/[^A-Za-z0-9]+/g, '-')}`;
        this.checkedLocalUrl = url;
        if (found !== id) {
          id = found;
          this.localIds = { [url]: id };
          this.persistNeeded = true;
        }
      }
      const reading = await fetchLocal(url, this.deps);
      this.issues.ok('local', 'The airRohr box answers again');
      const key = `local:${id}`;
      let record = this.records.get(key);
      const isNew = !record;
      record ??= { kind: 'local', id, features: [], values: {}, measuredAt: null };
      record.software = reading.software;
      const added = this.learnFeatures(record, reading.features);
      if (isNew) {
        this.records.set(key, record);
        this.devicesChanged = true;
        logger.info(
          `airRohr box ${id} found: ${reading.software ?? 'unknown firmware'} (${reading.features
            .map((f) => f.label)
            .filter((label, index, all) => all.indexOf(label) === index)
            .join(', ')})`,
        );
      } else if (added.length > 0) {
        logger.info(`airRohr box ${id} also measures ${added.join(', ')}`);
      }
      if (reading.measuredAt !== null) {
        this.applyReading(record, reading.values, reading.measuredAt);
      } else {
        this.watchFreshness(record);
      }
      logger.debug(`airRohr ${id}: ${JSON.stringify(reading.values)}`);
      return record;
    } catch (err) {
      this.issues.fail('local', `airRohr box at ${redactUrl(url)}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Add the measures a record never sent before. Never removes one: a feature
   * is an external id Gladys keeps.
   * @returns {string[]} the added keys
   */
  learnFeatures(record, features) {
    const added = [];
    for (const feature of features) {
      if (!record.features.some((known) => known.key === feature.key)) {
        const { key, measure, label } = feature;
        record.features.push(label ? { key, measure, label } : { key, measure });
        added.push(key);
      }
    }
    if (added.length > 0) {
      this.devicesChanged = true;
      this.persistNeeded = true;
    }
    return added;
  }

  /** A newer measurement: keep it, evaluate the scene trigger. */
  applyReading(record, values, measuredAt) {
    if (record.measuredAt && measuredAt <= record.measuredAt) {
      this.watchFreshness(record);
      return;
    }
    const before = this.indexOf(record)?.level ?? null;
    if (this.isStale(record)) {
      // Back from silence: every value goes out again, even an unchanged one,
      // so Gladys dates it now.
      this.resend.add(recordKey(record));
    }
    record.values = { ...record.values, ...values };
    record.measuredAt = measuredAt;
    this.persistNeeded = true;
    this.watchFreshness(record);
    const index = this.indexOf(record);
    if ((index?.level ?? null) !== before) {
      this.widgetChanged = true;
    }
    const event = this.levelEvent(record, index);
    if (event) {
      this.pendingEvents.set(recordKey(record), event);
    }
  }

  /** Log (once) a sensor that went silent, and its return. */
  watchFreshness(record) {
    const key = `stale:${recordKey(record)}`;
    const stale = this.isStale(record);
    if (stale !== this.issues.isFailing(key)) {
      this.widgetChanged = true;
    }
    if (stale && record.measuredAt) {
      this.issues.fail(
        key,
        `${deviceName(record)}: no measurement for ${this.ageMinutes(record)} min`,
      );
    } else if (!stale) {
      this.issues.ok(key, `${deviceName(record)}: measurements again`);
    }
  }

  /**
   * The scene event of a reading, when its level changed. A level is
   * announced once it held on two readings in a row: a dust sensor reading
   * around a band limit would otherwise fire a scene every 5 minutes. The
   * first reading after the install sets the starting level, without event.
   */
  levelEvent(record, index) {
    if (!index) {
      return null;
    }
    if (record.announcedLevel === undefined || record.announcedLevel === null) {
      record.announcedLevel = index.level;
      record.candidateLevel = null;
      return null;
    }
    if (index.level === record.announcedLevel) {
      record.candidateLevel = null;
      return null;
    }
    if (record.candidateLevel !== index.level) {
      record.candidateLevel = index.level;
      return null;
    }
    const previous = record.announcedLevel;
    record.announcedLevel = index.level;
    record.candidateLevel = null;
    const values = this.valuesByMeasure(record);
    const language = this.getConfig().language;
    const device = idsOf(this.gladys, record).device;
    const created = (this.gladys.devices ?? []).find((known) => known.external_id === device);
    return {
      device,
      sensor_name: created?.name || deviceName(record),
      level: index.key,
      level_label: LEVELS[index.key][language],
      level_index: index.level,
      previous_level: EAQI_LEVELS[previous - 1],
      previous_level_index: previous,
      pollutant: index.pollutant,
      pm25: values.pm25 ?? null,
      pm10: values.pm10 ?? null,
    };
  }

  /**
   * Publish the states of a record whose device exists in Gladys: its values
   * while they are fresh, its European index, and always its age. Only the
   * changes go out (the SDK deduplicates), plus a heartbeat.
   * @param {object} record
   * @param {{ force?: boolean }} [options] force: the device was just added
   */
  async publishStates(record, { force = false } = {}) {
    const event = this.pendingEvents.get(recordKey(record));
    this.pendingEvents.delete(recordKey(record));
    if (!this.isCreated(record)) {
      return;
    }
    const ids = idsOf(this.gladys, record);
    if (force || this.resend.has(recordKey(record))) {
      this.resend.delete(recordKey(record));
      this.gladys.forgetPublishedStates(ids.device);
    }
    const states = [];
    const minutes = this.ageMinutes(record);
    if (minutes !== null && !this.isStale(record)) {
      for (const feature of record.features) {
        const value = record.values[feature.key];
        if (typeof value === 'number') {
          states.push({ device_feature_external_id: ids.feature(feature.key), state: value });
        }
      }
      const index = this.indexOf(record);
      if (index) {
        states.push({ device_feature_external_id: ids.feature(AQI_KEY), state: index.level });
      }
    }
    if (minutes !== null) {
      states.push({ device_feature_external_id: ids.feature(AGE_KEY), state: minutes });
    }
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
    if (event) {
      logger.info(`${deviceName(record)}: air quality ${event.previous_level} -> ${event.level}`);
      await this.gladys.publishSceneEvent(AIR_QUALITY_CHANGED, event);
    }
  }

  /** Forget the records of the units no longer configured (kept under /data otherwise). */
  prune(config = this.getConfig()) {
    const kept = new Set(this.configuredRecords(config).map(recordKey));
    let removed = false;
    for (const key of this.records.keys()) {
      if (!kept.has(key)) {
        this.records.delete(key);
        removed = true;
      }
    }
    const localId = this.localIds[config.localUrl];
    this.localIds = config.localUrl && localId ? { [config.localUrl]: localId } : {};
    if (removed) {
      this.persistNeeded = true;
    }
  }

  /** Persist if anything changed since the last save. */
  async save() {
    if (this.persistNeeded) {
      this.persistNeeded = false;
      await this.persist();
    }
  }
}

/** The key of a record in the map. */
export function recordKey(record) {
  return `${record.kind}:${record.id}`;
}

/** An address without credentials, for the logs. */
export function redactUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return '(invalid address)';
  }
}
