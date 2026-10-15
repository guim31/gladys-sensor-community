import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EAQI_LEVELS,
  airQualityIndex,
  apiMeasure,
  localMeasure,
  pollutantLevel,
  toValue,
} from '../src/measures.js';

test('public API value types: P1 is PM10, P2 is PM2.5, P0 is PM1', () => {
  assert.equal(apiMeasure('P1'), 'pm10');
  assert.equal(apiMeasure('P2'), 'pm25');
  assert.equal(apiMeasure('P0'), 'pm1');
  assert.equal(apiMeasure('pressure_at_sealevel'), 'pressure_sealevel');
  assert.equal(apiMeasure('noise_LAeq'), 'noise_laeq');
  // PM4 and the particle counts have no Gladys category.
  assert.equal(apiMeasure('P4'), null);
  assert.equal(apiMeasure('N25'), null);
});

test('local value types carry the sensor family', () => {
  assert.deepEqual(localMeasure('SDS_P2'), { family: 'sds', label: 'SDS011', measure: 'pm25' });
  assert.deepEqual(localMeasure('BME280_pressure'), {
    family: 'bme280',
    label: 'BME280',
    measure: 'pressure',
  });
  assert.deepEqual(localMeasure('temperature'), {
    family: 'dht',
    label: 'DHT22',
    measure: 'temperature',
  });
  assert.deepEqual(localMeasure('DNMS_noise_LAeq'), {
    family: 'dnms',
    label: 'DNMS',
    measure: 'noise_laeq',
  });
  assert.deepEqual(localMeasure('SCD30_co2_ppm'), {
    family: 'scd30',
    label: 'SCD30',
    measure: 'co2',
  });
  for (const ignored of [
    'signal',
    'samples',
    'min_micro',
    'interval',
    'GPS_lat',
    'SPS30_P4',
    'IPS_P01',
  ]) {
    assert.equal(localMeasure(ignored), null, ignored);
  }
});

test('values: pressures in pascals become hectopascals, decimals are rounded', () => {
  assert.equal(toValue('pressure', '99821.47'), 998.2);
  assert.equal(toValue('pressure', '998.2'), 998.2, 'already in hPa');
  assert.equal(toValue('pm25', '9.234'), 9.2);
  assert.equal(toValue('noise_laeq', '52.47'), 52);
  assert.equal(toValue('pm25', ''), null);
  assert.equal(toValue('pm25', 'nan'), null);
  assert.equal(toValue('unknown', '1'), null);
});

test('European index bands (EEA 2024): upper bounds belong to their level', () => {
  const cases = [
    ['pm25', 5, 1],
    ['pm25', 5.1, 2],
    ['pm25', 15, 2],
    ['pm25', 50, 3],
    ['pm25', 90, 4],
    ['pm25', 140, 5],
    ['pm25', 140.1, 6],
    ['pm10', 15, 1],
    ['pm10', 45, 2],
    ['pm10', 120, 3],
    ['pm10', 195, 4],
    ['pm10', 270, 5],
    ['pm10', 400, 6],
  ];
  for (const [pollutant, value, level] of cases) {
    assert.equal(pollutantLevel(pollutant, value), level, `${pollutant} ${value}`);
  }
});

test('the index is the worst pollutant, null without PM', () => {
  assert.deepEqual(airQualityIndex({ pm25: 9, pm10: 18 }), {
    level: 2,
    pollutant: 'pm25',
    key: 'fair',
  });
  assert.deepEqual(airQualityIndex({ pm25: 4, pm10: 130 }), {
    level: 4,
    pollutant: 'pm10',
    key: 'poor',
  });
  assert.deepEqual(airQualityIndex({ pm10: 10 }), { level: 1, pollutant: 'pm10', key: 'good' });
  assert.equal(airQualityIndex({ temperature: 20 }), null);
  assert.equal(EAQI_LEVELS.length, 6);
});
