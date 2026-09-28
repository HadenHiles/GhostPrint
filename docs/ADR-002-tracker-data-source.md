# ADR-002: Tracker dictionary data source

**Status:** Accepted · 2026-09-28
**Related:** ROADMAP `P1-01`, `P1-02`

## Context

ROADMAP `P1-01` named DuckDuckGo Tracker Radar as the source, describing it as
"permissive license — verify". Verification found otherwise. Every major curated
tracker dataset is **NonCommercial**:

| Dataset | License | Commercial use |
|---|---|---|
| DuckDuckGo Tracker Radar | CC BY-NC-SA 4.0 | No |
| Ghostery `trackerdb` | CC BY-NC-SA 4.0 | No |
| Disconnect tracking-protection | CC BY-NC-SA 4.0 | No |
| **EasyPrivacy** | **GPL-3.0-or-later OR CC BY-SA 3.0** | **Yes** |

NC licensing is disqualifying. Phase 3 is an explicit monetization play, and the
ShareAlike term would force our derived dictionary to inherit NC-SA — which conflicts
with both a data marketplace and an acquisition. Adopting an NC source now would mean
rebuilding the dictionary, the category mapping, and the `P1-07` ground-truth corpus
later, at the point where they are most load-bearing.

## Decision

Assemble the dictionary from three separately-licensed parts, so no single upstream
constrains the product:

1. **Tracker identification — EasyPrivacy**, used under **CC BY-SA 3.0** (the permissive
   half of its dual license). Attribution is carried in `docs/LICENSES.md` and in the
   generated artifact. The derived *domain list* is ShareAlike; GhostPrint's source code
   is not a derivative of it and is unaffected.
2. **Corporate parent and category — self-authored** (`tools/data/entities.seed.json`).
   Corporate ownership is fact, not expression; this compilation is ours, under no
   upstream terms. It is also the highest-value part of the product ("Meta is watching
   you"), so owning it outright is correct regardless of licensing.
3. **Prevalence — deferred, to be derived from our own crawl** (`P1-01b`). We will not
   import a prevalence figure from an NC dataset, and we will not invent one.

## Consequences

**Positive**
- No NonCommercial encumbrance anywhere in the pipeline. Phase 3 is unblocked.
- The entity map becomes a proprietary asset rather than a borrowed one.
- The crawl that supplies prevalence also produces the `P1-07` ground-truth corpus, so
  the work is shared across two roadmap tasks.

**Negative**
- No prevalence at MVP. Domains are ranked by **EasyPrivacy rule count**, a real but
  coarser signal. The artifact field is named `rank`, never `prevalence`, so a derived
  ordering is never mistaken for measured prevalence.
- Entity coverage starts at ~45 entities / ~120 domains rather than 500. Unmatched
  tracker domains are surfaced as `Unknown` and counted separately — never dropped, and
  never attributed to a guessed parent.
- Growing entity coverage is ongoing manual work.

## Deviation from ROADMAP

`P1-01` specified "top 500 domains by prevalence" and a `prevalence` field on entities.
Replaced by `rank` (EasyPrivacy rule count). The 500-domain target is retained for
detection coverage; the *entity* attribution target is tracked separately and grows over
time. Success criteria updated accordingly.

## Revisit when

The `P1-01b` crawl lands (replace `rank` with measured prevalence), or if DuckDuckGo
grants a commercial license for Tracker Radar, which they explicitly invite. Because the
build pipeline is adapter-based, swapping or adding a source does not touch runtime code.
