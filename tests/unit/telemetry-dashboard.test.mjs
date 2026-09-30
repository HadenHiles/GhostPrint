import { describe, expect, it } from 'vitest';
import {
  aggregateTelemetry,
  renderMarkdown,
  validateTelemetryPayload,
} from '../../tools/telemetry-dashboard.mjs';

const hour = (year, month, day, hourOfDay = 12) =>
  Math.floor(Date.UTC(year, month - 1, day, hourOfDay) / 3_600_000);

const batch = (day, counts, month = 9) => ({
  version: 1,
  cohort: '0123456789abcdef0123456789abcdef',
  hourBucket: hour(2026, month, day),
  counts,
});

describe('telemetry dashboard', () => {
  it('accepts only count-only Worker payloads', () => {
    expect(validateTelemetryPayload(batch(15, { popup_opened: 2 }))).toBe(true);
    expect(validateTelemetryPayload({ ...batch(15, { popup_opened: 2 }), url: 'https://example.com' })).toBe(false);
    expect(validateTelemetryPayload(batch(15, { page_domain: 1 }))).toBe(false);
  });

  it('aggregates the inclusive UTC date range and ignores outside batches', () => {
    const summary = aggregateTelemetry(
      [
        batch(14, { popup_opened: 100 }),
        batch(15, { weekly_report_viewed: 8, share_completed: 2 }),
        batch(16, { w4_retained: 1 }),
        batch(17, { popup_opened: 100 }),
      ],
      '2026-09-15',
      '2026-09-16',
    );

    expect(summary.batchCount).toBe(2);
    expect(summary.counts).toMatchObject({
      weekly_report_viewed: 8,
      share_completed: 2,
      w4_retained: 1,
      popup_opened: 0,
    });
  });

  it('reports event and referral rates with non-identity caveats', () => {
    const summary = aggregateTelemetry(
      [batch(15, { weekly_report_viewed: 8, share_completed: 2, w4_retained: 1 })],
      '2026-09-15',
      '2026-09-15',
    );
    const report = renderMarkdown(summary, { installs: 100, utmVisits: 5, priorInstalls: 40 });

    expect(report).toContain('25.00% (2 completions / 8 report views)');
    expect(report).toContain('5.00% (5 visits / 100 installs)');
    expect(report).toContain('2.50% (1 returns / 40 installs');
    expect(report).toContain('not a unique-user rate');
    expect(report).toContain('no stable installation identifier');
  });

  it('renders undefined rates as n/a when their denominators are zero', () => {
    const summary = aggregateTelemetry([], '2026-09-15', '2026-09-15');
    const report = renderMarkdown(summary, { installs: 0, utmVisits: 0, priorInstalls: 0 });

    expect(report.match(/n\/a/g)).toHaveLength(3);
  });
});