import type { TelemetryBatch, TelemetryConsent } from './telemetry-types';

export function isSecureTelemetryEndpoint(endpoint: string): boolean {
  try {
    return new URL(endpoint).protocol === 'https:';
  } catch {
    return false;
  }
}

declare const __GHOSTPRINT_TELEMETRY_ENDPOINT__: string;
export const TELEMETRY_ENDPOINT =
  typeof __GHOSTPRINT_TELEMETRY_ENDPOINT__ === 'string' ? __GHOSTPRINT_TELEMETRY_ENDPOINT__ : '';

export async function sendTelemetryBatch(
  consent: TelemetryConsent,
  endpoint: string,
  batch: TelemetryBatch,
): Promise<boolean> {
  if (consent !== 'granted' || !isSecureTelemetryEndpoint(endpoint)) return false;
  const response = await globalThis.fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GhostPrint-Purpose': 'count-only-v1',
    },
    body: JSON.stringify({ version: 1, ...batch }),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  return response.ok;
}