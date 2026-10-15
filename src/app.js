// -----------------------------------------------------------------------------
// The integration, wired on a Gladys client: the real one (index.js) or the
// SDK's fake Gladys (tests). Every handler is registered here, before
// connect().
//
//   connected       -> config, devices known from /data, then a first read
//   poller          -> reads the sensors on its own timer (src/poller.js)
//   onPoll          -> fallback of the timer
//   onDeviceCreated -> the states of the new device, now
//   actions         -> nearby search, check (src/actions.js)
//   scene action    -> get_air_quality (src/scenes.js)
//   widget          -> air_quality (src/widgets.js)
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { Hub } from './hub.js';
import { Store } from './store.js';
import { createPoller } from './poller.js';
import { ACTION, checkSensors, findNearby } from './actions.js';
import { GET_AIR_QUALITY, getAirQuality } from './scenes.js';
import { WIDGET_KEY, buildAirQualityContent } from './widgets.js';
import { TEXT } from './i18n.js';

const logger = createLogger({ name: 'sensor-community' });

/**
 * @param {object} gladys GladysIntegration, or the SDK's fake Gladys
 * @param {object} [options]
 * @param {{ load: Function, save: Function, flush?: Function }} [options.store]
 * @param {typeof fetch} [options.fetch]
 * @param {boolean} [options.timers] run the polling timer
 * @param {() => number} [options.now]
 */
export function registerHandlers(gladys, { store = new Store(), fetch, timers = true, now } = {}) {
  let config = normalizeConfig();
  const getConfig = () => config;
  const hub = new Hub({ gladys, getConfig, store, fetch, now });
  const ready = hub.load();
  let lastStatus = null;

  const poller = createPoller({ gladys, hub, getConfig, afterCycle, timers, now });

  /** Publish what the last reads changed: devices, /data, status, widget. */
  async function afterCycle() {
    if (hub.devicesChanged) {
      hub.devicesChanged = false;
      await publishDevices();
    }
    await hub.save();
    await updateStatus();
    if (hub.widgetChanged) {
      hub.widgetChanged = false;
      gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async function publishDevices() {
    await gladys.publishDiscoveredDevices(hub.buildDevices(config));
  }

  /** The status of the Configuration screen, sent when it changes. */
  async function updateStatus() {
    const units = hub.units(config);
    let status = { connected: true };
    if (units.length === 0) {
      status = { connected: false, message: TEXT.notConfigured };
    } else if (units.some((unit) => unit.kind === 'api') && hub.issues.isFailing('api')) {
      status = { connected: false, message: TEXT.apiUnreachable };
    } else if (units.every((unit) => unit.kind === 'local') && hub.issues.isFailing('local')) {
      status = { connected: false, message: TEXT.localUnreachable };
    }
    const key = JSON.stringify(status);
    if (key !== lastStatus) {
      lastStatus = key;
      await gladys.setConnectionStatus(status.connected, status.message);
    }
  }

  /** One info line describing the config (no address: a box URL may carry credentials). */
  function logConfig() {
    const parts = [`${config.sensorIds.length} public sensor(s)`];
    if (config.localUrl) {
      parts.push('a local airRohr box');
    }
    logger.info(`Reading ${parts.join(' and ')}, public API every ${config.refreshMinutes} min`);
    if (config.invalidSensorIds.length > 0) {
      logger.warn(`Ignored, not sensor ids: ${config.invalidSensorIds.join(', ')}`);
    }
    if (config.droppedSensorIds.length > 0) {
      logger.warn(`Too many sensors: ${config.droppedSensorIds.join(', ')} not read`);
    }
  }

  async function start() {
    await ready;
    hub.prune(config);
    // The devices known from /data first: the Discovery tab is complete even
    // before the first read, or while a sensor is offline.
    await publishDevices();
    await updateStatus();
    await poller.restart();
  }

  // --- Connection lifecycle ----------------------------------------------------
  // The SDK logs the WebSocket lifecycle itself.
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      logConfig();
      await start();
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    // Nothing reaches Gladys while it is away: the status is sent again on return.
    lastStatus = null;
  });

  gladys.onConfigUpdated(async (raw) => {
    logger.info('Configuration updated');
    config = normalizeConfig(raw);
    logConfig();
    await start();
  });

  // --- Discovery -----------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await ready;
    // A sensor never read yet is read now, so the list shows its measures.
    const unread = hub.units(config).filter((unit) => !hub.recordOf(unit, config));
    if (unread.length > 0) {
      await poller.refreshNow(unread);
    }
    await publishDevices();
  });

  // --- Polling: the timer's fallback --------------------------------------------
  gladys.onPoll((device) => poller.pollFromCore(device));

  // --- A device added (or updated) in Gladys: its states now ---------------------
  // The core dropped the states sent before the device existed, and the SDK
  // forgot them: send everything again (a read when the last one is older
  // than a minute), and nudge the widget, which can now show it.
  async function onDeviceAdded(device) {
    await ready;
    const record = hub.recordByDevice(device.external_id);
    if (!record) {
      return;
    }
    const unit = hub.unitOfRecord(record);
    await poller.refreshNow([unit], { maxAgeMs: 60_000 });
    await hub.publishStates(record, { force: true });
    gladys.requestWidgetRefresh(WIDGET_KEY);
  }
  gladys.onDeviceCreated(onDeviceAdded);
  gladys.onDeviceUpdated(onDeviceAdded);
  gladys.onDeviceDeleted(async () => {
    gladys.requestWidgetRefresh(WIDGET_KEY);
  });

  // --- Configuration screen buttons ---------------------------------------------
  gladys.onAction(ACTION.FIND_NEARBY, async (fields) => {
    logger.info('Action: search for nearby sensors');
    return findNearby(gladys, fields, config, { fetch });
  });

  gladys.onAction(ACTION.CHECK_SENSORS, async () => {
    logger.info('Action: check the sensors');
    await ready;
    return checkSensors(hub, poller, config);
  });

  // --- Scene action ---------------------------------------------------------------
  gladys.onSceneAction(GET_AIR_QUALITY, async (fields) => {
    await ready;
    return getAirQuality(hub, fields ?? {}, config.language);
  });

  // --- Dashboard widget -----------------------------------------------------------
  gladys.onWidgetGet(WIDGET_KEY, async ({ settings, language }) => {
    await ready;
    return buildAirQualityContent({ hub, gladys, settings, language });
  });

  return {
    hub,
    poller,
    ready,
    getConfig,
    /** Stop the timer and wait for the last write under /data. */
    async stop() {
      poller.stop();
      await store.flush?.();
    },
  };
}
