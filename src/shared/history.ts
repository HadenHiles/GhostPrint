import { TrackerCategory } from './types';
import type { CategoryTotals, EntityCount, HistorySummary } from './types';

/**
 * Local browsing history, stored as per-day aggregates only.
 *
 * Deliberately never records URLs, page titles, visit times, or which site a tracker was
 * seen on -- only "this tracker domain was encountered N times on this date". That is
 * enough for the weekly summary while keeping the store useless to anyone who obtains it.
 */

export const RETENTION_DAYS = 90;
export const DEFAULT_WINDOW_DAYS = 7;

export interface HistoryEntry {
  entityId: string | null;
  category: TrackerCategory;
  count: number;
}

/** Keyed by tracker domain. */
export type DayHistory = Record<string, HistoryEntry>;

/** Keyed by `YYYY-MM-DD` in local time. */
export type History = Record<string, DayHistory>;

export interface HistoryObservation {
  domain: string;
  entityId: string | null;
  category: TrackerCategory;
}

/** Local-time date key. UTC would roll the day over mid-evening for western users. */
export function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addObservation(
  history: History,
  timestamp: number,
  observation: HistoryObservation,
): History {
  const key = dateKey(timestamp);
  const days = new Map(Object.entries(history));
  const day = new Map(Object.entries(days.get(key) ?? {}));
  const existing = day.get(observation.domain);

  day.set(
    observation.domain,
    existing === undefined
      ? { entityId: observation.entityId, category: observation.category, count: 1 }
      : { ...existing, count: existing.count + 1 },
  );

  days.set(key, Object.fromEntries(day));
  return Object.fromEntries(days);
}

/** Drops days outside the retention window. Runs daily from a background alarm. */
export function prune(
  history: History,
  now: number,
  retentionDays: number = RETENTION_DAYS,
): History {
  const cutoff = dateKey(now - retentionDays * 24 * 60 * 60 * 1000);
  return Object.fromEntries(Object.entries(history).filter(([key]) => key >= cutoff));
}

export function summarize(
  history: History,
  now: number,
  days: number,
  entityName: (entityId: string) => string | null,
): HistorySummary {
  const start = dateKey(now - (days - 1) * 24 * 60 * 60 * 1000);
  const end = dateKey(now);

  const categoryCounts = new Map<TrackerCategory, number>();
  const entityCounts = new Map<string, number>();
  const domains = new Set<string>();
  let total = 0;

  for (const [key, day] of Object.entries(history)) {
    if (key < start || key > end) continue;

    for (const [domain, entry] of Object.entries(day)) {
      total += entry.count;
      domains.add(domain);
      categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + entry.count);
      if (entry.entityId !== null) {
        entityCounts.set(entry.entityId, (entityCounts.get(entry.entityId) ?? 0) + entry.count);
      }
    }
  }

  const byCategory: CategoryTotals = {
    [TrackerCategory.Advertising]: categoryCounts.get(TrackerCategory.Advertising) ?? 0,
    [TrackerCategory.Analytics]: categoryCounts.get(TrackerCategory.Analytics) ?? 0,
    [TrackerCategory.Behavioral]: categoryCounts.get(TrackerCategory.Behavioral) ?? 0,
    [TrackerCategory.Unknown]: categoryCounts.get(TrackerCategory.Unknown) ?? 0,
  };

  return {
    days,
    total,
    distinctDomains: domains.size,
    byCategory,
    topEntities: rankEntities(entityCounts, entityName),
  };
}

function rankEntities(
  counts: Map<string, number>,
  entityName: (entityId: string) => string | null,
): EntityCount[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([id, count]) => ({ id, name: entityName(id) ?? id, count }));
}
