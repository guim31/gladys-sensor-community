# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **No secret.** The public data API of Sensor.Community needs no account nor
  key, and the pages of an airRohr box it reads (`/data.json`, `/metrics`) need
  no password. Credentials typed in the box address are dropped before use and
  never logged.
- **`/data`** holds `sensors.json`: the type, measures, last reading and
  approximate public location of each configured sensor, and the chip id of
  the local box. No personal data beyond what the public map already shows.
- **The house location** (Gladys `location` authorization) is read only when
  the user clicks "Find sensors near a house", to build the search box sent to
  the public API; it is never stored nor logged.
- **Network**: HTTPS requests to `data.sensor.community`, and HTTP requests to
  the address of the local box the user typed. Nothing listens.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Sensor.Community services and the airRohr firmware.
