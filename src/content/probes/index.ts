import { classify, classifyUnknown } from '@/background/classifier';
import { isThirdParty, toHostname } from '@/shared/domain';
import type { TrackerCategory } from '@/shared/types';

const CHANNEL = 'ghostprint-probe';
const EVENT_TYPE = 'GHOSTPRINT_PROBE_EVENT';
const READY_TYPE = 'GHOSTPRINT_PROBE_READY';
const START_TYPE = 'GHOSTPRINT_PROBE_START';
const STOP_TYPE = 'GHOSTPRINT_PROBE_STOP';
const APIS = new Set([
  'addEventListener',
  'MutationObserver.observe',
  'sendBeacon',
  'fetch',
  'XMLHttpRequest.send',
  'HTMLCanvasElement.toDataURL',
  'CanvasRenderingContext2D.getImageData',
  'WebGLRenderingContext.getParameter',
]);

export interface ProbeObservation {
  domain: string;
  entityId: string | null;
  entityName: string | null;
  category: TrackerCategory;
  selector: string | null;
  api: string;
  timestamp: number;
}

type ProbeListener = (observation: ProbeObservation) => void;

const listeners = new Set<ProbeListener>();

export interface ProbeBridgeController {
  activate(): void;
  stop(): void;
}

/** Prepares the bridge at document_start; API wrappers activate only after settings are read. */
export function startProbeBridge(): ProbeBridgeController {
  const nonce = createNonce();
  let ready = false;
  let requested = false;
  let started = false;
  let stopped = false;
  let attempts = 0;

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || event.origin !== location.origin || !isRecord(event.data)) return;
    const message = event.data;

    if (message.channel !== CHANNEL || message.nonce !== nonce) return;
    if (message.type === READY_TYPE) {
      ready = true;
      window.clearInterval(retryTimer);
      if (requested) postStart();
      return;
    }
    if (!ready || !started || message.type !== EVENT_TYPE) return;

    const observation = parseProbeMessage(message, nonce, location.href);
    if (observation !== null) {
      for (const listener of [...listeners]) listener(observation);
    }
  };

  const postStart = (): void => {
    if (stopped || !ready || started) return;
    started = true;
    window.postMessage({ channel: CHANNEL, type: START_TYPE, nonce }, location.origin);
  };

  const postInit = (): void => {
    if (ready || attempts >= 20) {
      window.clearInterval(retryTimer);
      return;
    }
    attempts += 1;
    window.postMessage({ channel: CHANNEL, type: 'GHOSTPRINT_PROBE_INIT', nonce }, location.origin);
  };

  window.addEventListener('message', onMessage);
  postInit();
  const retryTimer = window.setInterval(postInit, 50);

  return {
    activate: () => {
      requested = true;
      postStart();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
    window.postMessage({ channel: CHANNEL, type: STOP_TYPE, nonce }, location.origin);
    window.clearInterval(retryTimer);
    window.removeEventListener('message', onMessage);
    },
  };
}

/** Subscribes to validated, third-party-only probe signals for the overlay consumer. */
export function subscribeToProbeObservations(listener: ProbeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function parseProbeMessage(
  value: unknown,
  nonce: string,
  pageUrl: string,
): ProbeObservation | null {
  if (!isRecord(value)) return null;
  if (
    value.channel !== CHANNEL ||
    value.type !== EVENT_TYPE ||
    value.nonce !== nonce ||
    typeof value.api !== 'string' ||
    !APIS.has(value.api) ||
    (value.selector !== null &&
      (typeof value.selector !== 'string' || value.selector.length > 256)) ||
    typeof value.scriptHost !== 'string' ||
    value.scriptHost.length > 253 ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp)
  ) {
    return null;
  }

  const scriptUrl = `https://${value.scriptHost}/`;
  const scriptHost = toHostname(scriptUrl);
  if (
    scriptHost === null ||
    scriptHost !== value.scriptHost.toLowerCase() ||
    !isThirdParty(scriptUrl, pageUrl)
  ) {
    return null;
  }

  const classification = classify(scriptUrl) ?? classifyUnknown(scriptUrl);
  if (classification === null) return null;

  return {
    domain: classification.domain,
    entityId: classification.entityId,
    entityName: classification.entityName,
    category: classification.category,
    selector: value.selector,
    api: value.api,
    timestamp: value.timestamp,
  };
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}