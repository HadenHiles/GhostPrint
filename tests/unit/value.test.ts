import { describe, expect, it } from 'vitest';
import valueModel from '@/data/value-model.json';
import { TrackerCategory } from '@/shared/types';
import type { TrackerDetail } from '@/shared/types';
import { classifyPageVertical, estimateValue } from '@/shared/value';

const details: TrackerDetail[] = [
  { domain: 'tracker.example', entityId: null, entityName: null, category: TrackerCategory.Advertising, hits: 10 },
  { domain: 'metrics.example', entityId: null, entityName: null, category: TrackerCategory.Analytics, hits: 5 },
];

describe('illustrative value estimate', () => {
  it('attaches a source URL and retrieval date to every numeric input', () => {
    const sourced = [
      valueModel.baseCpmUsd,
      ...Object.values(valueModel.categoryWeights),
      ...Object.values(valueModel.verticalMultipliers),
    ];

    for (const entry of sourced) {
      expect(Number.isFinite(entry.value)).toBe(true);
      expect(entry.source).toMatch(/^https:\/\//);
      expect(entry.retrievedAt).toBe('2026-09-29');
    }
  });

  it('converts request events to a CPM fee-equivalent without claiming earnings', () => {
    expect(estimateValue(details, 'example.com')).toEqual({
      amount: 0.0225,
      currency: 'USD',
      vertical: 'general',
    });
  });

  it('uses known domain verticals and defaults unknown sites to general', () => {
    expect(classifyPageVertical('webmd.com')).toBe('health');
    expect(classifyPageVertical('shop.example')).toBe('general');
    expect(classifyPageVertical(null)).toBe('general');
  });

  it('ignores non-positive or non-finite event counts', () => {
    const invalid: TrackerDetail[] = [
      { ...details[0]!, hits: -1 },
      { ...details[1]!, hits: Number.NaN },
    ];
    expect(estimateValue(invalid, null).amount).toBe(0);
  });
});