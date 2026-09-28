import { getEntity } from './classifier';
import {
  addObservation,
  DEFAULT_WINDOW_DAYS,
  prune,
  RETENTION_DAYS,
  summarize,
} from '@/shared/history';
import type { History, HistoryObservation } from '@/shared/history';
import type { HistorySummary } from '@/shared/types';

const STORAGE_KEY = 'history';
const PRUNE_ALARM = 'ghostprint-prune-history';
const FLUSH_DEBOUNCE_MS = 1_000;

let cache: History | null = null;
let loading: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function installHistory(): void {
  void chrome.alarms.create(PRUNE_ALARM, { periodInMinutes: 60 * 24, delayInMinutes: 1 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PRUNE_ALARM) void pruneNow();
  });
}

export async function record(observation: HistoryObservation): Promise<void> {
  await ensureLoaded();
  // Read `cache` after awaiting, never a value captured before: concurrent requests
  // interleave here, and using a stale base silently drops the other one's write.
  cache = addObservation(cache ?? {}, Date.now(), observation);
  scheduleFlush();
}

export async function getSummary(days = DEFAULT_WINDOW_DAYS): Promise<HistorySummary> {
  await ensureLoaded();
  return summarize(cache ?? {}, Date.now(), days, (id) => getEntity(id)?.displayName ?? null);
}

export async function pruneNow(): Promise<void> {
  await ensureLoaded();
  cache = prune(cache ?? {}, Date.now(), RETENTION_DAYS);
  await flush();
}

export function reset(): void {
  cache = {};
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

export async function flush(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (cache === null) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: cache });
}

/** Shares one storage read across concurrent callers so they cannot race each other. */
async function ensureLoaded(): Promise<void> {
  if (cache !== null) return;
  loading ??= chrome.storage.local
    .get<{ history?: History }>(STORAGE_KEY)
    .then((stored) => {
      cache ??= stored.history ?? {};
      loading = null;
    });
  await loading;
}

/**
 * History is an aggregate, so losing the last second of writes to a service-worker
 * shutdown is acceptable; writing on every request is not.
 */
function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
}
