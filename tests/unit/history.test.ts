import { describe, expect, it } from 'vitest';
import {
  addObservation,
  dateKey,
  prune,
  RETENTION_DAYS,
  summarize,
} from '@/shared/history';
import type { History } from '@/shared/history';
import { TrackerCategory } from '@/shared/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-28T12:00:00').getTime();

const names = new Map([
  ['google', 'Google'],
  ['meta', 'Meta'],
]);
const lookup = (id: string) => names.get(id) ?? null;

const ga = { domain: 'google-analytics.com', entityId: 'google', category: TrackerCategory.Analytics };
const fb = { domain: 'facebook.net', entityId: 'meta', category: TrackerCategory.Advertising };
const unknown = { domain: 'mystery.example', entityId: null, category: TrackerCategory.Unknown };

describe('dateKey', () => {
  it('formats as zero-padded local YYYY-MM-DD', () => {
    expect(dateKey(new Date('2026-01-05T10:00:00').getTime())).toBe('2026-01-05');
    expect(dateKey(new Date('2026-12-31T23:59:59').getTime())).toBe('2026-12-31');
  });

  it('uses local time, so late-evening activity stays on the same day', () => {
    // A UTC-based key would roll this into the next day for western timezones.
    const lateEvening = new Date('2026-06-15T23:30:00').getTime();
    expect(dateKey(lateEvening)).toBe('2026-06-15');
  });

  it('sorts lexicographically in chronological order', () => {
    const keys = [NOW, NOW - 40 * DAY, NOW - 400 * DAY].map(dateKey);
    expect([...keys].sort()).toEqual([keys[2], keys[1], keys[0]]);
  });
});

describe('addObservation', () => {
  it('creates an entry on first sighting', () => {
    const history = addObservation({}, NOW, ga);
    expect(history[dateKey(NOW)]?.['google-analytics.com']).toEqual({
      entityId: 'google',
      category: TrackerCategory.Analytics,
      count: 1,
    });
  });

  it('increments an existing entry without changing its attribution', () => {
    let history = addObservation({}, NOW, ga);
    history = addObservation(history, NOW, ga);
    expect(history[dateKey(NOW)]?.['google-analytics.com']?.count).toBe(2);
    expect(history[dateKey(NOW)]?.['google-analytics.com']?.entityId).toBe('google');
  });

  it('keeps separate buckets per day', () => {
    let history = addObservation({}, NOW - DAY, ga);
    history = addObservation(history, NOW, ga);
    expect(Object.keys(history)).toHaveLength(2);
  });

  it('does not mutate the input', () => {
    const original: History = {};
    addObservation(original, NOW, ga);
    expect(original).toEqual({});
  });

  it('stores no URL, title, or timestamp beyond the day', () => {
    const entry = addObservation({}, NOW, ga)[dateKey(NOW)]?.['google-analytics.com'];
    expect(Object.keys(entry ?? {}).sort()).toEqual(['category', 'count', 'entityId']);
  });
});

describe('prune', () => {
  it('keeps days inside the retention window', () => {
    let history = addObservation({}, NOW - 89 * DAY, ga);
    history = addObservation(history, NOW, ga);
    expect(Object.keys(prune(history, NOW))).toHaveLength(2);
  });

  it('drops days beyond the retention window', () => {
    let history = addObservation({}, NOW - 200 * DAY, ga);
    history = addObservation(history, NOW, ga);

    const pruned = prune(history, NOW);
    expect(Object.keys(pruned)).toEqual([dateKey(NOW)]);
  });

  it('honours a custom retention window', () => {
    let history = addObservation({}, NOW - 5 * DAY, ga);
    history = addObservation(history, NOW, ga);
    expect(Object.keys(prune(history, NOW, 2))).toEqual([dateKey(NOW)]);
  });

  it('defaults to 90 days', () => {
    expect(RETENTION_DAYS).toBe(90);
  });
});

describe('summarize', () => {
  function seed(): History {
    let history = addObservation({}, NOW, ga);
    history = addObservation(history, NOW, ga);
    history = addObservation(history, NOW - DAY, fb);
    history = addObservation(history, NOW - 2 * DAY, unknown);
    return history;
  }

  it('totals encounters across the window', () => {
    const summary = summarize(seed(), NOW, 7, lookup);
    expect(summary.total).toBe(4);
    expect(summary.distinctDomains).toBe(3);
  });

  it('breaks totals down by category', () => {
    const summary = summarize(seed(), NOW, 7, lookup);
    expect(summary.byCategory[TrackerCategory.Analytics]).toBe(2);
    expect(summary.byCategory[TrackerCategory.Advertising]).toBe(1);
    expect(summary.byCategory[TrackerCategory.Unknown]).toBe(1);
    expect(summary.byCategory[TrackerCategory.Behavioral]).toBe(0);
  });

  it('ranks entities by encounters and resolves display names', () => {
    const summary = summarize(seed(), NOW, 7, lookup);
    expect(summary.topEntities).toEqual([
      { id: 'google', name: 'Google', count: 2 },
      { id: 'meta', name: 'Meta', count: 1 },
    ]);
  });

  it('excludes days outside the window', () => {
    const history = addObservation(seed(), NOW - 10 * DAY, fb);
    expect(summarize(history, NOW, 7, lookup).total).toBe(4);
    expect(summarize(history, NOW, 30, lookup).total).toBe(5);
  });

  it('includes today and the boundary day of the window', () => {
    let history = addObservation({}, NOW, ga);
    history = addObservation(history, NOW - 6 * DAY, fb);
    expect(summarize(history, NOW, 7, lookup).total).toBe(2);
  });

  it('caps the entity list at five', () => {
    let history: History = {};
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      history = addObservation(history, NOW, {
        domain: `${id}.example`,
        entityId: id,
        category: TrackerCategory.Advertising,
      });
    }
    expect(summarize(history, NOW, 7, lookup).topEntities).toHaveLength(5);
  });

  it('falls back to the entity id when the name is unknown', () => {
    const history = addObservation({}, NOW, {
      domain: 'x.example',
      entityId: 'mystery',
      category: TrackerCategory.Advertising,
    });
    expect(summarize(history, NOW, 7, lookup).topEntities[0]?.name).toBe('mystery');
  });

  it('summarizes an empty history without inventing data', () => {
    const summary = summarize({}, NOW, 7, lookup);
    expect(summary.total).toBe(0);
    expect(summary.distinctDomains).toBe(0);
    expect(summary.topEntities).toEqual([]);
  });
});
