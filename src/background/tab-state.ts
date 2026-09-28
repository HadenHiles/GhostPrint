import { createLedger, recordHit, sortedTrackers, summarize } from '@/shared/ledger';
import type { Observation } from '@/shared/ledger';
import { dropLedger, loadLedgers, saveLedgers } from '@/shared/storage';
import type { LedgerSummary, TabLedger, TrackerDetail } from '@/shared/types';
import { getEntity } from './classifier';

/**
 * Per-tab tracker ledgers.
 *
 * The MV3 service worker is terminated aggressively, so in-memory state alone is not
 * durable. Every mutation marks the tab dirty and a debounced flush mirrors it to
 * chrome.storage.session, which survives worker restarts but not browser restarts --
 * exactly the lifetime a per-tab count should have.
 */
const FLUSH_DEBOUNCE_MS = 250;

const ledgers = new Map<number, TabLedger>();
const dirty = new Set<number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hydrated = false;

/** Restores ledgers after a service-worker restart. Safe to call repeatedly. */
export async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  for (const ledger of await loadLedgers()) {
    if (!ledgers.has(ledger.tabId)) ledgers.set(ledger.tabId, ledger);
  }
}

export function getLedger(tabId: number): TabLedger | null {
  return ledgers.get(tabId) ?? null;
}

export function getSummary(tabId: number): LedgerSummary | null {
  const ledger = ledgers.get(tabId);
  return ledger === undefined ? null : summarize(ledger, entityName);
}

export function getDetails(tabId: number): TrackerDetail[] {
  const ledger = ledgers.get(tabId);
  if (ledger === undefined) return [];

  return sortedTrackers(ledger).map((tracker) => ({
    domain: tracker.domain,
    entityId: tracker.entityId,
    entityName: tracker.entityId === null ? null : entityName(tracker.entityId),
    category: tracker.category,
    hits: tracker.hits,
  }));
}

/** Starts a fresh ledger for a navigation. Returns the ledger so callers can push a reset. */
export function resetTab(tabId: number, pageDomain: string | null): TabLedger {
  const ledger = createLedger(tabId, pageDomain, Date.now());
  ledgers.set(tabId, ledger);
  markDirty(tabId);
  return ledger;
}

/**
 * Records a third-party observation. Returns true when a new domain appeared, which is
 * the only case that changes the headline count.
 */
export function record(tabId: number, pageDomain: string | null, observation: Observation): boolean {
  let ledger = ledgers.get(tabId);
  if (ledger === undefined || (pageDomain !== null && ledger.pageDomain !== pageDomain)) {
    ledger = resetTab(tabId, pageDomain);
  }

  const isNew = recordHit(ledger, observation, Date.now());
  markDirty(tabId);
  return isNew;
}

export function forgetTab(tabId: number): void {
  ledgers.delete(tabId);
  dirty.delete(tabId);
  void dropLedger(tabId);
}

export function clear(): void {
  ledgers.clear();
  dirty.clear();
}

export async function flush(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (dirty.size === 0) return;

  const pending: TabLedger[] = [];
  for (const tabId of dirty) {
    const ledger = ledgers.get(tabId);
    if (ledger !== undefined) pending.push(ledger);
  }
  dirty.clear();
  await saveLedgers(pending);
}

function markDirty(tabId: number): void {
  dirty.add(tabId);
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
}

function entityName(entityId: string): string | null {
  return getEntity(entityId)?.displayName ?? null;
}
