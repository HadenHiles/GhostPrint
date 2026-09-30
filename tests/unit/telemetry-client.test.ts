import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendTelemetryBatch } from '@/shared/telemetry-client';

const batch = {
  cohort: '0123456789abcdef0123456789abcdef',
  hourBucket: 497_412,
  counts: { popup_opened: 2 },
};

afterEach(() => vi.unstubAllGlobals());

describe('consented telemetry client', () => {
  it('is inert when consent is not granted or the endpoint is not HTTPS', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(await sendTelemetryBatch('undecided', 'https://sink.example/v1/events', batch)).toBe(false);
    expect(await sendTelemetryBatch('granted', '', batch)).toBe(false);
    expect(await sendTelemetryBatch('granted', 'http://sink.example/v1/events', batch)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends only the aggregate batch without cookies or referrer when consented', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);

    expect(await sendTelemetryBatch('granted', 'https://sink.example/v1/events', batch)).toBe(true);
    const [endpoint, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://sink.example/v1/events');
    expect(options.credentials).toBe('omit');
    expect(options.referrerPolicy).toBe('no-referrer');
    expect(new Headers(options.headers).get('x-ghostprint-purpose')).toBe('count-only-v1');
    const body = typeof options.body === 'string' ? options.body : '';
    expect(JSON.parse(body)).toEqual({ version: 1, ...batch });
  });
});