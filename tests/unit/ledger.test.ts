import { describe, expect, it } from 'vitest';
import {
  createLedger,
  MAX_TRACKED_REQUESTS,
  recordHit,
  sortedTrackers,
  summarize,
} from '@/shared/ledger';
import { TrackerCategory } from '@/shared/types';

const NOW = 1_700_000_000_000;
const names = new Map([
  ['google', 'Google'],
  ['meta', 'Meta'],
]);
const lookup = (id: string) => names.get(id) ?? null;

function ledger() {
  return createLedger(7, 'example.com', NOW);
}

describe('recordHit', () => {
  it('reports only the first sighting of a domain as new', () => {
    const l = ledger();
    const observation = {
      domain: 'doubleclick.net',
      entityId: 'google',
      category: TrackerCategory.Advertising,
    };

    expect(recordHit(l, observation, NOW)).toBe(true);
    expect(recordHit(l, observation, NOW + 10)).toBe(false);
    expect(l.trackers['doubleclick.net']?.hits).toBe(2);
    expect(l.trackers['doubleclick.net']?.firstSeenAt).toBe(NOW);
  });

  it('counts every third-party request, including repeats', () => {
    const l = ledger();
    for (let i = 0; i < 5; i += 1) {
      recordHit(l, { domain: 'a.com', entityId: null, category: TrackerCategory.Unknown }, NOW);
    }
    expect(l.requests).toBe(5);
  });

  it('stops incrementing hits past the cap but keeps counting new domains', () => {
    const l = ledger();
    const noisy = { domain: 'noisy.com', entityId: null, category: TrackerCategory.Unknown };

    for (let i = 0; i <= MAX_TRACKED_REQUESTS + 50; i += 1) recordHit(l, noisy, NOW);

    expect(l.capped).toBe(true);
    expect(l.trackers['noisy.com']?.hits).toBe(MAX_TRACKED_REQUESTS);

    const isNew = recordHit(
      l,
      { domain: 'fresh.com', entityId: 'meta', category: TrackerCategory.Advertising },
      NOW,
    );
    expect(isNew).toBe(true);
    expect(Object.keys(l.trackers)).toHaveLength(2);
  });
});

describe('summarize', () => {
  it('counts distinct domains per category', () => {
    const l = ledger();
    recordHit(l, { domain: 'a.com', entityId: 'google', category: TrackerCategory.Advertising }, NOW);
    recordHit(l, { domain: 'a.com', entityId: 'google', category: TrackerCategory.Advertising }, NOW);
    recordHit(l, { domain: 'b.com', entityId: 'google', category: TrackerCategory.Analytics }, NOW);
    recordHit(l, { domain: 'c.com', entityId: null, category: TrackerCategory.Unknown }, NOW);

    const summary = summarize(l, lookup);
    expect(summary.total).toBe(3);
    expect(summary.byCategory[TrackerCategory.Advertising]).toBe(1);
    expect(summary.byCategory[TrackerCategory.Analytics]).toBe(1);
    expect(summary.byCategory[TrackerCategory.Unknown]).toBe(1);
  });

  it('picks the entity owning the most distinct domains', () => {
    const l = ledger();
    recordHit(l, { domain: 'a.com', entityId: 'google', category: TrackerCategory.Advertising }, NOW);
    recordHit(l, { domain: 'b.com', entityId: 'google', category: TrackerCategory.Analytics }, NOW);
    recordHit(l, { domain: 'c.com', entityId: 'meta', category: TrackerCategory.Advertising }, NOW);

    expect(summarize(l, lookup).topEntity).toEqual({ id: 'google', name: 'Google', count: 2 });
  });

  it('breaks ties deterministically so the top entity does not flicker', () => {
    const l = ledger();
    recordHit(l, { domain: 'a.com', entityId: 'meta', category: TrackerCategory.Advertising }, NOW);
    recordHit(l, { domain: 'b.com', entityId: 'google', category: TrackerCategory.Advertising }, NOW);

    expect(summarize(l, lookup).topEntity?.id).toBe('google');
  });

  it('ignores unattributed domains when choosing the top entity', () => {
    const l = ledger();
    recordHit(l, { domain: 'a.com', entityId: null, category: TrackerCategory.Unknown }, NOW);
    recordHit(l, { domain: 'b.com', entityId: null, category: TrackerCategory.Unknown }, NOW);
    recordHit(l, { domain: 'c.com', entityId: 'meta', category: TrackerCategory.Advertising }, NOW);

    expect(summarize(l, lookup).topEntity?.id).toBe('meta');
  });

  it('falls back to the entity id when no display name is known', () => {
    const l = ledger();
    recordHit(l, { domain: 'a.com', entityId: 'mystery', category: TrackerCategory.Advertising }, NOW);
    expect(summarize(l, lookup).topEntity).toEqual({ id: 'mystery', name: 'mystery', count: 1 });
  });

  it('summarizes an empty ledger without inventing data', () => {
    const summary = summarize(ledger(), lookup);
    expect(summary.total).toBe(0);
    expect(summary.topEntity).toBeNull();
    expect(summary.capped).toBe(false);
  });
});

describe('sortedTrackers', () => {
  it('orders by hits then domain', () => {
    const l = ledger();
    recordHit(l, { domain: 'b.com', entityId: null, category: TrackerCategory.Unknown }, NOW);
    recordHit(l, { domain: 'a.com', entityId: null, category: TrackerCategory.Unknown }, NOW);
    recordHit(l, { domain: 'c.com', entityId: null, category: TrackerCategory.Unknown }, NOW);
    recordHit(l, { domain: 'c.com', entityId: null, category: TrackerCategory.Unknown }, NOW);

    expect(sortedTrackers(l).map((t) => t.domain)).toEqual(['c.com', 'a.com', 'b.com']);
  });
});
