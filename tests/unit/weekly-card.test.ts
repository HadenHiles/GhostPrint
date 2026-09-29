import { describe, expect, it } from 'vitest';
import { buildShareText } from '@/popup/weekly-card';
import type { WeeklyReport } from '@/shared/types';

const report: WeeklyReport = {
  weekStarting: '2026-09-23',
  weekEnding: '2026-09-29',
  totalTrackers: 4,
  previousTotal: 3,
  deltaCount: 1,
  deltaPercent: 33.333,
  topTrackerDomain: 'google-analytics.com',
  topEntityName: 'Google',
  estimatedValue: 0.006,
};

describe('weekly report share text', () => {
  it('includes the tracker domain and a permanent estimate caveat by default', () => {
    const text = buildShareText(report, false);
    expect(text).toContain('google-analytics.com');
    expect(text).toContain('Estimate only; not earnings, compensation, or a data sale price.');
  });

  it('redacts the tracker domain when requested', () => {
    const text = buildShareText(report, true);
    expect(text).toContain('Top tracker domain: redacted.');
    expect(text).not.toContain('google-analytics.com');
  });
});