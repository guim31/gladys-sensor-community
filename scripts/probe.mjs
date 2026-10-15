#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Probe the real services with the integration's own clients, read only.
//
//   node scripts/probe.mjs 12345              one public sensor (its API id)
//   node scripts/probe.mjs 43.6047,1.4442     the sensors within 2 km of a point
//   node scripts/probe.mjs 43.6047,1.4442,5   ... within 5 km
//   node scripts/probe.mjs 192.0.2.20         an airRohr box on the local network
//
// No account and no secret: it prints what the integration would read, and
// the raw answer when PROBE_RAW=1. Nothing is written anywhere.
// -----------------------------------------------------------------------------

import { airQualityIndex } from '../src/measures.js';
import { fetchNearby, fetchSensor, USER_AGENT } from '../src/api.js';
import { fetchLocal, fetchNodeId } from '../src/local.js';
import { parseLocalAddress } from '../src/config.js';

const argument = process.argv[2];
if (!argument) {
  console.error('Usage: node scripts/probe.mjs <sensor id | lat,lon[,radius km] | box address>');
  process.exit(2);
}

const age = (measuredAt) =>
  measuredAt === null ? 'never' : `${Math.round((Date.now() - measuredAt) / 1000)} s ago`;

/** Wrap fetch to show the raw answers on demand. */
async function rawFetch(url, options) {
  const response = await fetch(url, options);
  if (process.env.PROBE_RAW === '1') {
    const text = await response.clone().text();
    console.log(`--- ${url} -> HTTP ${response.status}\n${text.slice(0, 4000)}\n---`);
  }
  return response;
}

const deps = { fetch: rawFetch };

try {
  if (/^\d+$/.test(argument)) {
    console.log(`User-Agent: ${USER_AGENT}`);
    const reading = await fetchSensor(argument, deps);
    if (!reading) {
      console.log(
        `Sensor #${argument}: no measurement in the last 5 minutes (offline, or unknown id)`,
      );
    } else {
      console.log(
        `Sensor #${argument}: ${reading.sensorType}, measured ${age(reading.measuredAt)}`,
      );
      console.log('Values:', reading.values);
      console.log('European index:', airQualityIndex(reading.values));
      console.log('Location:', reading.location);
    }
  } else if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?(,\d+(\.\d+)?)?$/.test(argument)) {
    const [latitude, longitude, radius = 2] = argument.split(',').map(Number);
    const found = await fetchNearby({ latitude, longitude }, radius, deps);
    console.log(`${found.length} sensor(s) within ${radius} km:`);
    for (const sensor of found) {
      console.log(
        `  #${sensor.id} ${sensor.sensorType} ${sensor.distanceKm.toFixed(2)} km` +
          `${sensor.location.indoor ? ' indoor' : ''} ${JSON.stringify(sensor.values)}`,
      );
    }
  } else {
    const base = parseLocalAddress(argument);
    if (!base) {
      throw new Error('not a sensor id, a point or an address');
    }
    console.log(`Box ${base}: chip id ${await fetchNodeId(base, deps)}`);
    const reading = await fetchLocal(base, deps);
    console.log(`Firmware ${reading.software}, measured ${age(reading.measuredAt)}`);
    for (const feature of reading.features) {
      console.log(`  ${feature.key} (${feature.label}): ${reading.values[feature.key]}`);
    }
  }
} catch (err) {
  console.error(`Probe failed: ${err.message}`);
  process.exit(1);
}
