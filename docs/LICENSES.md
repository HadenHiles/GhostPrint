# Third-party licenses and attribution

## Bundled data

### EasyPrivacy

`src/data/trackers.json` includes hostnames derived from the EasyPrivacy filter list.

- Source: <https://easylist.to/easylist/easyprivacy.txt>
- Attribution: **The EasyList authors (<https://easylist.to/>)**
- License: dual-licensed GPL-3.0-or-later **or** CC BY-SA 3.0.
  GhostPrint uses it under **CC BY-SA 3.0**, which permits commercial use with
  attribution and ShareAlike.
- Scope: the derived hostname list is ShareAlike. GhostPrint's source code is not a
  derivative work of the list and is unaffected.
- License text: <https://easylist.to/pages/licence.html>

### GhostPrint entity map

`tools/data/entities.seed.json` — corporate-parent and category attribution. Authored by
GhostPrint from public corporate disclosures. Not derived from any third-party dataset.

## Datasets deliberately NOT used

These are the widely used alternatives. All are **CC BY-NC-SA 4.0** (NonCommercial), which
is incompatible with GhostPrint's roadmap. See `docs/ADR-002-tracker-data-source.md`.

| Dataset | License |
|---|---|
| DuckDuckGo Tracker Radar | CC BY-NC-SA 4.0 |
| Ghostery `trackerdb` | CC BY-NC-SA 4.0 |
| Disconnect tracking-protection | CC BY-NC-SA 4.0 |

DuckDuckGo invites commercial licensing enquiries; if a commercial license is obtained,
add a Tracker Radar adapter under `tools/sources/` and record it here.

## Runtime dependencies

| Package | License | Use |
|---|---|---|
| `tldts` | MIT | Public Suffix List parsing for eTLD+1 resolution |
