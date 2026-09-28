/** Single source of truth for cross-context types. Never redeclare these elsewhere. */

export enum TrackerCategory {
  Advertising = 0,
  Analytics = 1,
  Behavioral = 2,
  Unknown = 3,
}

export interface TrackerHit {
  /** eTLD+1 of the third-party request target. */
  domain: string;
  entityId: string | null;
  category: TrackerCategory;
  hits: number;
  firstSeenAt: number;
}

export interface TabLedger {
  tabId: number;
  pageDomain: string | null;
  startedAt: number;
  /** Keyed by eTLD+1. */
  trackers: Record<string, TrackerHit>;
  /** True once the per-page request cap is hit; `hits` stop incrementing. */
  capped: boolean;
}

export interface CategoryTotals {
  [TrackerCategory.Advertising]: number;
  [TrackerCategory.Analytics]: number;
  [TrackerCategory.Behavioral]: number;
  [TrackerCategory.Unknown]: number;
}

export interface LedgerSummary {
  tabId: number;
  pageDomain: string | null;
  total: number;
  byCategory: CategoryTotals;
  topEntity: { id: string; name: string; count: number } | null;
}

/* ------------------------------------------------------------------ */
/* Messaging                                                           */
/* ------------------------------------------------------------------ */

export const PORT_NAME = 'ghostprint';

/** Requests initiated by content script / popup / options, answered by the SW. */
export type Request =
  | { type: 'PING' }
  | { type: 'GET_LEDGER'; tabId?: number }
  | { type: 'CLEAR_ALL_DATA' };

export type ResponseFor<R extends Request> = R extends { type: 'PING' }
  ? { type: 'PONG'; at: number }
  : R extends { type: 'GET_LEDGER' }
    ? { type: 'LEDGER'; summary: LedgerSummary | null }
    : R extends { type: 'CLEAR_ALL_DATA' }
      ? { type: 'CLEARED' }
      : never;

/** Pushed from the SW to connected ports. */
export type Push =
  | { type: 'LEDGER_DELTA'; summary: LedgerSummary }
  | { type: 'LEDGER_RESET'; tabId: number };

export interface ErrorResponse {
  type: 'ERROR';
  message: string;
}
