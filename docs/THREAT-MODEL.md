# GhostPrint MVP Threat Model

**Status:** MVP review complete · 2026-09-28
**Scope:** Manifest V3 extension through Phase 1, including the content script,
service worker, popup, options page, local storage, bundled dictionary, and build output.

## Security boundaries

| Boundary | Trust level | Rule |
|---|---|---|
| Host web page | Untrusted | Content script must not accept page-supplied commands or render page strings as HTML. |
| Content script | Extension-controlled but exposed to a hostile page | Use a closed Shadow DOM, no `window.postMessage`, and validate every runtime message. |
| Service worker | Extension-controlled | Owns classification, ledgers, storage, and the only privileged request listener. |
| Popup/options pages | Extension-controlled | Request only typed data from the service worker; render with `textContent`. |
| Bundled tracker data | Build-time input | Validate schema, entity references, categories, and bundle size before shipping. |
| Network | Disabled at runtime | CI must reject network primitives from `dist/`. |

## Abuse cases and controls

### A hostile page attempts to control the extension

**Threat:** A page calls `window.postMessage`, modifies globals, or sends malformed
runtime messages to make GhostPrint reveal data or change settings.

**Controls:**

- No page-message bridge exists in the MVP.
- Content scripts do not register `window` message listeners.
- The service-worker router accepts only the five known discriminated request types.
- Settings mutations are only available through the extension options page and its typed
  runtime request.
- Page-derived values are rendered with `textContent`; no `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, `document.write`, or dynamic code execution.

**Verification:** `npm run lint`, `npm run check:egress`, and the source audit below.

### A tracker or page attempts to read the Ghost Counter

**Threat:** Host CSS, JavaScript, or DOM traversal reads tracker details or changes the
widget's behavior.

**Controls:**

- Widget uses `attachShadow({ mode: 'closed' })`.
- Host element contains no tracker data or child DOM; all UI state lives inside the
  closed root.
- Host styles are explicitly forced and the widget is not inserted into page content.
- The widget uses `pointer-events` only for its own controls and relocates around fixed or
  sticky page elements.

**Verification:** `tests/e2e/widget.spec.ts` asserts the closed root, empty host DOM,
viewport bounds, fixed-CTA click-through, and no GhostPrint console errors.

### Runtime data leaves the device

**Threat:** A dependency, accidental API call, or future refactor exfiltrates browsing
activity.

**Controls:**

- No runtime network API is used in extension code.
- `tools/check-egress.mjs` scans JavaScript and HTML in `dist/` for network primitives.
- The CI workflow runs the egress check after every build.
- Tracker-list downloads are limited to build-time tooling and never ship in `dist/`.

**Verification:** `npm run check:egress` must pass on every build.

### Stored data is retained or exposed longer than intended

**Threat:** Per-tab or aggregate data remains after its intended lifetime, or Clear data
leaves a copy behind.

**Controls:**

- Tab ledgers are deleted on tab removal and non-HTTP navigation.
- Aggregate history is capped at 90 days by a daily local alarm.
- Clear data clears both `chrome.storage.local` and `chrome.storage.session`, then writes
  only the default settings.
- History intentionally omits first-party site, full URL, path, query, title, and visit
  sequence.

**Verification:** `tests/e2e/tracking.spec.ts`, `tests/e2e/sw-lifecycle.spec.ts`, and
`tests/e2e/popup.spec.ts` cover tab cleanup, worker rehydration, retention-facing storage,
and deletion.

### A malformed dictionary corrupts attribution

**Threat:** A generated artifact maps a host to an unknown entity, invalid category, or a
shared CDN apex, causing false attribution or a precision collapse.

**Controls:**

- Build validates entity IDs, registrable seed domains, duplicate ownership, and category
  codes.
- Runtime classifier matches specific hostnames and never widens a host rule to a shared
  eTLD+1 apex.
- Unit tests assert entity completeness, valid categories, bundle size, and shared-CDN
  exclusions.

**Verification:** `tests/unit/classifier.test.ts` and `npm run build-tracker-db`.

## Source audit checklist

- [x] No `window.postMessage` listener or page-to-extension bridge.
- [x] No runtime `fetch`, XHR, `sendBeacon`, WebSocket, EventSource, or `importScripts`.
- [x] No HTML injection sinks in extension source.
- [x] No raw URL, request body, header, or page content in local history.
- [x] Unknown trackers remain explicitly unknown; no guessed corporate attribution.
- [x] Clear data covers both storage areas and restores defaults.
- [x] Service-worker termination has an end-to-end rehydration test.
- [x] CI runs typecheck, lint, unit tests, build, egress check, and e2e tests.

## Residual risk

- `webRequest` and `<all_urls>` are powerful permissions and will receive Chrome Web Store
  scrutiny; justifications are recorded in [PERMISSIONS.md](PERMISSIONS.md).
- Live-site performance, recall, and the 20-site compatibility sweep remain pending a
  Chromium environment with network access (`P1-01b`, `P1-06`, and the live portion of
  `P1-07`).
- Phase 2 DOM instrumentation is a new trust boundary and requires a separate threat-model
  update before implementation.
- Phase 3 telemetry, marketplace, and buyer integrations are out of scope and must not be
  enabled by merely adding a dependency or endpoint.
