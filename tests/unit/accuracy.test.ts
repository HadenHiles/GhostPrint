import { describe, expect, it } from 'vitest';
import bigcommerce from '../fixtures/ground-truth/bigcommerce-synthetic.json';
import shopify from '../fixtures/ground-truth/shopify-synthetic.json';
import woocommerce from '../fixtures/ground-truth/woocommerce-synthetic.json';
import { classify } from '@/background/classifier';
import { classifyGroundTruth, measureAccuracy } from '@/shared/accuracy';
import type { GroundTruthRequest } from '@/shared/accuracy';
import type { TrackerCategory } from '@/shared/types';

type Fixture = {
  siteId: string;
  siteUrl: string;
  platform: string;
  captureType: string;
  labeledBy: string;
  labeledAt: string;
  requests: {
    url: string;
    expectedTracker: boolean;
    expectedCategory?: TrackerCategory;
    expectedEntityId?: string;
  }[];
};

const fixtures = [bigcommerce, shopify, woocommerce] as Fixture[];
const requests: GroundTruthRequest[] = fixtures.flatMap((fixture) => fixture.requests);

function classifyForAccuracy(url: string) {
  // Accuracy measures known-dictionary attribution; unknown third parties are
  // intentionally counted by the runtime ledger but are not a dictionary hit.
  return classify(url);
}

describe('ground-truth corpus contract', () => {
  it('contains labeled metadata for every fixture', () => {
    for (const fixture of fixtures) {
      expect(fixture.siteId).toMatch(/^[a-z0-9-]+$/);
      expect(fixture.siteUrl).toMatch(/^https:\/\//);
      expect(['Shopify', 'WooCommerce', 'BigCommerce']).toContain(fixture.platform);
      expect(fixture.captureType).toBe('synthetic-regression');
      expect(fixture.labeledBy.length).toBeGreaterThan(0);
      expect(fixture.labeledAt).toMatch(/^2026-09-28$/);
      expect(fixture.requests.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate URLs within the corpus', () => {
    const urls = requests.map((request) => request.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('offline accuracy evaluator', () => {
  const results = classifyGroundTruth(requests, classifyForAccuracy);
  const metrics = measureAccuracy(results);

  it('replays every labeled request without network access', () => {
    expect(results).toHaveLength(15);
    expect(results.every((result) => result.url.startsWith('https://'))).toBe(true);
  });

  it('reports the expected synthetic confusion counts', () => {
    expect(metrics).toMatchObject({
      total: 15,
      truePositives: 6,
      trueNegatives: 8,
      falsePositives: 0,
      falseNegatives: 1,
      entityMatches: 6,
      entityMismatches: 0,
    });
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBeCloseTo(6 / 7);
  });

  it('reports category confusion for labeled tracker requests', () => {
    expect(metrics.categoryConfusion).toEqual({
      '0->0': 2,
      '1->1': 1,
      '2->2': 3,
    });
  });

  it('does not treat an unknown tracker as a known positive', () => {
    const unknown = results.find((result) => result.url.includes('an-unknown-tracker'));
    expect(unknown).toMatchObject({
      expectedTracker: true,
      predictedTracker: false,
    });
    expect(metrics.falseNegatives).toBeGreaterThan(0);
  });
});
