import { getEntity } from './classifier';
import {
  addObservation,
  DEFAULT_WINDOW_DAYS,
  prune,
  RETENTION_DAYS,
  summarize,
} from '@/shared/history';
import { createWeeklyReport } from '@/shared/weekly-report';
import { readLocal } from '@/shared/storage';
import type { History, HistoryObservation } from '@/shared/history';
import type { HistorySummary, WeeklyReport } from '@/shared/types';

const STORAGE_KEY = 'history';
const PRUNE_ALARM = 'ghostprint-prune-history';
const WEEKLY_REPORT_ALARM = 'ghostprint-weekly-report';
const WEEK_MINUTES = 7 * 24 * 60;
const FLUSH_DEBOUNCE_MS = 1_000;

let cache: History | null = null;
let loading: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function installHistory(): void {
  void ensureAlarm(PRUNE_ALARM, 60 * 24, 1);
  void ensureAlarm(WEEKLY_REPORT_ALARM, WEEK_MINUTES, WEEK_MINUTES);

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PRUNE_ALARM) void pruneNow();
    if (alarm.name === WEEKLY_REPORT_ALARM) void publishWeeklyReport();
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

export async function getWeeklyReport(): Promise<WeeklyReport> {
  await ensureLoaded();
  return createWeeklyReport(cache ?? {}, Date.now(), (id) => getEntity(id)?.displayName ?? null);
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

async function publishWeeklyReport(): Promise<void> {
  const report = await getWeeklyReport();
  await chrome.storage.local.set({ weeklyReport: report });

  const state = await readLocal();
  if (!state.settings.weeklyReportNotificationEnabled) return;
  try {
    await chrome.notifications.create('ghostprint-weekly-report', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('report-icon.svg'),
      title: 'Your GhostPrint weekly report is ready',
      message: `${report.totalTrackers} tracker encounters are summarized locally.`,
      priority: 0,
    });
  } catch {
    // Permission can be revoked after the user enabled notifications.
  }
}

async function ensureAlarm(name: string, periodInMinutes: number, delayInMinutes: number): Promise<void> {
  if ((await chrome.alarms.get(name)) !== undefined) return;
  await chrome.alarms.create(name, { periodInMinutes, delayInMinutes });
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
