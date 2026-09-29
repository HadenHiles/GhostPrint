import { dateKey } from './history';
import { estimateValue } from './value';
import { TrackerCategory } from './types';
import type { History } from './history';
import type { TrackerDetail, WeeklyReport } from './types';

const DAY_MS = 24 * 60 * 60 * 1_000;
const REPORT_DAYS = 7;

interface WindowTotals {
  total: number;
  byDomain: Map<string, number>;
  trackers: TrackerDetail[];
  entityCounts: Map<string, number>;
}

export function createWeeklyReport(
  history: History,
  now: number,
  entityName: (entityId: string) => string | null,
): WeeklyReport {
  const currentStart = dateKey(now - (REPORT_DAYS - 1) * DAY_MS);
  const currentEnd = dateKey(now);
  const previousStart = dateKey(now - (REPORT_DAYS * 2 - 1) * DAY_MS);
  const previousEnd = dateKey(now - REPORT_DAYS * DAY_MS);
  const current = summarizeWindow(history, currentStart, currentEnd, entityName);
  const previous = summarizeWindow(history, previousStart, previousEnd, entityName);
  const deltaCount = current.total - previous.total;

  return {
    weekStarting: currentStart,
    weekEnding: currentEnd,
    totalTrackers: current.total,
    previousTotal: previous.total,
    deltaCount,
    deltaPercent: previous.total === 0 ? null : (deltaCount / previous.total) * 100,
    topTrackerDomain: rankDomains(current.byDomain)[0]?.[0] ?? null,
    topEntityName: rankEntities(current.entityCounts)[0]?.[0] ?? null,
    estimatedValue: estimateValue(current.trackers, null).amount,
  };
}

function summarizeWindow(
  history: History,
  start: string,
  end: string,
  entityName: (entityId: string) => string | null,
): WindowTotals {
  const byDomain = new Map<string, number>();
  const entityCounts = new Map<string, number>();
  const trackerCounts = new Map<string, TrackerDetail>();
  let total = 0;

  for (const [date, day] of Object.entries(history)) {
    if (date < start || date > end) continue;
    for (const [domain, entry] of Object.entries(day)) {
      total += entry.count;
      byDomain.set(domain, (byDomain.get(domain) ?? 0) + entry.count);
      if (entry.entityId !== null) {
        const name = entityName(entry.entityId) ?? entry.entityId;
        entityCounts.set(name, (entityCounts.get(name) ?? 0) + entry.count);
      }

      const existing = trackerCounts.get(domain);
      trackerCounts.set(domain, {
        domain,
        entityId: entry.entityId,
        entityName: entry.entityId === null ? null : entityName(entry.entityId),
        category: entry.category ?? TrackerCategory.Unknown,
        hits: (existing?.hits ?? 0) + entry.count,
      });
    }
  }

  return { total, byDomain, trackers: [...trackerCounts.values()], entityCounts };
}

function rankDomains(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort(([domainA, countA], [domainB, countB]) =>
    countB - countA || domainA.localeCompare(domainB),
  );
}

function rankEntities(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort(([nameA, countA], [nameB, countB]) =>
    countB - countA || nameA.localeCompare(nameB),
  );
}