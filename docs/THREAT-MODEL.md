# GhostPrint MVP Threat Model

**Status:** Phase 2 probe review in progress · 2026-09-29
**Scope:** Manifest V3 extension through `P2-01`, including the MAIN-world probe,
isolated content script, service worker, popup, options page, local storage, bundled
dictionary, and build output.

## Security boundaries

| Boundary | Trust level | Rule |
|---|---|---|
| Host web page | Untrusted | Probe messages are untrusted observations; validate source, origin, nonce, shape, and classifier result. Never treat them as commands. |
| MAIN-world probe | Page-visible and detectable | Wrap only allow-listed APIs; do not read arguments or event values; cap observations; restore wrappers on stop. |
| Isolated content script | Extension-controlled but exposed to a hostile page | Validate the page-message bridge and every runtime message; render page-derived strings with `textContent`. |
| Service worker | Extension-controlled | Owns classification, ledgers, storage, and the only privileged request listener. |
| Popup/options pages | Extension-controlled | Request only typed data from the service worker; render with `textContent`. |
| Bundled tracker data | Build-time input | Validate schema, entity references, categories, and bundle size before shipping. |
| Network | Disabled at runtime | CI must reject network primitives from `dist/`. |

## Abuse cases and controls

### A hostile page attempts to forge probe observations

**Threat:** A page observes or forges the `window.postMessage` bridge, modifies globals,
or sends malformed runtime messages to influence probe-driven behavior.

**Controls:**

- The isolated receiver checks `event.source === window`, exact origin, a random nonce,
  allow-listed API names, bounded selectors and hostnames, and finite timestamps.
- The nonce is visible to page scripts and is **not** an authenticity secret. A hostile
  page can forge a syntactically valid observation; therefore observations are
  informational only and cannot invoke privileged actions or persist data.
- The MAIN-world probe sends only hostnames, not full script URLs, and never reads event
  contents, form values, API arguments, or request bodies.
- Wrappers are capped at 64 observations and restored when probing stops. They preserve
  native call arguments/results and are tested for native-like name, arity, and
  `toString()` output; MAIN-world modification remains detectable by a sufficiently
  determined page.
- The particle canvas is in the closed root, always uses `pointer-events: none`, caps at
  four effects/60 particles, pauses while hidden, and disables under reduced-motion
  preference. Disabling the overlay clears effects and cancels its RAF loop.
- The service-worker router accepts only known discriminated request types.
- Settings mutations are only available through the extension options page and its typed
  runtime request.
- Page-derived values are rendered with `textContent`; no `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, `document.write`, or dynamic code execution.

**Verification:** probe parser unit tests, the sandbox MAIN-world probe e2e, `npm run lint`,
and `npm run check:egress`.

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
- `tools/check-egress.mjs` scans JavaScript and HTML in `dist/` for runtime network calls.
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

- [x] Probe bridge validates source, origin, nonce, shape, and third-party classification; forged observations cannot invoke privileged actions.
- [x] No outbound network calls; the MAIN-world probe only wraps page-owned network APIs.
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
- The Phase 2 probe's ≤ 3 ms overhead and 30-site no-breakage gates remain unmeasured; the
  sandbox regression is not representative compatibility evidence.
- The particle overlay's ≤ 2% sustained CPU gate remains unmeasured on a mid-tier laptop;
  functional click-through coverage does not establish a CPU percentage.
- Phase 3 telemetry, marketplace, and buyer integrations are out of scope and must not be
  enabled by merely adding a dependency or endpoint.
