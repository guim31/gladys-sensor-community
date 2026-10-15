// -----------------------------------------------------------------------------
// Persistence under /data (the only writable path of the container): what the
// integration learnt about each sensor — its type, the measures it sends, its
// last reading. A restart then publishes the devices with all their features
// even while a sensor is offline, and the measurement age keeps counting.
// Losing the file is harmless: the next readings rebuild it.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createIssueLog } from './issues.js';

const logger = createLogger({ name: 'store' });
const FILE_NAME = 'sensors.json';

export class Store {
  constructor(directory = process.env.DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    this.pending = null;
    this.writing = null;
    this.latest = null;
    // A read-only or full /data fails every write: said once.
    this.issues = createIssueLog(logger);
  }

  /** @returns {Promise<object>} the saved document, {} when none */
  async load() {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${this.path}: ${err.message}`);
      }
      return {};
    }
  }

  /**
   * Save a document. Writes are coalesced and atomic (temporary file +
   * rename): a crash never leaves half a JSON file behind.
   * @param {object} data
   */
  save(data) {
    this.latest = data;
    if (!this.pending) {
      this.pending = (this.writing ?? Promise.resolve()).then(async () => {
        const snapshot = this.latest;
        this.pending = null;
        try {
          await mkdir(this.directory, { recursive: true });
          const temporary = `${this.path}.tmp`;
          await writeFile(temporary, JSON.stringify(snapshot));
          await rename(temporary, this.path);
          this.issues.ok('write', `${this.path} written again`);
        } catch (err) {
          this.issues.fail('write', `Cannot write ${this.path}: ${err.message}`);
        }
      });
      this.writing = this.pending;
    }
    return this.pending;
  }

  /** Resolves once every write requested so far is on disk. */
  flush() {
    return this.writing ?? Promise.resolve();
  }
}

/** A store that keeps everything in memory (tests, or no /data). */
export class MemoryStore {
  constructor(initial = {}) {
    this.data = structuredClone(initial);
  }

  async load() {
    return structuredClone(this.data);
  }

  async save(data) {
    this.data = structuredClone(data);
  }

  async flush() {}
}
