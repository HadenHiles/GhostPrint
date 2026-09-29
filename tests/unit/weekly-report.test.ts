import { describe, expect, it } from 'vitest';
import { addObservation } from '@/shared/history';
import type { History } from '@/shared/history';
import { createWeeklyReport } from '@/shared/weekly-report';
import { TrackerCategory } from '@/shared/types';

const DAY = 24 * 60 * 60 * 1_000;
const NOW = new Date('2026-09-29T12:00:00').getTime();
const names = new Map([['google', 'Google'], ['meta', 'Meta']]);
const entityName = (id: string) => names.get(id) ?? null;

function historyWith(values: { daysAgo: number; domain: string; entityId: string | null; count: number }[]): History {
  let history: History = {};
  for (const value of values) {
    for (let index = 0; index < value.count; index += 1) {
      history = addObservation(history, NOW - value.daysAgo * DAY, {
        domain: value.domain,
        entityId: value.entityId,
        category: value.entityId === 'google' ? TrackerCategory.Analytics : TrackerCategory.Advertising,
      });
    }
  }
  return history;
}

describe('createWeeklyReport', () => {
  it('ranks third-party domains and entities without associating first-party sites', () => {
    const history = historyWith([
      { daysAgo: 0, domain: 'google-analytics.com', entityId: 'google', count: 3 },
      { daysAgo: 2, domain: 'facebook.net', entityId: 'meta', count: 2 },
      { daysAgo: 8, domain: 'google-analytics.com', entityId: 'google', count: 4 },
    ]);

    expect(createWeeklyReport(history, NOW, entityName)).toEqual({
      weekStarting: '2026-09-23',
      weekEnding: '2026-09-29',
      totalTrackers: 5,
      previousTotal: 4,
      deltaCount: 1,
      deltaPercent: 25,
      topTrackerDomain: 'google-analytics.com',
      topEntityName: 'Google',
      estimatedValue: 0.0075,
    });
  });

  it('uses null percent delta when there is no previous-week baseline', () => {
    const report = createWeeklyReport(
      historyWith([{ daysAgo: 0, domain: 'unknown.example', entityId: null, count: 1 }]),
      NOW,
      entityName,
    );

    expect(report.deltaPercent).toBeNull();
    expect(report.deltaCount).toBe(1);
    expect(report.topEntityName).toBeNull();
  });
});