import { readLocal, writeLocal } from '@/shared/storage';
import { isSecureTelemetryEndpoint, sendTelemetryBatch, TELEMETRY_ENDPOINT } from '@/shared/telemetry-client';
import type { TelemetryMetric } from '@/shared/telemetry-types';

const FLUSH_ALARM = 'ghostprint-telemetry-flush';
const HOUR_MS = 60 * 60 * 1_000;
const WEEK_MS = 7 * 24 * HOUR_MS;

let flushInFlight: Promise<void> | null = null;

export function installTelemetry(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FLUSH_ALARM) void flushTelemetry();
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && ('telemetryConsent' in changes || 'settings' in changes)) {
      void syncFlushAlarm();
    }
  });
  void syncFlushAlarm();
}

export async function recordTelemetryMetric(metric: TelemetryMetric): Promise<boolean> {
  const state = await readLocal();
  if (state.telemetryConsent !== 'granted' || !isSecureTelemetryEndpoint(TELEMETRY_ENDPOINT)) return false;

  const now = Date.now();
  const week = Math.floor(now / WEEK_MS);
  const cohort = state.telemetryCohort?.week === week
    ? state.telemetryCohort
    : { week, token: randomToken() };
  const hourBucket = Math.floor(now / HOUR_MS);
  let pending = [...state.telemetryPending];
  const current = pending.find((batch) => batch.cohort === cohort.token && batch.hourBucket === hourBucket);
  const countsMap = new Map<TelemetryMetric, number>(
    Object.entries(current?.counts ?? {}) as [TelemetryMetric, number][],
  );
  countsMap.set(metric, (countsMap.get(metric) ?? 0) + 1);

  const retained =
    state.installedAt > 0 && now - state.installedAt >= 28 * 24 * HOUR_MS && !state.w4TelemetryRecorded;
  if (retained) countsMap.set('w4_retained', (countsMap.get('w4_retained') ?? 0) + 1);

  const nextBatch = {
    cohort: cohort.token,
    hourBucket,
    counts: Object.fromEntries(countsMap) as Partial<Record<TelemetryMetric, number>>,
  };
  pending = current === undefined
    ? [...pending, nextBatch]
    : pending.map((batch) => batch === current ? nextBatch : batch);

  await writeLocal({
    telemetryCohort: cohort,
    telemetryPending: pending.slice(-168),
    ...(retained ? { w4TelemetryRecorded: true } : {}),
  });
  const latest = await readLocal();
  if (latest.telemetryConsent !== 'granted') {
    await writeLocal({ telemetryCohort: null, telemetryPending: [], w4TelemetryRecorded: false });
    return false;
  }
  return true;
}

export async function flushTelemetry(): Promise<void> {
  if (flushInFlight !== null) return flushInFlight;
  flushInFlight = flushReadyBuckets().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function flushReadyBuckets(): Promise<void> {
  const state = await readLocal();
  if (state.telemetryConsent !== 'granted' || TELEMETRY_ENDPOINT === '') return;

  const currentHour = Math.floor(Date.now() / HOUR_MS);
  const pending: typeof state.telemetryPending = [];
  for (const batch of state.telemetryPending) {
    if (batch.hourBucket >= currentHour) {
      pending.push(batch);
      continue;
    }

    const sent = await sendTelemetryBatch(state.telemetryConsent, TELEMETRY_ENDPOINT, batch).catch(() => false);
    if (!sent) pending.push(batch);
  }
  await writeLocal({ telemetryPending: pending });
  const latest = await readLocal();
  if (latest.telemetryConsent !== 'granted') {
    await writeLocal({ telemetryCohort: null, telemetryPending: [], w4TelemetryRecorded: false });
  }
}

async function syncFlushAlarm(): Promise<void> {
  const state = await readLocal();
  if (state.telemetryConsent === 'granted' && isSecureTelemetryEndpoint(TELEMETRY_ENDPOINT)) {
    if ((await chrome.alarms.get(FLUSH_ALARM)) === undefined) {
      await chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 60, delayInMinutes: 60 });
    }
    return;
  }
  await chrome.alarms.clear(FLUSH_ALARM);
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}