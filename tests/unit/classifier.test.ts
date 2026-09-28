import { describe, expect, it } from 'vitest';
import { classify, classifyUnknown, dictionarySize, getEntity } from '@/background/classifier';
import { TrackerCategory } from '@/shared/types';
import type { TrackerDictionary } from '@/shared/types';
import rawTrackerData from '@/data/trackers.json';

const trackerData = rawTrackerData as unknown as TrackerDictionary;

describe('dictionary artifact', () => {
  it('is non-empty and within the bundle budget', () => {
    expect(dictionarySize).toBeGreaterThan(150);
    expect(JSON.stringify(trackerData).length).toBeLessThan(120 * 1024);
  });

  it('maps every host to a declared entity', () => {
    for (const [host, [entityId]] of Object.entries(trackerData.hosts)) {
      expect(getEntity(entityId), `${host} -> ${entityId}`).not.toBeNull();
    }
  });

  it('gives every entity at least one host', () => {
    const used = new Set(Object.values(trackerData.hosts).map(([id]) => id));
    for (const id of Object.keys(trackerData.entities)) expect(used.has(id)).toBe(true);
  });

  it('uses only valid category codes', () => {
    for (const [, category] of Object.values(trackerData.hosts)) {
      expect([0, 1, 2]).toContain(category);
    }
  });

  it('contains no shared-CDN apex domains', () => {
    // Regression guard: collapsing filter-rule hosts to eTLD+1 once put these in.
    for (const apex of [
      'cloudfront.net',
      'amazonaws.com',
      'akamaihd.net',
      'azureedge.net',
      'cloudflare.net',
      'fastly.net',
      'googleapis.com',
      'gstatic.com',
      'jsdelivr.net',
      'unpkg.com',
    ]) {
      expect(Object.keys(trackerData.hosts)).not.toContain(apex);
    }
  });
});

describe('classify', () => {
  it('resolves a seeded tracker to its corporate parent', () => {
    const result = classify('https://www.google-analytics.com/collect?v=2');
    expect(result).toMatchObject({
      domain: 'google-analytics.com',
      entityId: 'google',
      entityName: 'Google',
      category: TrackerCategory.Analytics,
    });
  });

  it('matches subdomains against a less specific entry', () => {
    const result = classify('https://deeply.nested.google-analytics.com/x');
    expect(result?.entityId).toBe('google');
    expect(result?.host).toBe('google-analytics.com');
  });

  it('attributes acquisitions to the current owner', () => {
    expect(classify('https://static.hotjar.com/c/hotjar-1.js')?.entityId).toBe('contentsquare');
    expect(classify('https://www.clarity.ms/tag/abc')?.entityId).toBe('microsoft');
    expect(classify('https://ib.adnxs.com/ut/v3')?.entityId).toBe('microsoft');
  });

  it('forces session-replay vendors into the behavioral bucket', () => {
    for (const url of [
      'https://rs.fullstory.com/rec',
      'https://static.hotjar.com/x.js',
      'https://www.clarity.ms/tag/x',
      'https://cdn.logrocket.com/LogRocket.min.js',
      'https://api.smartlook.com/rec',
      'https://cdn.mouseflow.com/mf.js',
    ]) {
      expect(classify(url)?.category, url).toBe(TrackerCategory.Behavioral);
    }
  });

  it('does not classify shared CDNs or unrelated hosts', () => {
    for (const url of [
      'https://d2v9ipibika81v.cloudfront.net/asset.js',
      'https://my-bucket.s3.amazonaws.com/img.png',
      'https://cdn.jsdelivr.net/npm/x',
      'https://example.com/app.js',
      'https://news.bbc.co.uk/',
    ]) {
      expect(classify(url), url).toBeNull();
    }
  });

  it('rejects non-HTTP and unparseable input', () => {
    for (const url of ['about:blank', 'chrome://x', 'data:text/js,0', 'garbage', '']) {
      expect(classify(url), url).toBeNull();
    }
  });
});

describe('classifyUnknown', () => {
  it('counts unmatched third parties rather than dropping them', () => {
    const result = classifyUnknown('https://weird.tracker.example/px');
    expect(result).toMatchObject({
      domain: 'tracker.example',
      entityId: null,
      category: TrackerCategory.Unknown,
    });
  });

  it('still rejects unusable input', () => {
    expect(classifyUnknown('about:blank')).toBeNull();
    expect(classifyUnknown('http://localhost/x')).toBeNull();
  });
});
