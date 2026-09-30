export const TELEMETRY_METRICS = [
  'weekly_report_viewed',
  'share_clicked',
  'share_completed',
  'xray_toggled',
  'popup_opened',
  'w4_retained',
] as const;

export type TelemetryMetric = (typeof TELEMETRY_METRICS)[number];

export interface TelemetryBatch {
  cohort: string;
  hourBucket: number;
  counts: Partial<Record<TelemetryMetric, number>>;
}

export interface TelemetryCohort {
  week: number;
  token: string;
}

export type TelemetryConsent = 'undecided' | 'declined' | 'granted';

export function isTelemetryMetric(value: unknown): value is TelemetryMetric {
  return typeof value === 'string' && (TELEMETRY_METRICS as readonly string[]).includes(value);
}