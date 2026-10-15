// -----------------------------------------------------------------------------
// The container's own polling timer.
//
// The devices are published with `should_poll: true` and a valid
// `poll_frequency`, but the core cannot be trusted to call onPoll: Gladys
// 5.2.x skips devices created without `should_poll`, and a device keeps the
// polling fields it was created with (GladysAssistant/Gladys#3198). So the
// container reads the sensors by itself, and the core's onPoll is a fallback.
//
// Paces: the public API every `refresh_minutes` (5 minutes at least, the pace
// of its data), the local box every minute. One timer ticks every minute and
// reads the units that are due; a unit read less than 90 % of its period ago
// is skipped, whoever asks (timer or core), so the core's minute polls never
// add a request to the API while the timer runs.
//
// What is read: the units whose device the user added to Gladys, and the
// units that never measured yet (their first measurement tells what the
// device measures, for the Discovery tab). The public sensors are read one after the other:
// a community API, no burst.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { apiPeriodMs, LOCAL_PERIOD_MS } from './config.js';

const logger = createLogger({ name: 'poller' });

/** The timer's tick. */
export const TICK_MS = 60_000;

/** A unit read less than this share of its period ago is not read again. */
const MIN_GAP = 0.9;

/**
 * @param {object} options
 * @param {object} options.gladys
 * @param {import('./hub.js').Hub} options.hub
 * @param {() => object} options.getConfig
 * @param {() => Promise<void>} options.afterCycle publishes what the reads changed
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 * @param {() => number} [options.now]
 */
export function createPoller({
  gladys,
  hub,
  getConfig,
  afterCycle = async () => {},
  timers = true,
  now = () => Date.now(),
}) {
  /** When each unit was last read (start of the read), by unit key. */
  const lastReadAt = new Map();
  /** Reads in progress, by unit key: a second caller waits for the same one. */
  const inFlight = new Map();
  let timer = null;
  let stopped = true;

  const periodOf = (unit) => (unit.kind === 'api' ? apiPeriodMs(getConfig()) : LOCAL_PERIOD_MS);

  /** The units to read now: added to Gladys, or not known enough to be listed yet. */
  function wantedUnits(config) {
    return hub.units(config).filter((unit) => {
      const record = hub.recordOf(unit, config);
      return !record || record.features.length === 0 || hub.isCreated(record);
    });
  }

  /**
   * Read one unit, unless it was read less than MIN_GAP of its period ago
   * (force: read anyway, after the read in progress if any).
   * @returns {Promise<boolean>} true when the unit was read
   */
  async function readUnit(unit, { force = false } = {}) {
    let running = inFlight.get(unit.key);
    while (running && force) {
      await running.catch(() => {});
      running = inFlight.get(unit.key);
    }
    if (running) {
      await running.catch(() => {});
      return false;
    }
    const last = lastReadAt.get(unit.key);
    if (!force && last !== undefined && now() - last < periodOf(unit) * MIN_GAP) {
      logger.debug(`${unit.key}: read ${Math.round((now() - last) / 1000)} s ago, skipped`);
      return false;
    }
    lastReadAt.set(unit.key, now());
    const run = hub.refresh(unit);
    inFlight.set(unit.key, run);
    try {
      await run;
      return true;
    } catch (err) {
      // Logged once by the hub's issue log; the next read retries.
      logger.debug(`${unit.key}: ${err.message}`);
      return true;
    } finally {
      inFlight.delete(unit.key);
    }
  }

  /** One cycle: the wanted units, the public sensors in sequence. */
  async function cycle({ force = false, units } = {}) {
    if (gladys.connected === false) {
      logger.debug('Gladys unreachable: cycle skipped');
      return;
    }
    const config = getConfig();
    const list = units ?? wantedUnits(config);
    const local = list.filter((unit) => unit.kind === 'local');
    const api = list.filter((unit) => unit.kind === 'api');
    await Promise.all([
      ...local.map((unit) => readUnit(unit, { force })),
      (async () => {
        for (const unit of api) {
          await readUnit(unit, { force });
        }
      })(),
    ]);
    await afterCycle();
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await cycle();
      } catch (err) {
        logger.error(`Polling cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, TICK_MS);
  }

  return {
    /** (Re)start: read every wanted unit now, then on the timer. */
    async restart() {
      stopped = false;
      schedule();
      await cycle({ force: true });
    },

    /** One timer cycle (tests). */
    cycle,

    /**
     * The core's onPoll (fallback): read the device's unit unless it was
     * read recently.
     * @param {{ external_id: string }} device
     */
    async pollFromCore(device) {
      const record = hub.recordByDevice(device.external_id);
      const unit = record && hub.unitOfRecord(record);
      if (!unit) {
        logger.debug(`onPoll ignored (not a configured sensor): ${device.external_id}`);
        return;
      }
      if (await readUnit(unit)) {
        await afterCycle();
      }
    },

    /**
     * Read some units now (a device just added, the check action), unless
     * they were read less than `maxAgeMs` ago.
     */
    async refreshNow(units, { maxAgeMs = 0 } = {}) {
      const due = units.filter((unit) => {
        const last = lastReadAt.get(unit.key);
        return last === undefined || now() - last >= maxAgeMs;
      });
      await cycle({ force: true, units: due });
    },

    /** When a unit was last read, undefined if never. */
    lastReadAt: (key) => lastReadAt.get(key),

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
