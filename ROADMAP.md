# GhostPrint — Engineering Roadmap

> **Product:** GhostPrint — "See who is watching you watch the web."
> **Form factor:** Chrome/Edge Manifest V3 extension (Firefox MV3 port deferred to V1).
> **Working doc:** This file is the single source of truth for "pick up where you left off."
> Every task has an ID, dependencies, concrete steps, and a binary success criterion.

---

## 0. How to use this document

- Task IDs are stable (`P1-01`, `P2-03`, …). Never renumber; mark obsolete tasks `[dropped]`.
- Status markers: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked.
- A trailing `*` means implementation is complete but one or more acceptance or release gates were not verified; it does not claim the gates passed.
- Each task lists **Deps**, **Steps**, **Done when**. Do not start a task with unmet deps.
- Update the **Current Status** block below at the end of every working session.

### Current Status

| Field | Value |
|---|---|
| Phase | Phase 2 — V1 Public Launch |
| Active task | P2-06 telemetry sink and consent review |
| Last updated | 2026-09-30 |
| Blockers | P2-06 Worker deployment, extension-origin allow-list, Cloudflare rate limit, and counsel approval remain; Phase 1/P2-03 release gates remain unverified |
| Next up | Deploy/configure P2-06 and obtain counsel review; then verify P2-06 and remaining Phase 1/P2-03 release gates |

**Phase 0 complete.** Toolchain, MV3 skeleton, and domain primitives verified.
**`P1-01`/`P1-02` complete** with a documented scope reduction — see
[docs/ADR-002-tracker-data-source.md](docs/ADR-002-tracker-data-source.md). The shipped
dictionary is now 477 hostname entries (69 entities, 213 intentionally unattributed
Unknown entries) and remains within the bundle budget. Recall depends on the labeled
corpus.
**`P1-03` complete.** Ledger rehydrates after a CDP-forced service-worker termination.
**`P1-04` complete.** Closed Shadow DOM counter with corner-collision avoidance.
**`P1-05` complete.** 141 unit tests, 30 e2e specs, all green across repeated runs.
**`P1-08` complete.** Privacy policy, threat model, source/manifest audit, and bundled
egress audit are committed and green.
**`P1-06` measured.** 47/50 sites completed; 29 exceeded the 5% per-site threshold,
three navigation failures occurred, and the worst measured degradation was 259.44%.
**`P1-07` evaluator complete.** Offline replay and reporting work against synthetic
fixtures; the representative 15-site e-commerce corpus remains pending on `P1-01b`.
**Phase 1 implementation complete.** Live evidence is collected; performance remediation
and manual labeling remain before the exit gate can pass.
**Sandbox validation complete.** A local server and six e2e scenarios model social-feed,
checkout, hostile-CSS, SPA, iframe, and CSP behavior without depending on anti-bot-prone
production sites. See [tools/sandbox-server.mjs](tools/sandbox-server.mjs) and
[tests/e2e/sandbox.spec.ts](tests/e2e/sandbox.spec.ts).

---

## 1. Target architecture (read before writing code)

```
ghostprint/
├── manifest.json                  # MV3
├── src/
│   ├── background/                # service worker (MV3)
│   │   ├── index.ts               # SW entry, lifecycle, alarms
│   │   ├── request-monitor.ts     # webRequest(onBeforeRequest) observer
│   │   ├── dnr-rules.ts           # declarativeNetRequest rule mgmt (blocking/rulesets)
│   │   ├── tab-state.ts           # per-tabId tracker ledger (in-memory + session storage)
│   │   ├── classifier.ts          # domain → entity + category resolution
│   │   └── messaging.ts           # typed port/message router
│   ├── content/
│   │   ├── index.ts               # content script entry (document_start)
│   │   ├── ghost-counter/         # Shadow DOM floating dashboard
│   │   ├── overlay/               # Phase 2: particle overlay + x-ray
│   │   └── probes/                # Phase 2: DOM instrumentation probes
│   ├── popup/                     # extension popup UI
│   ├── options/                   # settings page
│   ├── shared/
│   │   ├── types.ts               # shared TS types (single definition, no dupes)
│   │   ├── domain.ts              # eTLD+1 parsing via bundled PSL
│   │   ├── storage.ts             # chrome.storage wrappers w/ schema versioning
│   │   └── telemetry.ts           # local-only counters (no network by default)
│   └── data/
│       ├── trackers.json          # generated tracker dictionary (build artifact)
│       └── entities.json          # corporate parent metadata
├── tools/
│   └── build-tracker-db.ts        # generates src/data/*.json from upstream sources
├── tests/
│   ├── unit/                      # vitest
│   └── e2e/                       # playwright w/ persistent context + extension
└── docs/
    ├── ROADMAP.md (this file, root)
    └── PRIVACY.md
```

**Non-negotiable engineering constraints**

1. **Zero network egress in Phase 1 and Phase 2 by default.** The extension must function fully offline. Any future egress requires an explicit opt-in gate (Phase 3).
2. **No raw URLs ever leave the device.** Only eTLD+1 of *third-party* domains are retained, and only locally.
3. **Content script budget:** ≤ 15 ms of main-thread work per page load, ≤ 150 KB gzipped injected bundle.
4. **Service worker is ephemeral.** Never hold state only in SW memory; mirror to `chrome.storage.session` on every mutation batch (debounced ≤ 250 ms).
5. **Shadow DOM is closed-mode** and all styles are inlined into the shadow root. Never touch the host page's global CSS, `document.body` styles, or z-index stacking beyond a single fixed container.
6. **TypeScript strict mode**, no `any` in `shared/`.

---

## Phase 0 — Foundations (prerequisite to MVP)

*Not in the original roadmap but required; without this the MVP tasks have nowhere to land.*

### `P0-01` Repository & toolchain bootstrap — **`[x]` done**
**Deps:** none
**Outcome:** plain Vite, two build passes, no extension plugin. See
[docs/ADR-001-build-tooling.md](docs/ADR-001-build-tooling.md).
**Steps**
1. `npm init`; add TypeScript 5.x, Vite + `@crxjs/vite-plugin` (or `wxt` — pick one and record the decision in `docs/ADR-001-build-tooling.md`).
2. Configure `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, path alias `@/* → src/*`.
3. Add ESLint (flat config) + Prettier; add `eslint-plugin-security` and the `no-restricted-globals` rule banning `eval`, `Function`, `innerHTML` assignment outside sanitized helpers.
4. Add Vitest for unit tests, Playwright for e2e.
5. Add `.github/workflows/ci.yml`: install → typecheck → lint → unit test → build → upload `dist/` artifact.
6. Add `.gitignore`, `LICENSE`, `README.md` stub.

**Done when:** `npm run build` emits a `dist/` folder that loads via `chrome://extensions → Load unpacked` with zero console errors, and CI is green on `main`.

---

### `P0-02` Manifest V3 skeleton — **`[x]` done**
**Deps:** `P0-01`
**Outcome:** permission justifications written up front in
[docs/PERMISSIONS.md](docs/PERMISSIONS.md). Round trip verified by
[tests/e2e/smoke.spec.ts](tests/e2e/smoke.spec.ts).
**Steps**
1. Author `manifest.json` (v3) with:
   - `"permissions": ["storage", "tabs", "webRequest", "declarativeNetRequest", "declarativeNetRequestFeedback", "alarms"]`
   - `"host_permissions": ["<all_urls>"]` — document the justification string for Web Store review now, not later.
   - `"background": { "service_worker": "background.js", "type": "module" }`
   - `content_scripts` at `document_start`, `all_frames: false`, `run_at` documented.
   - `"action"` popup, `"options_page"`, `"commands"` (reserve `toggle-xray` now, wire in Phase 2).
   - Strict `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'`.
2. Implement typed messaging layer (`shared/types.ts` + `background/messaging.ts`) with a discriminated union `Message` type and a single `sendMessage<T>()` helper.
3. Implement `shared/storage.ts` with a `SCHEMA_VERSION` constant and a migration switch.

**Done when:** popup, options page, content script, and service worker all load; a round-trip `PING`/`PONG` message from content script → SW → popup is verified by an e2e test.

---

### `P0-03` Domain parsing primitives — **`[x]` done**
**Deps:** `P0-01`
**Outcome:** [src/shared/domain.ts](src/shared/domain.ts), 86 cases in
[tests/unit/domain.test.ts](tests/unit/domain.test.ts). Two-function split:
`getRegistrableDomain` uses ICANN-only suffixes (matches the tracker dictionary's keying),
while `isThirdParty` uses private suffixes so sibling `*.github.io` sites are correctly
treated as separate parties.
**Steps**
1. Bundle the Public Suffix List (use `tldts` — small, no network, tree-shakeable).
2. Implement `getRegistrableDomain(url)` and `isThirdParty(requestUrl, pageUrl)` in `shared/domain.ts`.
3. Handle edge cases explicitly: `about:`, `chrome-extension:`, `data:`, `blob:`, IP literals, localhost, punycode/IDN, and multi-part suffixes (`co.uk`, `s3.amazonaws.com`).

**Done when:** a unit-test table of ≥ 60 cases (including all edge cases above) passes at 100%.

---

### ✅ Phase 0 exit gate — **passed**
`npm run typecheck && npm run lint && npm test && npm run build && npm run check:egress && npm run test:e2e` green,
CI workflow committed, `dist/` loads unpacked with zero console errors.

> **Note:** the zero-egress CI guard (`tools/check-egress.mjs`, roadmap step `P1-08.1`) was
> pulled forward into Phase 0 — it is cheapest to enforce before any networking code exists.

---

## Phase 1 — MVP

**Strategic focus:** robust local interception + a non-intrusive live counter. No backend, no network calls.

### `P1-01` Tracker dictionary build pipeline — **`[x]` done, scope reduced**
**Deps:** `P0-03`
**Original roadmap item:** *Static Tracker Dictionary (top 500 domains → corporate parents)*

> **Two assumptions in the original plan were wrong.** Both are corrected in
> [docs/ADR-002-tracker-data-source.md](docs/ADR-002-tracker-data-source.md).
>
> 1. **Tracker Radar is not permissively licensed.** It, Ghostery `trackerdb`, and
>    Disconnect are all CC BY-**NC**-SA 4.0. NonCommercial is incompatible with Phase 3,
>    and ShareAlike would propagate to our derived dictionary. Replaced by EasyPrivacy
>    (CC BY-SA 3.0) plus a self-authored entity map.
> 2. **The dictionary cannot be keyed by eTLD+1.** Filter lists block specific hosts
>    (`match.adsrvr.org`, `d2v9ip.cloudfront.net`). Collapsing those to the registrable
>    domain classified all of CloudFront and AWS as trackers. The artifact is keyed by
>    **hostname**, matched by walking suffixes. A regression test guards this.
>
> **Initial delivery:** 208 hosts / 69 entities / 11.5 KB, 100% attributed to a verified
> corporate parent. **Current artifact:** 477 hosts / 69 entities / 20.1 KB after the
> live prevalence intersection; 213 entries intentionally have no corporate parent.
> Unknown attribution is preferable to guessing and is surfaced as Unidentified.

**Design**
- Source of truth: DuckDuckGo Tracker Radar (`duckduckgo/tracker-radar`, permissive license — verify and record in `docs/LICENSES.md`). Optionally cross-reference Disconnect's `services.json` for categories.
- The raw dataset is ~20 MB; the build script must reduce it to the **top 500 domains by prevalence** and emit a compact artifact.

**Output schema** (`src/data/trackers.json`):
```jsonc
{
  "version": "2026.09.28",
  "entities": {           // id → corporate parent
    "e1": { "name": "Google LLC", "displayName": "Google", "prevalence": 0.82 }
  },
  "domains": {            // eTLD+1 → [entityId, categoryCode]
    "doubleclick.net": ["e1", 0],
    "google-analytics.com": ["e1", 1]
  },
  "categories": ["advertising", "analytics", "behavioral"]
}
```

**Steps**
1. Write `tools/build-tracker-db.ts`: fetch (at build time only) → filter to top 500 by prevalence → map Tracker Radar categories onto the 3 GhostPrint buckets (see `P1-02`) → minify → write `src/data/trackers.json` + `entities.json`.
2. Commit the *generated* artifact so builds are reproducible offline; add `npm run update-trackers` to refresh it.
3. Load the artifact in the service worker into a `Map` at startup; measure and log load time.
4. Add a `docs/LICENSES.md` attribution entry.

**Done when:**
- `trackers.json` ≤ 120 KB minified and loads into memory in < 50 ms on a cold service worker start. ✅ 11.5 KB
- Unit test asserts: every host maps to a valid entity id, every entity has ≥ 1 host, no
  category outside the enum, and no shared-CDN apex is present. ✅ `tests/unit/classifier.test.ts`
- ~~500 ± 5 domains~~ → superseded; the 500-domain coverage target moves to `P1-01b`.

---

### `P1-01b` Crawl-derived prevalence & recall expansion — **`[~]` crawl complete; target pending**
**Deps:** `P1-04`
**Measured run:** 1,000 URLs requested, 628 completed, and 372 failed due to unreachable,
non-web, or navigation-error domains. The run produced 1,491 unique third-party hosts;
269 EasyPrivacy-matching hosts were observed and added to the artifact, for 477 total
dictionary hosts. The ≥500-host target was not met.

**Why it exists:** EasyPrivacy yields ~47k tracker host patterns (~977 KB) with no
prevalence signal. Ranking by filter-rule count was tried and rejected — it surfaced
Act-On, CloudFront and individual hotel chains as "top trackers", because rule volume
measures list-maintenance effort, not tracker reach. Real prevalence requires observation.

**Steps**
1. Take the Tranco top 1,000 (free, academic, redistributable) as the crawl frontier.
2. Drive the built extension over each site with Playwright; record every third-party
   request host and the first-party domain that triggered it.
3. Compute prevalence = (sites where host appears) / (sites crawled). This is a measured
   figure we own outright, with no upstream licence attached.
4. Rank EasyPrivacy hosts by measured prevalence; take the top N that fits the size budget.
5. Persist the raw crawl as candidate evidence; do not treat it as labeled ground truth.
6. Retry failed domains or expand the frontier until ≥500 matching hosts are observed,
   then replace the seed-only artifact with the prevalence-ranked artifact.

**Implementation:** [tools/crawl-prevalence.mjs](tools/crawl-prevalence.mjs) accepts a
JSON URL list (`--urls-file`), crawls up to 1,000 sites with the built extension, records
third-party hostnames per first-party domain, and emits ignored `crawl-results.json` plus
`prevalence-results.json`. Run `npm run crawl:prevalence` with the default performance
list for a smoke crawl, or pass a downloaded Tranco list with `--urls-file`. The raw
capture is intentionally separate from the hand-labeled P1-07 corpus: crawl output is
candidate evidence until a reviewer labels tracker/non-tracker and category fields.

**Done when:** `trackers.json` covers ≥ 500 hosts ranked by measured prevalence, stays
≤ 120 KB, and `P1-07` recall ≥ 85%. ⏳ 477 hosts currently observed; crawl retry and
representative labeling remain.

---

### `P1-02` Categorization taxonomy — **`[x]` done**
**Deps:** `P1-01`
**Original roadmap item:** *Basic Categorization — Advertising/Profiling, Site Analytics, Hidden Behavioral Tracking*

**Outcome:** categories are assigned per domain in the self-authored seed rather than
mapped from an upstream taxonomy, so there is no third-party mapping table to maintain.
The behavioral override list is implemented in
[src/background/classifier.ts](src/background/classifier.ts) and covers all 10 named
vendors. Unknown third parties resolve via `classifyUnknown` and are counted separately,
never folded into the headline number.

**Steps**
1. Define `enum TrackerCategory { Advertising = 0, Analytics = 1, Behavioral = 2, Unknown = 3 }` in `shared/types.ts`.
2. Write the mapping table from Tracker Radar categories → GhostPrint buckets. Document every mapping decision inline in `tools/build-tracker-db.ts` (e.g. `Session Replay`, `Third-Party Analytics Marketing` → `Behavioral`).
3. Add a hardcoded high-signal **behavioral override list** for session-replay/keystroke vendors (FullStory, Hotjar, Quantum Metric, Glassbox, Contentsquare, LogRocket, Clarity, Mouseflow, Inspectlet, Smartlook). These must *always* classify as `Behavioral` regardless of upstream category.
4. Unknown third-party domains fall to `Unknown` and are counted separately — never silently dropped, never inflated into the headline count.

**Done when:** every one of the 10 override vendors resolves to `Behavioral` in a unit test, and a fuzz test of 1,000 random domains yields no uncaught exceptions and no category outside the enum.

---

### `P1-03` Request interception engine — **`[x]` done**
**Deps:** `P0-02`, `P1-02`
**Original roadmap item:** *Manifest V3 Core Engine*

**Outcome:** pure counting rules live in [src/shared/ledger.ts](src/shared/ledger.ts) with
no Chrome dependency, so they are unit-tested directly; the Chrome-bound store is
[src/background/tab-state.ts](src/background/tab-state.ts) and the listeners are in
[src/background/request-monitor.ts](src/background/request-monitor.ts).

Two refinements over the original plan:
- Navigations to non-HTTP URLs (`about:blank`, `chrome://`) drop the tab's ledger instead
  of creating an empty one, which otherwise left junk entries in session storage.
- The badge counts *identified* trackers only. Unknown third parties are still recorded
  and shown in the popup, but promoting them to the badge would overstate what we can name.

**Steps**
**Critical design note:** `declarativeNetRequest` is a *blocking/modifying* API — it does **not** give you per-request observation unless you use `onRuleMatchedDebug` (which is **dev-only, unpacked extensions only**). For production observation the extension must use `chrome.webRequest.onBeforeRequest` in **non-blocking (observe-only)** mode, which remains available in MV3. Architecture:

- **Observation path (always on):** `webRequest.onBeforeRequest` with `{ urls: ['<all_urls>'] }`, no `extraHeaders`, no blocking.
- **Blocking path (opt-in, off by default in MVP):** static `declarativeNetRequest` rulesets, shipped disabled.

**Steps**
1. Register the non-blocking `onBeforeRequest` listener in the service worker.
2. For each request: resolve the initiator's page domain from `details.initiator`/`details.documentId`, skip first-party and non-HTTP(S) schemes, resolve eTLD+1, look up the classifier.
3. Record into `tab-state.ts`: `Map<tabId, { pageDomain, firstSeenAt, trackers: Map<domain, { entityId, category, hits, firstSeenAt }> }>`.
4. Debounce state mirroring to `chrome.storage.session` (250 ms) and broadcast deltas to the content script + popup.
5. Wire lifecycle cleanup: `tabs.onRemoved`, `tabs.onUpdated` (on navigation commit → reset ledger), `webNavigation.onCommitted` for SPA route changes.
6. Update the action badge text with the live count per tab.
7. Add a request-rate guard: if a page exceeds 2,000 tracked requests, stop recording new *hits* but keep unique-domain counting (prevents unbounded memory on pathological pages).

**Done when:**
- Loading `amazon.com`, `cnn.com`, `nytimes.com`, and a Shopify storefront each produces a non-empty, correctly-categorized tracker ledger. ⚠️ Verified against stubbed pages in [tests/e2e/tracking.spec.ts](tests/e2e/tracking.spec.ts); live-site verification needs network access (`P1-01b`).
- Service worker termination + revival restores the ledger from `chrome.storage.session` with zero data loss (verified by an e2e test that force-terminates the SW). ✅ [tests/e2e/sw-lifecycle.spec.ts](tests/e2e/sw-lifecycle.spec.ts), terminated via CDP `ServiceWorker.stopAllWorkers`.
- Memory profile: < 10 MB retained with 20 tabs open for 30 minutes. ⏳ deferred to `P1-06`, which builds the measurement harness.

---

### `P1-04` The "Ghost Counter" floating dashboard — **`[x]` done**
**Deps:** `P1-03`
**Original roadmap item:** *Ghost Counter Floating Dashboard*

> **Correction to step 5.** The plan said to relocate only when a fixed/sticky element
> with `z-index > 1000` occupies the corner. That threshold is wrong: the widget renders
> at `z-index: 2147483647`, so it covers *whatever* is there regardless of the host's
> stacking level. An e2e test caught the widget sitting on top of a fixed "Buy now"
> button with `z-index: 5` — exactly the checkout-button conflict the success criterion
> warns about. Any fixed or sticky element at the probe point now counts as contested;
> statically positioned content is ignored because it scrolls out from under the widget.

**Steps**
1. Content script at `document_start` creates a single `<div>` appended to `document.documentElement` (not `body` — body may not exist yet) with `attachShadow({ mode: 'closed' })`.
2. Host element styles, all with `!important` and set via `cssText` on the host only:
   `position: fixed; bottom: 16px; right: 16px; z-index: 2147483647; all: initial; pointer-events: auto;`
   Inside the shadow root, reset with `:host { all: initial }` and a scoped stylesheet via `adoptedStyleSheets`.
3. Render: total count, a 3-segment category bar, and the top corporate parent. Collapsed size ≤ 120 × 40 px. Click expands to a ≤ 320 × 400 px panel listing entities → domains.
4. Subscribe to SW deltas over a long-lived `chrome.runtime.connect` port; re-connect on port disconnect (SW sleep).
5. **Collision avoidance:** on mount and on `resize`, run `document.elementsFromPoint()` at the intended anchor; if a fixed/sticky host element with z-index > 1000 occupies the slot, shift the anchor to the next free corner in order BR → BL → TR → TL. Persist the user's manual position per-origin in `chrome.storage.local`.
6. Per-origin mute + global disable, both surfaced in the collapsed widget and the options page.
7. Suppress injection entirely on: `chrome://*`, Web Store, `about:blank`, iframes, and any origin in the user's mute list.
8. Respect `prefers-reduced-motion` and `prefers-color-scheme`.

**Done when:**
- Renders correctly on a manual matrix of 20 sites × 3 viewport widths (360 / 768 / 1440 px) with zero visual overlap of primary nav or checkout CTAs. ⚠️ Automated instead: viewport matrix and fixed-CTA collision are covered in [tests/e2e/widget.spec.ts](tests/e2e/widget.spec.ts). The 20-site manual pass still needs live network (`P1-01b`).
- Zero console errors/warnings attributable to GhostPrint on all 20 sites. ✅ asserted per-page in the widget suite; broaden to real sites with `P1-01b`.
- Widget survives SPA navigation on `youtube.com` and `twitter.com` without duplicating itself. ✅ guarded by the `data-ghostprint-ready` single-injection check and covered by the sub-frame spec; live-site confirmation pending `P1-01b`.

---

### `P1-05` Popup: session summary — **`[x]` done**
**Deps:** `P1-03`

> **Two bugs found while building this, both invisible without the e2e harness.**
>
> 1. **History silently lost records.** Concurrent `record()` calls each awaited a storage
>    read, received the same base object, and the last write clobbered the others. Weekly
>    totals would have undercounted forever without ever erroring. Fixed by sharing one
>    load promise and re-reading the live cache after the await.
> 2. **The popup could report on itself.** Tab resolution trusted `sender.tab`, but the
>    popup does occupy a tab when opened directly, so it reported its own (empty) ledger.
>    Extension-page senders are now resolved to the active *page* tab instead.

**Steps**
1. Popup shows current-tab breakdown by category, top 5 entities, and a 7-day local rolling total.
2. Local history store: per-day aggregate counts only (`{ date, domain, entityId, category, count }`), capped at 90 days, pruned by a daily `chrome.alarms` job.
3. "Clear all data" button that wipes `chrome.storage.local` + `session` and resets state.

**Done when:** popup opens in < 100 ms with accurate counts, and "Clear all data" verifiably empties storage (asserted in an e2e test). ✅ First contentful paint is asserted < 100 ms: the shell is static markup and data fills in afterwards, so paint never waits on a service-worker round trip. Clear-data asserts history, ledgers, and muted origins are all empty and defaults restored.

> Clearing is two-step (click, then confirm) so a stray click cannot destroy 90 days of
> local history. Not in the original plan; added because the action is irreversible.

---

### `P1-06` Performance benchmark harness — **`[!]` measured gate failed**
**Deps:** `P1-04`
**Original success criterion:** *Page load ≤ 5% degradation on top 50 domains*

**Steps**
1. Playwright script launches a persistent context twice — baseline (no extension) and treatment (extension loaded).
2. For each of the top 50 domains: 5 runs each, record `LCP`, `DOMContentLoaded`, `loadEventEnd` via the Performance API; discard the slowest run; compare medians.
3. Emit `bench-results.json` + a markdown table; fail CI (nightly job only, not per-PR) if median degradation > 5% on any domain or > 2% on the aggregate.

**Implementation:** [tools/benchmark.mjs](tools/benchmark.mjs) runs baseline and extension
treatment in fresh persistent Chromium contexts, takes five measurements per URL, drops
the slowest run, compares medians, and emits `bench-results.json` plus
`bench-results.md`. `npm run bench:fixture` proves the runner offline; `npm run bench:required`
is used by the scheduled/manual [performance workflow](.github/workflows/performance.yml).
The runner prefers LCP, falls back to FCP or load timing when headless Chromium omits an
LCP entry, and records the run rather than silently inventing a value.

**Measured result:** 47/50 sites completed; 29 exceeded the 5% per-site limit, three
navigation failures occurred, and the worst measured degradation was 259.44%. Aggregate
load-event degradation was -9.89%, but the per-site gate fails. This is a product
performance failure to remediate, not an environment blocker. The first remediation
caches first-party host/domain identity per tab and avoids reparsing the initiator URL on
every subrequest; focused sandbox and tracking tests pass. A clean complete rerun is still
needed before the gate can change.

**Done when:** the harness runs end-to-end unattended and the current build passes the ≤ 5%
/ ≤ 2% thresholds. ✅ harness execution; ❌ current live performance result.

---

### `P1-07` Detection accuracy harness — **`[~] evaluator done; live corpus pending`**
**Deps:** `P1-03`
**Original success criterion:** *≥ 85% of third-party tracking scripts on major e-commerce sites*

**Steps**
1. Build a ground-truth corpus: for 15 e-commerce sites (Amazon + 14 Shopify/WooCommerce/BigCommerce storefronts), capture a full HAR, extract all third-party requests, and hand-label each as tracker / non-tracker. Store as `tests/fixtures/ground-truth/*.json` with a `labeledBy` + `labeledAt` field.
2. Write a replay test that feeds the HAR through the classifier offline (no live network) and computes recall, precision, and per-category confusion.
3. Report recall against the labeled tracker set.

**Implementation:** [src/shared/accuracy.ts](src/shared/accuracy.ts) owns the typed
precision/recall/confusion calculations. Three synthetic regression fixtures under
[tests/fixtures/ground-truth](tests/fixtures/ground-truth) exercise Shopify,
WooCommerce, and BigCommerce-shaped requests. `npm run accuracy` emits ignored
`accuracy-results.json` and `accuracy-results.md` reports. The evaluator measures
known-dictionary attribution; unknown third parties remain visible to the runtime ledger
but are dictionary misses for recall.

**Current offline result:** 15 requests, 100% precision, 85.71% recall. This validates
the evaluator and regression cases only; it is not representative evidence for the live
success criterion. The 628 completed crawl sites are candidate evidence only; they still
need tracker/non-tracker and category labels before entering this evaluator.

**Done when:** recall ≥ 85% and precision ≥ 95% (false positives are worse than misses
for user trust) across the representative corpus, reproducibly, offline. ✅ evaluator;
⏳ corpus and final gate pending `P1-01b`.

---

### `P1-08` MVP hardening & privacy posture — **`[x]` done**
**Deps:** `P1-04`, `P1-05`
**Steps**
1. Static check in CI: reject outbound network calls in the built bundle. Passive MAIN-world probe wrappers may reference page APIs but must not invoke them. ✅ `tools/check-egress.mjs`
2. Write `docs/PRIVACY.md` stating: all processing is local, nothing is transmitted, what is stored, and the retention window. ✅
3. Sanitize every host-page-derived string before rendering (use `textContent`, never `innerHTML`). ✅ enforced by lint and `tools/check-hardening.mjs`
4. Threat-model pass: confirm the content script cannot be used by a hostile page to exfiltrate cross-origin data (no message listeners accepting `window.postMessage` from the page without origin + shape validation). ✅ `docs/THREAT-MODEL.md`
5. Validate the manifest's required permissions, top-frame-only injection, strict extension-page CSP, and required privacy documents. ✅ `tools/check-hardening.mjs`

**Done when:** `npm run check:egress` and `npm run check:hardening` pass, `PRIVACY.md` is committed, and the threat-model checklist in `docs/THREAT-MODEL.md` is fully signed off. ✅

---

### Phase 1 exit gate — **implementation complete; evidence pending**

Implementation gates are green: `P1-04` automated widget coverage, `P1-08` hardening,
`P1-06` harness, and `P1-07` evaluator. The remaining evidence gates must be run from
`.github/workflows/phase1-validation.yml` on a network-enabled runner:

- `P1-06` live top-50 benchmark: ≤ 5% per site and ≤ 2% aggregate.
- `P1-01b` crawl: ≥ 500 prevalence-ranked hosts within the bundle budget.
- `P1-07` representative corpus: 15 labeled e-commerce fixtures, ≥ 85% recall and
  ≥ 95% precision.
- `P1-04` sandbox compatibility pass: ✅ 6 scenarios covering Facebook-like navigation,
  checkout CTA, hostile CSS, SPA navigation, iframe isolation, and CSP. The live 20-site
  pass remains observational evidence, not the correctness harness.

---

## Phase 2 — V1 Public Launch

**Strategic focus:** turn data into narrative, add viral loops, ship to the Chrome Web Store.

### `P2-01` DOM instrumentation probes (prerequisite for the overlay) — **`[x]*` implementation complete; physical gates unverified**
**Deps:** `P1-04`
**Why this exists:** the "Data Ghost" overlay in the original roadmap requires knowing *which DOM element* triggered logging. Network interception alone cannot tell you that. This task builds the missing link.

**Implementation:** MAIN-world wrappers and the nonce-checked isolated bridge are in
[src/content/probes](src/content/probes), built as `probe-main.js`. The bridge keeps only
the script host long enough to classify it, then exposes ephemeral eTLD+1 observations
to the overlay consumer. Wrappers stop after 64 observations and are restored when the
extension is disabled or the origin is muted. Privacy and trust-boundary details are in
[docs/PRIVACY.md](docs/PRIVACY.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

**Steps**
1. Inject a `MAIN`-world script (`world: "MAIN"` content script, MV3) that wraps, without breaking, the following and records `(target selector, api, timestamp)`:
   - `EventTarget.prototype.addEventListener` for `keydown`/`keyup`/`input`/`paste`/`mousemove`/`scroll` where the listener's source origin is third-party.
   - `MutationObserver` construction targeting form elements.
   - `navigator.sendBeacon`, `fetch`, `XMLHttpRequest.send` — capture the calling stack frame's script URL.
   - Canvas fingerprinting surface: `HTMLCanvasElement.toDataURL`, `getImageData`, `WebGLRenderingContext.getParameter`.
2. Attribute each call to a script URL via `new Error().stack` parsing; map that URL's eTLD+1 through the existing classifier.
3. Bridge MAIN-world → ISOLATED-world via a nonce-guarded `window.postMessage` channel; the isolated content script **must** validate `event.source === window`, the nonce, and the message shape before forwarding.
4. Hard performance budget: probe overhead ≤ 3 ms per page; all wrapping must be transparent (preserve `.toString()`, `length`, and `name` of wrapped functions to avoid breaking sites that feature-detect).

**Done when:**
- On Hotjar/Clarity-instrumented test pages, the probe correctly attributes keystroke listeners to the tracker's eTLD+1.
- A 30-site regression suite shows zero site breakage (no new console errors, all primary CTAs still functional).
- Probe overhead measured ≤ 3 ms median.

*Sandbox attribution, wrapper-shape, and repository tests passed. The 30-site
compatibility sweep and ≤ 3 ms overhead were not physically measured.*

---

### `P2-02` "Data Ghost" particle overlay — **`[x]*` implementation complete; physical CPU gate unverified**
**Deps:** `P2-01`
**Implementation:** A default-off popup setting enables the closed-root viewport canvas.
Effects resolve bounded probe selectors, fade after 1.5 seconds, cap at four effects and
60 particles, pause while hidden, stop under reduced motion, and cancel RAF when idle or
disabled. Popup persistence, probe capture, and click-through are covered by the e2e
suite. The P2-01 site-compatibility/overhead gates and this task's ≤ 2% CPU measurement
were not physically measured.*
**Steps**
1. On a probe event, resolve the target element's bounding box and render a glow/particle effect in an overlay canvas inside the existing closed shadow root (never mutate host DOM).
2. Use a single `<canvas>` with `requestAnimationFrame`, pausing when `document.hidden` or when no effects are active. Cap at 60 particles, hard-stop the RAF loop when the queue empties.
3. `pointer-events: none` on the overlay at all times — it must never intercept clicks.
4. Effects auto-fade after 1.5 s; rate-limit to ≤ 4 concurrent effects; disable entirely under `prefers-reduced-motion`.
5. Off by default; enabled from the popup with a persisted per-user setting.

**Done when:** overlay costs ≤ 2% sustained CPU on a mid-tier laptop during active tracking, never blocks a click (verified by an e2e click-through test on a covered button), and idles at 0% CPU.

---

### `P2-03` Real-time "Value Meter" — **`[x]*` implementation complete; legal review unverified**
**Deps:** `P1-05`
**Source review:** The publicly posted Tunnl [data-usage-fee article](https://www.tunnldata.com/blog/third-party-audience-data-usage-fees)
reports its own $1.50 programmatic display/most-DSP CPM (published 2023-02-10;
retrieved 2026-09-29). It is provider-specific and not a market-wide price. The
prototype uses it only as a clearly disclosed fee-equivalent proxy, with neutral
category and vertical multipliers because no public breakdown was found. Method and
limitations are in [docs/VALUE-MODEL.md](docs/VALUE-MODEL.md). Legal copy review remains
unverified; do not include the Value Meter in a public release until counsel reviews the
wording.
**Implementation:** The popup computes a local fee-equivalent estimate from current-page
tracker hits, always shows the estimate disclaimer, and links to the in-extension
methodology. `src/data/value-model.json` stores a source URL and retrieval date for every
numeric model input. The category/vertical neutral weights and the mapping of a tracker
hit to an impression are modeling assumptions, not observations about an individual's
data value.
**Steps**
1. Build `src/data/value-model.json`: per-category CPM-derived per-event value, sourced from **publicly citable** data-broker/RTB pricing references. Every number must carry a `source` URL and `retrievedAt` field.
2. Compute session value = Σ(event × category weight × page-vertical multiplier). Verticals (finance, health, e-commerce, news) derived from the classifier's page-domain category, not page content.
3. Display as a rolling ticker in the popup with a persistent, non-dismissible "Estimate" disclaimer and a "How is this calculated?" link to `docs/VALUE-MODEL.md`.
4. **Legal review gate:** the wording must be clearly presented as an illustrative estimate, not a claim of actual earnings. Do not ship without this copy reviewed.

**Done when:** every value in the model has a cited source, the methodology doc is published, and the disclaimer is present in every surface that shows a dollar figure.

---

### `P2-04` X-Ray Vision hotkey — **`[x]*` implementation complete; browser shortcut and heap gates unverified**
**Deps:** `P2-01`, `P2-02`
**Implementation:** With the default-on activity-cue setting, validated tracker probe
events trigger a brief, throttled cue beside the observed target with an Explore action.
Explore opens the full X-Ray layer, which dims the page, outlines up to 64 observed
targets, draws category-colored SVG curves to domain labels grouped by corporate parent,
announces a live summary, exits on Escape, and resets on SPA history navigation. Users
can disable automatic cues in Settings. Shortcut collision warning, Settings-page
fallback, direct toggle, repeat cleanup, click-through, and SPA reset have automated
coverage.
Playwright could not
trigger Chrome's browser-level shortcut event, and a heap snapshot was not taken; these
physical checks are unverified.*
**Steps**
1. When a validated third-party probe signal arrives, automatically show a brief, throttled cue beside its target. The cue identifies the third-party domain and provides an **Explore** action; it must never block the page or require a click to dismiss.
2. Explore or the `toggle-xray` command (`Ctrl+Shift+X` / `Cmd+Shift+X`) opens the full view: dim the page inside the closed shadow root, outline observed targets, and draw category-colored SVG curves to third-party domain nodes.
3. Group full-view nodes by corporate parent and cap the view to 64 observations / 12 visible domains; unseen domains remain summarized in the live region.
4. `Esc` exits. X-Ray resets on navigation, and the transient cue is disabled by the user-facing automatic-cues setting.
5. Preserve keyboard access and an announced ARIA live-region summary. If Chrome drops the suggested shortcut, the Options button is the direct fallback.

**Done when:** toggling on/off 20 times on a heavy page leaves no residual DOM, no leaked RAF loops, and no memory growth (heap snapshot delta < 1 MB).

---

### `P2-05` Viral weekly privacy report — **`[x]*` implementation complete; physical release checks unverified**
**Deps:** `P1-05`
**Privacy boundary:** Current local history deliberately omits which first-party site
caused tracker observations. Do not add that association without an explicitly approved
privacy/storage change. Until then, use a top third-party tracker domain as the card
highlight and redact that label before sharing. The Chrome Web Store share URL is pending
until a listing exists.
**Implementation:** A weekly alarm persists a replace-on-generation privacy-safe report.
The popup renders a 1200×630 local OffscreenCanvas card with Download, Copy image, Share,
and domain redaction controls. A default-off notification contains no browsing details.
Unit and e2e tests cover aggregate math, redaction, rendered dimensions, download, and
notification opt-in. Notification delivery, clipboard/Web Share platform behavior,
sub-500 ms rendering, social-card preview rendering, and the future Web Store URL were
not physically verified.*
**Steps**
1. Weekly `chrome.alarms` job aggregates the local 7-day store into: top third-party tracker domain, Top Corporate Stalker, total trackers, estimated fee-equivalent, and week-over-week delta. The top first-party site is not available without changing the privacy-preserving history schema.
2. Render a 1200 × 630 share card **entirely client-side** on an `OffscreenCanvas`; export via `convertToBlob()`.
3. Share actions: Download PNG, Copy to clipboard, and Web Share API where available. **No server upload.** Share text includes a Chrome Web Store link with a UTM campaign parameter.
4. Notification (opt-in, via `chrome.notifications`) when the report is ready; hard cap of one per week; user can disable.
5. The card must never contain a full URL or anything user-identifying beyond a domain name — and the preview must let the user redact the site name before sharing.

**Done when:** a card generates in < 500 ms, renders correctly at Twitter/X and LinkedIn card dimensions, contains zero PII, and the redaction toggle works.

---

### `P2-06` Attribution & organic loop measurement — **`[~]` client, consent flow, sink, and local reporting implemented; deployment/review pending**
**Deps:** `P2-05`
**Original success criterion:** *≥ 3% of active users share or invite*

**Implementation:** The default-off consent prompt, seven-day cohort token, hourly count
queue, six metric hooks, and consent-gated HTTPS client are implemented. The Cloudflare
Worker validates the schema, enforces a configured extension origin, writes 30-day R2
objects, and runs a daily expiry sweep; see [services/telemetry-sink/README.md](services/telemetry-sink/README.md).
`VITE_TELEMETRY_ENDPOINT` defaults empty, so the checked-in build sends nothing and the
Allow button remains disabled.

**Remaining:** Configure the published extension origin and Cloudflare rate limit,
deploy the Worker, and obtain counsel approval for the consent wording. The local
dashboard consumes exported Worker payloads plus manually entered Web Store install and
UTM landing counts. It reports event-based share completion, referral visits per install,
and consented W4 returns; these are directional proxies, not unique-user share-rate or
linked-cohort retention. The Origin check is not authentication; counts can be spoofed.
Because the cohort rotates weekly, W4 retention is approximate rather than linkable to an
individual installation; report that limitation.

**Steps**
1. Define the minimal metric set: `weekly_report_viewed`, `share_clicked`, `share_completed`, `xray_toggled`, `popup_opened`, `w4_retained`.
2. This is the **first** feature that requires egress. Implement a strictly opt-in, **default-off** anonymous telemetry channel: no persistent user id (use a rotating 7-day install cohort salt), no URLs, no timestamps finer than the hour, counts only.
3. Surface a plain-language consent screen on first run. Refusal must be a first-class, zero-friction choice.
4. Derive installs from Chrome Web Store stats; derive share-rate from UTM landing hits + opt-in telemetry, and state the measurement error explicitly.

**Done when:** consent flow is implemented, telemetry is provably inert when declined (CI test asserts zero network calls in the declined state), and the metric dashboard reports share-rate and W4 retention.

---

### `P2-07` Integrated cleanup engine (GPC + opt-out) — **`[x]*` 2a implemented; live header check unverified**
**Deps:** `P1-03`
**Scope discipline:** the original roadmap conflates two very different things. Split them.

**2a — GPC signal (ship in V1) — `[x]*`**
**Implementation:** Default-off GPC adds `Sec-GPC: 1` using one dynamic DNR rule,
excludes user-configured initiator hostnames, and sets the MAIN-world navigator property
on non-excepted pages. Options UI and e2e tests cover opt-in, normalization, exceptions,
and dynamic rule contents. The live outbound header check at `globalprivacycontrol.org`
was not physically verified.*
1. Set the `Sec-GPC: 1` request header on all outbound requests via `declarativeNetRequest` `modifyHeaders` rules.
2. Set `navigator.globalPrivacyControl = true` via a MAIN-world script.
3. Add a visible on/off toggle and a per-site exception list.
**Done when:** `globalprivacycontrol.org/check` confirms the signal, and a DNR rule-count check confirms we stay well under the static rule limit.

**2b — Automated opt-out requests (defer; do not ship blind) — `[!]` legal review required**
1. **Legal gate first.** Acting as an authorized agent to submit CCPA/CPRA deletion requests has jurisdiction-specific authorization requirements. Obtain written counsel guidance before any code is written. Record the outcome in `docs/ADR-002-opt-out-agent.md`.
2. If cleared: build a manual-confirmation flow only — pre-fill a request, show the user exactly what will be sent, require explicit per-request approval. **No silent bulk submission, ever.**
3. Maintain a small, curated registry of privacy contact endpoints; start with ≤ 25 high-prevalence entities.

**Done when (2b):** ADR-002 is committed with a legal decision. If not cleared, mark `[dropped]` and ship 2a alone — this must not block the V1 launch.

---

### `P2-08` Chrome Web Store launch readiness
**Deps:** all of Phase 2
**Steps**
1. Produce store assets: icon set, 5 screenshots, a ≤ 30 s demo video, and a permission-justification paragraph for each requested permission (`<all_urls>` and `webRequest` attract the most scrutiny — write these carefully).
2. Publish a hosted privacy policy URL (required for any extension handling browsing activity).
3. Complete the Web Store data-use disclosure form; the answers must exactly match `docs/PRIVACY.md`.
4. Ship a staged rollout: trusted-tester channel → 10% → 100%.
5. Add a crash/error reporting path that is local-only by default (errors surface in the options page; the user may copy them into a GitHub issue).

**Done when:** the extension is approved and publicly listed, with no policy warnings.

---

### `P2-09` Scale readiness
**Deps:** `P2-06`
**Original success criterion:** *10,000+ DAU without rate limits or crashes*
**Steps**
1. Since Phases 1–2 are local-first, the only server surfaces are the telemetry sink and the tracker-DB update endpoint. Host both behind a CDN with static, cacheable responses.
2. Tracker-DB updates: serve a versioned static JSON from a CDN, checked at most once per 24 h via `chrome.alarms`, with jittered scheduling to avoid thundering herds, ETag caching, and a signature check before the client accepts an update.
3. Telemetry sink: an edge function writing to object storage; no per-user database.
4. Load test at 10× the 10k-DAU projection.

**Done when:** load test passes at 10×, and a simulated 24 h update cycle for 100k clients shows a flat CDN origin request profile.

---

### ✅ Phase 2 exit gate
Publicly listed · W4 retention ≥ 30% measured over two cohorts · share-rate ≥ 3% · zero P0 bugs open for 14 days.

---

## Phase 3 — V2 Scale & Monetization

---

### `P3-01` Local zero-knowledge vector aggregation
**Deps:** `P3-00`
**Steps**
1. Build a Rust → WebAssembly module that maps local browsing history to a fixed taxonomy of ~200 intent categories (e.g. `auto.ev.lease-intent`). Input: local domain visit counts. Output: a sparse vector of category scores.
2. All inference runs on-device. The WASM module must have **no network capability** — verify by inspecting imports; a CI check asserts the module imports nothing beyond memory and the explicit host bindings.
3. Apply local differential privacy before any output leaves the device: randomized response or Gaussian noise with a documented, fixed ε budget tracked per user per epoch.
4. Enforce k-anonymity ≥ 1,000 at the cohort level — a cohort is never emitted unless the server-side aggregate confirms the threshold.

**Done when:** an adversarial re-identification test against a synthetic 100k-user dataset fails to recover source URLs, the ε budget is documented and enforced in code, and the no-network WASM assertion is in CI.

---

### `P3-02` "Flip the Switch" marketplace opt-in
**Deps:** `P3-01`
**Steps**
1. Multi-step consent UI: what is shared (show the *actual* vector categories for this specific user), what is never shared, who buys it, what they earn, how to revoke.
2. Per-category toggles — never all-or-nothing. Default: everything off.
3. Revocation must be instant and must trigger deletion propagation to downstream buyers within the contractual SLA.
4. Generate and locally store a signed consent receipt for every consent change.

**Done when:** a usability test with 10 participants shows ≥ 8 can correctly state what they agreed to share, and revocation is verified end-to-end.

---

### `P3-03` Clean room pipeline
**Deps:** `P3-02`
**Steps**
1. Build the ingestion edge: authenticated, rate-limited, receiving only `{cohortId, noisyVector, epoch}` — no user identifier.
2. Aggregate into cohorts; enforce the k ≥ 1,000 threshold at write time; drop anything below it.
3. Integrate with Snowflake Data Clean Rooms (and/or Databricks Clean Rooms) — start with one, not both.
4. Implement an audit log of every buyer query, retained for the statutory period.

**Done when:** an end-to-end test moves a synthetic cohort from the extension to a buyer-queryable clean room table, and the audit log captures the query.

---

### `P3-04` Micro-dividend wallet
**Deps:** `P3-03`
**Steps**
1. Integrate Stripe Connect (Express accounts) for payouts; handle KYC, 1099 thresholds, and unsupported jurisdictions gracefully.
2. Build an earnings ledger with a transparent attribution breakdown per cohort contribution.
3. Set a minimum payout threshold and a clear escheatment/dormancy policy.
4. Never store payment credentials in the extension — the wallet is a hosted web dashboard, authenticated separately from the extension.

**Done when:** a test payout completes end-to-end in Stripe test mode and the ledger reconciles to the cent.

---

### ✅ Phase 3 exit gate
Opt-in rate ≥ 15% · two signed B2B trials · zero regulatory complaints · external privacy audit passed.

---

## Appendix A — Known risks

| Risk | Impact | Mitigation | Owner task |
|---|---|---|---|
| Async read-modify-write on shared caches | Silent undercounting, no error surfaced | Share one load promise; re-read live state after every await | `P1-05` |
| Widget covers a checkout CTA | Lost sales on host sites, uninstalls | Relocate away from any fixed/sticky corner element; e2e click-through test | `P1-04` |
| Curated tracker datasets are NonCommercial | Blocks Phase 3; forces a late rebuild | Use EasyPrivacy (CC BY-SA 3.0) + self-authored entity map | `P1-01`, ADR-002 |
| eTLD+1 keying misclassifies shared CDNs | Precision collapse, user distrust | Hostname-keyed dictionary + regression test on CDN apexes | `P1-01` |
| `declarativeNetRequest` cannot observe requests in production | Breaks the entire MVP premise | Use non-blocking `webRequest` for observation; DNR only for GPC headers/blocking | `P1-03` |
| MV3 service worker termination loses tab state | Counter resets mid-session | Mirror to `chrome.storage.session` on every debounced batch | `P1-03` |
| `<all_urls>` + `webRequest` triggers Web Store review friction | Launch delay | Pre-write permission justifications; minimize permissions; staged rollout | `P0-02`, `P2-08` |
| Value Meter figures read as an earnings claim | Legal exposure | Cited sources, persistent estimate disclaimer, counsel-reviewed copy | `P2-03` |
| Acting as an opt-out authorized agent without authorization | Legal exposure | ADR-002 legal gate; manual per-request confirmation only | `P2-07` |
| Marketplace conflicts with Web Store Limited Use policy | Product-killing | Validate policy compatibility **before** building Phase 3 | `P3-00` |
| MAIN-world probes break host sites | Churn, bad reviews | Transparent function wrapping, 30-site regression suite, kill switch | `P2-01` |
| Particle overlay drains battery | Uninstalls | RAF pause on idle/hidden, 60-particle cap, off by default | `P2-02` |

## Appendix B — Success-criteria ledger

| Phase | Criterion | Measured by | Threshold |
|---|---|---|---|
| 1 | Page-load degradation | `P1-06` harness | ≤ 5% per domain, ≤ 2% aggregate |
| 1 | Detection recall | `P1-07` harness (needs `P1-01b`) | ≥ 85% recall, ≥ 95% precision |
| 1 | Dictionary precision | `P1-01` dictionary tests | 100% attributed, 0 shared-CDN apexes |
| 1 | UI conflict | 20-site × 3-viewport matrix | 0 overlaps, 0 console errors |
| 2 | Scale | Load test | 10× 10k DAU |
| 2 | Organic loop | UTM + opt-in telemetry | ≥ 3% share/invite |
| 2 | Retention | Cohort analysis | ≥ 30% W4 |
| 3 | Opt-in conversion | Product analytics | ≥ 15% |
| 3 | Enterprise viability | Signed trials | ≥ 2 |
| 3 | Compliance | External audit | 0 complaints/warnings |
