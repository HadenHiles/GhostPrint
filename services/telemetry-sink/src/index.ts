export const TELEMETRY_METRICS = [
  'weekly_report_viewed',
  'share_clicked',
  'share_completed',
  'xray_toggled',
  'popup_opened',
  'w4_retained',
] as const;

export type TelemetryMetric = (typeof TELEMETRY_METRICS)[number];

export interface TelemetryPayload {
  version: 1;
  cohort: string;
  hourBucket: number;
  counts: Partial<Record<TelemetryMetric, number>>;
}

export interface TelemetryBucket {
  put(
    key: string,
    value: string,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  list(options: { prefix: string; cursor?: string; limit: number }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  delete(key: string): Promise<unknown>;
}

export interface Env {
  EVENTS: TelemetryBucket;
  ALLOWED_ORIGIN: string;
}

const MAX_BODY_BYTES = 4_096;
const MAX_COUNT_PER_METRIC = 100_000;
const MAX_BUCKET_AGE_HOURS = 24 * 8;
const RETENTION_DAYS = 30;

function corsHeaders(origin: string) {
  return {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-GhostPrint-Purpose',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') ?? '';
    if (env.ALLOWED_ORIGIN === '' || origin !== env.ALLOWED_ORIGIN) {
      return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    const headers = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (url.pathname !== '/v1/events' || request.method !== 'POST') {
      return jsonResponse({ error: 'not_found' }, 404, headers);
    }
    if (request.headers.get('x-ghostprint-purpose') !== 'count-only-v1') {
      return jsonResponse({ error: 'unsupported_purpose' }, 400, headers);
    }

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: 'payload_too_large' }, 413, headers);

    let value: unknown;
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'payload_too_large' }, 413, headers);
      }
      value = JSON.parse(body) as unknown;
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400, headers);
    }

    const payload = validatePayload(value, Date.now());
    if (payload === null) return jsonResponse({ error: 'invalid_payload' }, 400, headers);

    const date = new Date(payload.hourBucket * 3_600_000).toISOString().slice(0, 10);
    const key = `v1/${date}/${payload.hourBucket}/${crypto.randomUUID()}.json`;
    await env.EVENTS.put(key, JSON.stringify(payload), {
      httpMetadata: { contentType: 'application/json' },
    });
    return new Response(null, { status: 204, headers });
  },

  async scheduled(_event: { scheduledTime: number }, env: Env): Promise<void> {
    await deleteExpiredObjects(env.EVENTS, Date.now());
  },
};

export async function deleteExpiredObjects(bucket: TelemetryBucket, now: number): Promise<number> {
  const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const options = cursor === undefined
      ? { prefix: 'v1/', limit: 1_000 }
      : { prefix: 'v1/', cursor, limit: 1_000 };
    const page = await bucket.list(options);
    const expired = page.objects.filter((object) => {
      const date = object.key.split('/')[1];
      return date !== undefined && date < cutoff;
    });
    await Promise.all(expired.map((object) => bucket.delete(object.key)));
    deleted += expired.length;
    cursor = page.truncated ? page.cursor : undefined;
    if (page.truncated && cursor === undefined) break;
  } while (cursor !== undefined);

  return deleted;
}

export function validatePayload(value: unknown, now: number): TelemetryPayload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((key) => !['version', 'cohort', 'hourBucket', 'counts'].includes(key))) {
    return null;
  }
  if (
    payload.version !== 1 ||
    typeof payload.cohort !== 'string' ||
    !/^[a-f0-9]{32}$/.test(payload.cohort) ||
    typeof payload.hourBucket !== 'number' ||
    !Number.isSafeInteger(payload.hourBucket) ||
    payload.hourBucket % 1 !== 0
  ) {
    return null;
  }

  const currentHour = Math.floor(now / 3_600_000);
  const age = currentHour - payload.hourBucket;
  if (age < 0 || age > MAX_BUCKET_AGE_HOURS) return null;

  if (typeof payload.counts !== 'object' || payload.counts === null || Array.isArray(payload.counts)) {
    return null;
  }
  const rawCounts = payload.counts as Record<string, unknown>;
  const counts: Partial<Record<TelemetryMetric, number>> = {};
  let total = 0;
  for (const [metric, count] of Object.entries(rawCounts)) {
    if (!(TELEMETRY_METRICS as readonly string[]).includes(metric)) return null;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT_PER_METRIC) {
      return null;
    }
    total += count;
    if (total > MAX_COUNT_PER_METRIC) return null;
    counts[metric as TelemetryMetric] = count;
  }
  if (Object.keys(counts).length === 0) return null;

  return {
    version: 1,
    cohort: payload.cohort,
    hourBucket: payload.hourBucket,
    counts,
  };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}