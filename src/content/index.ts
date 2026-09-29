import { GhostCounter } from './ghost-counter';
import { startProbeBridge, subscribeToProbeObservations } from './probes';
import { send } from '@/background/messaging';
import { readLocal, writeLocal } from '@/shared/storage';
import type { LocalSchema, WidgetAnchor } from '@/shared/storage';
import { isGpcExcepted } from '@/shared/gpc';
import { PORT_NAME } from '@/shared/types';
import type { LedgerSummary, Push, TrackerDetail } from '@/shared/types';
import type { ProbeObservation } from './probes';

/** Marker attribute used by the e2e harness and to prevent double injection. */
const READY_ATTR = 'data-ghostprint-ready';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

let widget: GhostCounter | null = null;
let port: chrome.runtime.Port | null = null;
let reconnectDelay = RECONNECT_BASE_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopProbeBridge: (() => void) | null = null;
let unsubscribeProbe: (() => void) | null = null;
let particleOverlayEnabled = false;
let xrayEnabled = false;
const probeObservations = new Map<string, ProbeObservation>();

async function boot(): Promise<void> {
  if (!shouldRun()) return;

  const settings = await readLocal();
  document.documentElement.setAttribute(READY_ATTR, '1');
  applySettings(settings);
}

function applySettings(settings: LocalSchema): void {
  applyGpcSignal(settings);
  const origin = location.origin;
  if (!settings.settings.enabled || settings.mutedOrigins.includes(origin)) {
    teardown();
    return;
  }

  particleOverlayEnabled = settings.settings.particleOverlayEnabled;
  if (port === null) connect();
  if (particleOverlayEnabled || xrayEnabled) startProbes();
  else stopProbes();

  const needsHost = settings.settings.showCounter || particleOverlayEnabled || xrayEnabled;
  if (!needsHost) {
    destroyWidget();
    return;
  }

  if (widget === null) {
    widget = new GhostCounter(
      {
        onExpand: async () => {
          const response = await send({ type: 'GET_DETAILS' });
          return response.trackers;
        },
        onMuteOrigin: () => {
          void muteOrigin(origin);
        },
        onDisable: () => {
          void disableCounter();
        },
        onXrayExit: resetXray,
      },
      anchorFor(settings.widgetAnchors, origin),
      settings.settings.showCounter,
    );
  } else {
    widget.setCounterVisible(settings.settings.showCounter);
  }
  widget.setOverlayEnabled(particleOverlayEnabled);
  widget.setXrayEnabled(xrayEnabled, [...probeObservations.values()]);

  if (settings.settings.showCounter) {
    void send({ type: 'GET_LEDGER' }).then((summary) => widget?.update(summary.summary));
  }
}

function applyGpcSignal(settings: LocalSchema): void {
  const enabled = settings.settings.gpcEnabled && !isGpcExcepted(location.hostname, settings.gpcExceptions);
  window.postMessage({ channel: 'ghostprint-gpc', type: 'GPC_STATE', enabled }, location.origin);
}

/**
 * Skip contexts where the counter is meaningless or unwelcome: sub-frames, the Chrome
 * Web Store (where Chrome blocks content scripts anyway), and pages with no real origin.
 */
function shouldRun(): boolean {
  if (window.top !== window.self) return false;
  if (document.documentElement.hasAttribute(READY_ATTR)) return false;
  if (location.origin === 'null') return false;

  const host = location.hostname;
  if (host === 'chromewebstore.google.com') return false;
  if (host === 'chrome.google.com' && location.pathname.startsWith('/webstore')) return false;
  return true;
}

function connect(): void {
  try {
    port = chrome.runtime.connect({ name: PORT_NAME });
  } catch {
    scheduleReconnect();
    return;
  }

  reconnectDelay = RECONNECT_BASE_MS;

  port.onMessage.addListener((message: Push) => {
    if (widget === null) return;
    if (message.type === 'LEDGER_DELTA') widget.update(message.summary);
    if (message.type === 'LEDGER_RESET') widget.update(emptySummary(message.tabId));
  });

  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    port = null;
    scheduleReconnect();
  });
}

/**
 * The service worker sleeps after ~30s idle, taking the port with it. Reconnecting with
 * backoff keeps live updates flowing without spinning when the extension is unloaded.
 */
function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (chrome.runtime.id === undefined) return; // extension unloaded or updated
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    connect();
    void refresh();
  }, reconnectDelay);
}

async function refresh(): Promise<void> {
  if (widget === null) return;
  try {
    const response = await send({ type: 'GET_LEDGER' });
    widget.update(response.summary);
  } catch {
    // Service worker unavailable; the next push or reconnect will resync.
  }
}

function anchorFor(anchors: Record<string, WidgetAnchor>, origin: string): WidgetAnchor | null {
  return new Map(Object.entries(anchors)).get(origin) ?? null;
}

async function muteOrigin(origin: string): Promise<void> {
  const state = await readLocal();
  if (!state.mutedOrigins.includes(origin)) {
    await writeLocal({ mutedOrigins: [...state.mutedOrigins, origin] });
  }
  teardown();
}

async function disableCounter(): Promise<void> {
  const state = await readLocal();
  xrayEnabled = false;
  await writeLocal({
    settings: { ...state.settings, showCounter: false, particleOverlayEnabled: false },
  });
  teardown();
}

function teardown(): void {
  xrayEnabled = false;
  particleOverlayEnabled = false;
  stopProbes();
  destroyWidget();
}

function startProbes(): void {
  if (stopProbeBridge !== null) return;
  stopProbeBridge = startProbeBridge();
  unsubscribeProbe = subscribeToProbeObservations((observation) => {
    const key = `${observation.domain}\u0000${observation.selector ?? ''}`;
    if (!probeObservations.has(key) && probeObservations.size >= 64) {
      const oldestKey = probeObservations.keys().next().value;
      if (oldestKey !== undefined) probeObservations.delete(oldestKey);
    }
    probeObservations.set(key, observation);
    widget?.showProbeObservation(observation);
    widget?.updateXrayObservations([...probeObservations.values()]);
  });
}

function stopProbes(): void {
  unsubscribeProbe?.();
  unsubscribeProbe = null;
  stopProbeBridge?.();
  stopProbeBridge = null;
  probeObservations.clear();
}

function toggleXray(): void {
  xrayEnabled = !xrayEnabled;
  if (xrayEnabled) startProbes();
  else if (!particleOverlayEnabled) stopProbes();
  void readLocal().then(applySettings);
}

function resetXray(): void {
  if (!xrayEnabled) return;
  xrayEnabled = false;
  widget?.setXrayEnabled(false, []);
  if (!particleOverlayEnabled) stopProbes();
  void readLocal().then(applySettings);
}

function destroyWidget(): void {
  widget?.destroy();
  widget = null;
}

function emptySummary(tabId: number): LedgerSummary {
  return {
    tabId,
    pageDomain: null,
    total: 0,
    byCategory: { 0: 0, 1: 0, 2: 0, 3: 0 },
    topEntity: null,
    capped: false,
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === 'local' &&
    (
      'settings' in changes ||
      'mutedOrigins' in changes ||
      'widgetAnchors' in changes ||
      'gpcExceptions' in changes
    )
  ) {
    void readLocal().then(applySettings);
  }
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return;
  if (message.type === 'GHOSTPRINT_TOGGLE_XRAY') toggleXray();
  if (message.type === 'GHOSTPRINT_RESET_XRAY') resetXray();
});

export type { TrackerDetail };

void boot();
