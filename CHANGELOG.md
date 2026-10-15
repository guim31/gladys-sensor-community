# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- Public Sensor.Community sensors, read by their id through the public data
  API (no account): one device per sensor, with the measures it sends —
  PM2.5, PM10, PM1, temperature, humidity, pressure and sea-level pressure,
  noise (DNMS), CO2 (SCD30).
- Your own airRohr box, read on your network every minute: one device with
  every sensor of the box, named after its chip id.
- "Find sensors near a house" button: the sensors around the location of a
  Gladys house, with their distance, type and measures.
- "Check the sensors" button: what each configured sensor answers right now.
- The European Air Quality Index (EEA, revised 2024) of every particle
  sensor, and the age of the last measurement: past 15 minutes, a sensor is
  flagged as silent and its stale values are not sent again.
- "Air quality" dashboard widget, scene trigger "Air quality changed" and
  scene action "Get the air quality".
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-sensor-community/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-sensor-community/releases/tag/v1.0.1
