import type { TabLedger } from './types';

export const SCHEMA_VERSION = 4;

export interface LocalSchema {
  schemaVersion: number;
  settings: Settings;
  /** Per-origin widget anchor overrides, keyed by origin. */
  widgetAnchors: Record<string, WidgetAnchor>;
  /** Origins where the Ghost Counter is suppressed. */
  mutedOrigins: string[];
  /** Hostnames exempt from the Global Privacy Control request header. */
  gpcExceptions: string[];
}

export interface Settings {
  enabled: boolean;
  showCounter: boolean;
  particleOverlayEnabled: boolean;
  weeklyReportNotificationEnabled: boolean;
  gpcEnabled: boolean;
}

export type WidgetAnchor = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export const DEFAULT_LOCAL: LocalSchema = {
  schemaVersion: SCHEMA_VERSION,
  settings: {
    enabled: true,
    showCounter: true,
    particleOverlayEnabled: false,
    weeklyReportNotificationEnabled: false,
    gpcEnabled: false,
  },
  widgetAnchors: {},
  mutedOrigins: [],
  gpcExceptions: [],
};

export async function readLocal(): Promise<LocalSchema> {
  const raw = await chrome.storage.local.get<Partial<LocalSchema>>(null);
  return migrate(raw);
}

export async function writeLocal(patch: Partial<LocalSchema>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function clearAll(): Promise<void> {
  await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]);
  await chrome.storage.local.set(DEFAULT_LOCAL);
}

export function migrate(
  raw: Partial<Omit<LocalSchema, 'settings'>> & { settings?: Partial<Settings> },
): LocalSchema {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

  switch (version) {
    case 0:
      // Fresh install or pre-versioned data: fall through to defaults.
      return { ...DEFAULT_LOCAL };
    case 1:
    case 2:
    case 3:
    case SCHEMA_VERSION:
      return {
        ...DEFAULT_LOCAL,
        ...raw,
        settings: { ...DEFAULT_LOCAL.settings, ...raw.settings },
        schemaVersion: SCHEMA_VERSION,
      };
    default:
      // Data written by a newer build; do not attempt to downgrade it.
      return {
        ...DEFAULT_LOCAL,
        ...raw,
        settings: { ...DEFAULT_LOCAL.settings, ...raw.settings },
        schemaVersion: SCHEMA_VERSION,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Session-scoped ledger mirror (survives service-worker termination)   */
/* ------------------------------------------------------------------ */

const LEDGER_PREFIX = 'ledger:';

export async function saveLedgers(ledgers: Iterable<TabLedger>): Promise<void> {
  const patch: Record<string, TabLedger> = {};
  for (const ledger of ledgers) patch[`${LEDGER_PREFIX}${ledger.tabId}`] = ledger;
  if (Object.keys(patch).length > 0) await chrome.storage.session.set(patch);
}

export async function loadLedgers(): Promise<TabLedger[]> {
  const all = await chrome.storage.session.get<Record<string, unknown>>(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(LEDGER_PREFIX))
    .map(([, value]) => value as TabLedger);
}

export async function dropLedger(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${LEDGER_PREFIX}${tabId}`);
}
