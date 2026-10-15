# Test fixtures

- `gladys-feature-table.json`: the category/type couples, units and poll
  frequencies of the Gladys core (generated from its code). Used by
  `test/gladys-rules.test.js`.
- `api/*.json`: answers of the public data API
  (`/airrohr/v1/sensor/<id>/`, `/airrohr/v1/filter/box=...`), in its exact
  format (see the API documentation of Sensor.Community). `dht22.json` is the
  answer of the tests of
  [`python-luftdaten`](https://github.com/home-assistant-ecosystem/python-luftdaten)
  (MIT). The other ones are written after the documented format and the value
  types of the firmware. Sensor ids, measurement ids and locations are
  invented; the coordinates are public places.
- `local/data.json`, `local/metrics.txt`: the `/data.json` and `/metrics`
  pages of an airRohr box with an SDS011, a BME280 and a DHT22, after the
  firmware code (`webserver_data_json`, `webserver_metrics_endpoint`). The
  chip id is invented.
- `local/data-starting.json`: the same box before its first measurement
  (negative `age`, no value).

The session that wrote this integration had no access to the real API:
`node scripts/probe.mjs` reads the real services, to compare.
