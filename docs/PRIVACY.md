# GhostPrint Privacy Policy (MVP)

**Last updated:** 2026-09-28

## Summary

GhostPrint processes tracker observations locally in the browser. During Phase 1 and
Phase 2, GhostPrint does not transmit browsing data, tracker data, analytics, crash
reports, or identifiers to GhostPrint or any other server.

## What GhostPrint observes

To show the current-page counter, the extension observes outbound HTTP(S) requests made
by browser tabs. It uses the request target and initiator only long enough to determine
whether the request is third-party and whether its hostname matches the bundled tracker
dictionary.

GhostPrint does **not** read page text, form values, cookies, browsing history, bookmarks,
passwords, downloads, or account information. It does not inject into subframes.

## What is stored

### Temporary per-tab state

`chrome.storage.session` stores a ledger for each open tab until the tab is closed or the
browser session ends. Each ledger contains:

- the first-party registrable domain;
- third-party tracker domains observed on that page;
- corporate-parent and category labels from the bundled dictionary;
- request counts, first-seen timestamps, and a request-cap flag.

Full URLs, query strings, paths, request bodies, headers, IP addresses, and page content
are not stored.

### Local aggregate history

`chrome.storage.local` stores at most 90 days of per-day aggregates:

`{ date, tracker domain, corporate parent, category, count }`

The history does not preserve which first-party site caused an observation. It contains no
full URLs, titles, visit times, identifiers, or browsing sequence. The popup uses this
aggregate to show the local seven-day summary.

### Settings

Settings include whether detection and the counter are enabled, muted origins, and an
optional per-origin widget anchor. These remain on the device.

## Data deletion

The **Clear data** action deletes local history, session ledgers, settings, and muted
origins, then restores the default settings. The action requires confirmation. Closing a
tab removes its temporary ledger automatically. Aggregate history older than 90 days is
removed by a local daily alarm.

## Network and telemetry

The shipped extension has no network primitives. CI scans the built `dist/` directory for
`fetch`, XHR, `sendBeacon`, WebSocket, EventSource, and `importScripts`. Build-time tooling
may download an upstream filter list, but that tooling is not included in the extension.

There is no telemetry, account system, remote configuration, or crash-reporting endpoint
in the MVP. Any future network feature must be separately opt-in, documented, and gated
by a new privacy review and threat-model update.

## Third-party data

The tracker dictionary includes hostnames derived from EasyPrivacy under CC BY-SA 3.0,
with attribution recorded in [LICENSES.md](LICENSES.md). The dictionary is bundled with
the extension and is not updated from the network at runtime.

## Contact

The public contact address and effective policy URL will be added before Chrome Web Store
submission. This local policy is the implementation contract for the MVP and must match
that hosted policy exactly.
