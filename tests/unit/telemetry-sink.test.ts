import { describe, expect, it } from 'vitest';
import worker, { deleteExpiredObjects, validatePayload } from '../../services/telemetry-sink/src/index';

const NOW = Date.UTC(2026, 8, 29, 12);
const hourBucket = Math.floor(NOW / 3_600_000);
const EXTENSION_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const payload = {
  version: 1,
  cohort: '0123456789abcdef0123456789abcdef',
  hourBucket,
  counts: { popup_opened: 4, share_clicked: 1 },
};

describe('telemetry sink validation', () => {
  it('accepts count-only hourly batches and rejects browsing fields', () => {
    expect(validatePayload(payload, NOW)).toMatchObject(payload);
    expect(validatePayload({ ...payload, url: 'https://example.com' }, NOW)).toBeNull();
    expect(validatePayload({ ...payload, counts: { page_domain: 1 } }, NOW)).toBeNull();
    expect(validatePayload({ ...payload, counts: { popup_opened: 0 } }, NOW)).toBeNull();
  });

  it('rejects malformed or out-of-window cohort buckets', () => {
    expect(validatePayload({ ...payload, cohort: 'stable-install-id' }, NOW)).toBeNull();
    expect(validatePayload({ ...payload, hourBucket: hourBucket + 1 }, NOW)).toBeNull();
    expect(validatePayload({ ...payload, hourBucket: hourBucket - 24 * 9 }, NOW)).toBeNull();
  });

  it('writes validated batches to object storage and returns no content', async () => {
    const writes: { key: string; body: string }[] = [];
    const response = await worker.fetch(
      new Request('https://sink.example/v1/events', {
        method: 'POST',
        headers: {
          Origin: EXTENSION_ORIGIN,
          'Content-Type': 'application/json',
          'X-GhostPrint-Purpose': 'count-only-v1',
        },
        body: JSON.stringify(payload),
      }),
      {
        ALLOWED_ORIGIN: EXTENSION_ORIGIN,
        EVENTS: {
          put: (key, body) => {
            writes.push({ key, body });
            return Promise.resolve(undefined);
          },
          list: () => Promise.resolve({ objects: [], truncated: false }),
          delete: () => Promise.resolve(undefined),
        },
      },
    );

    expect(response.status).toBe(204);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toMatch(/^v1\/2026-09-29\/\d+\//);
    expect(JSON.parse(writes[0]?.body ?? '{}')).toMatchObject(payload);
  });

  it('rejects other telemetry purposes', async () => {
    const response = await worker.fetch(
      new Request('https://sink.example/v1/events', {
        method: 'POST',
        headers: { Origin: EXTENSION_ORIGIN, 'X-GhostPrint-Purpose': 'anything-else' },
        body: JSON.stringify(payload),
      }),
      {
        ALLOWED_ORIGIN: EXTENSION_ORIGIN,
        EVENTS: {
          put: () => Promise.resolve(undefined),
          list: () => Promise.resolve({ objects: [], truncated: false }),
          delete: () => Promise.resolve(undefined),
        },
      },
    );
    expect(response.status).toBe(400);
  });

  it('rejects requests from an unconfigured origin', async () => {
    const response = await worker.fetch(
      new Request('https://sink.example/v1/events', {
        method: 'POST',
        headers: { Origin: 'https://random.example' },
        body: JSON.stringify(payload),
      }),
      {
        ALLOWED_ORIGIN: EXTENSION_ORIGIN,
        EVENTS: {
          put: () => Promise.resolve(undefined),
          list: () => Promise.resolve({ objects: [], truncated: false }),
          delete: () => Promise.resolve(undefined),
        },
      },
    );
    expect(response.status).toBe(403);
  });

  it('deletes objects older than 30 days', async () => {
    const deleted: string[] = [];
    const bucket = {
      put: () => Promise.resolve(undefined),
      list: () => Promise.resolve({
        objects: [
          { key: 'v1/2026-08-01/496000/a.json' },
          { key: 'v1/2026-09-01/498000/b.json' },
        ],
        truncated: false,
      }),
      delete: (key: string) => {
        deleted.push(key);
        return Promise.resolve(undefined);
      },
    };
    const count = await deleteExpiredObjects(bucket, Date.UTC(2026, 8, 29));
    expect(count).toBe(1);
    expect(deleted).toEqual(['v1/2026-08-01/496000/a.json']);
  });
});