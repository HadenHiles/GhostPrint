import { TrackerCategory } from './types';
import type { CategoryTotals, LedgerSummary, TabLedger, TrackerHit } from './types';

/**
 * Pure ledger operations. Deliberately free of Chrome APIs so the counting rules can be
 * tested directly; the service worker binds these to tabs in background/tab-state.ts.
 */

/**
 * Above this many third-party requests on a single page we stop incrementing per-domain
 * hit counts but keep counting distinct domains. Bounds memory on pathological pages
 * (infinite scroll, ad-heavy SPAs) without losing the headline number.
 */
export const MAX_TRACKED_REQUESTS = 2000;

export interface Observation {
  domain: string;
  entityId: string | null;
  category: TrackerCategory;
}

export function createLedger(tabId: number, pageDomain: string | null, now: number): TabLedger {
  return { tabId, pageDomain, startedAt: now, trackers: {}, requests: 0, capped: false };
}

/** Returns true when the ledger changed in a way worth pushing to the UI. */
export function recordHit(ledger: TabLedger, observation: Observation, now: number): boolean {
  ledger.requests += 1;

  const existing = ledger.trackers[observation.domain];
  if (existing === undefined) {
    ledger.trackers[observation.domain] = {
      domain: observation.domain,
      entityId: observation.entityId,
      category: observation.category,
      hits: 1,
      firstSeenAt: now,
    };
    return true;
  }

  if (ledger.requests > MAX_TRACKED_REQUESTS) {
    ledger.capped = true;
    return false;
  }

  existing.hits += 1;
  return false;
}

export function summarize(
  ledger: TabLedger,
  entityName: (entityId: string) => string | null,
): LedgerSummary {
  const byCategory: CategoryTotals = {
    [TrackerCategory.Advertising]: 0,
    [TrackerCategory.Analytics]: 0,
    [TrackerCategory.Behavioral]: 0,
    [TrackerCategory.Unknown]: 0,
  };

  const entityCounts = new Map<string, number>();
  const trackers = Object.values(ledger.trackers);

  for (const tracker of trackers) {
    byCategory[tracker.category] += 1;
    if (tracker.entityId !== null) {
      entityCounts.set(tracker.entityId, (entityCounts.get(tracker.entityId) ?? 0) + 1);
    }
  }

  return {
    tabId: ledger.tabId,
    pageDomain: ledger.pageDomain,
    total: trackers.length,
    byCategory,
    topEntity: pickTopEntity(entityCounts, entityName),
    capped: ledger.capped,
  };
}

export function sortedTrackers(ledger: TabLedger): TrackerHit[] {
  return Object.values(ledger.trackers).sort(
    (a, b) => b.hits - a.hits || a.domain.localeCompare(b.domain),
  );
}

function pickTopEntity(
  counts: Map<string, number>,
  entityName: (entityId: string) => string | null,
): LedgerSummary['topEntity'] {
  let best: [string, number] | null = null;

  // Ties break on entity id so the displayed "top stalker" does not flicker between
  // equally-ranked entities as requests arrive.
  for (const entry of counts) {
    if (best === null || entry[1] > best[1] || (entry[1] === best[1] && entry[0] < best[0])) {
      best = entry;
    }
  }

  if (best === null) return null;
  return { id: best[0], name: entityName(best[0]) ?? best[0], count: best[1] };
}
