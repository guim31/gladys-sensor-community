# Sensor.Community for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that
brings the air quality, noise and weather of the citizen sensors of
[Sensor.Community](https://sensor.community) (formerly Luftdaten) into Gladys:
your own airRohr box, or the public sensors around your home.

> **Developed without the hardware: feedback welcome.** The integration was
> written and tested against recorded answers of the public API and of the
> airRohr firmware, not against a real box nor a live Gladys. Tell us on the
> Gladys forum how it behaves with yours.

This integration is **not affiliated with Sensor.Community**.

## What it does

- **Public sensors** by their API id (the number on the
  [map](https://maps.sensor.community)), through the public data API: no
  account, no key. A **Find sensors near a house** button lists the sensors
  around the location of a Gladys house, with their distance and measures.
- **Your own airRohr box**, read on your network every minute (`/data.json`),
  for live values (optional).
- **One device per sensor** (and one for the box): PM2.5, PM10, PM1,
  temperature, humidity, pressure (and sea-level pressure), noise (DNMS), CO2
  (SCD30), depending on what the sensor measures — learnt from its data.
- The **European Air Quality Index** (EEA, revised 2024) computed from PM2.5
  and PM10, and the **age of the measurement**: a silent sensor is flagged,
  its stale values are not sent again.
- An **Air quality** dashboard widget (level colored by its European band,
  live tiles), a scene trigger **Air quality changed** (confirmed on two
  readings) and a scene action **Get the air quality** (worst sensor, sentence
  ready for a notification).

Read only: nothing is ever written to a sensor.

The user documentation, in [English](docs/en.md), [French](docs/fr.md),
[German](docs/de.md) and [Spanish](docs/es.md), is re-hosted by Gladys behind
the **Documentation** link of the Configuration screen.

## Requirements

- Gladys Assistant **5.2.0** or later (the nearby search uses the house picker
  of 5.2.0; the widget and the scene cards need 5.1).
- Internet access for the public sensors.
- For your own box: an airRohr (Sensor.Community firmware, 2020 or later for a
  stable identity) with a fixed IP address on the network of Gladys.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-sensor-community`. Then fill the
Configuration tab: see [the documentation](docs/en.md#configuration).

## Respect of the API

The public API is a community service. The integration:

- reads a sensor **every 5 minutes at most** (the pace of the data; 10, 15 or
  30 minutes on request), 20 sensors at most, one request after the other;
- reads only the sensors whose device was added to Gladys (and, once, the
  ones it does not know yet, to list them in the Discovery tab);
- sends a `User-Agent` naming the integration and this repository, as the
  operators ask;
- uses the `box` filter for the nearby search, as the API documentation
  recommends over `area`.

## Limits

- Citizen sensors, not reference stations: low-cost dust sensors over-read in
  humid air. The European index computed on 5 minutes of such a sensor is an
  indication, not the official index.
- Gladys has no PM1 nor PM4 category: PM1 is published as a PM2.5-type
  feature named "PM1", PM4 and the particle counts are left out.
- A box with a firmware older than 2020 has no `/metrics` page: its device is
  then named after its address.

## Development

```bash
npm install
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test, against the SDK's fake Gladys
node scripts/probe.mjs 12345            # read a real public sensor (read only)
node scripts/probe.mjs 43.6047,1.4442   # the sensors within 2 km of a point
node scripts/probe.mjs 192.0.2.20       # an airRohr box on your network
```

The tests never touch the network: they run on the recorded answers of
`test/fixtures` (see its README). The architecture and the rules of the
project are in [`CLAUDE.md`](CLAUDE.md).

## Credits

- [Sensor.Community](https://sensor.community) (OK Lab Stuttgart) for the
  network, the [data API](https://github.com/opendata-stuttgart/meta/wiki/EN-APIs)
  and the airRohr firmware (read to understand `/data.json` and `/metrics`,
  nothing copied: GPL-3.0).
- [`python-luftdaten`](https://github.com/home-assistant-ecosystem/python-luftdaten)
  by Fabian Affolter (MIT) and the Home Assistant
  [`luftdaten` integration](https://www.home-assistant.io/integrations/luftdaten/)
  (Apache-2.0): the API usage, and the DHT22 answer of their tests reused as a
  fixture.
- The European Environment Agency for the
  [European Air Quality Index](https://airindex.eea.europa.eu).
- Built from the official
  [JavaScript template](https://github.com/GladysAssistant/integration-template-js)
  and SDK [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

## License

[Apache-2.0](LICENSE)
