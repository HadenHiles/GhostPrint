const CHANNEL = 'ghostprint-probe';
const INIT_TYPE = 'GHOSTPRINT_PROBE_INIT';
const EVENT_TYPE = 'GHOSTPRINT_PROBE_EVENT';
const STOP_TYPE = 'GHOSTPRINT_PROBE_STOP';
const MAX_EVENTS = 64;
const EVENT_NAMES = new Set(['keydown', 'keyup', 'input', 'paste', 'mousemove', 'scroll']);
const FORM_SELECTOR = 'input, textarea, select, form';

type ApiName =
  | 'addEventListener'
  | 'MutationObserver.observe'
  | 'sendBeacon'
  | 'fetch'
  | 'XMLHttpRequest.send'
  | 'HTMLCanvasElement.toDataURL'
  | 'CanvasRenderingContext2D.getImageData'
  | 'WebGLRenderingContext.getParameter';

interface ProbeMessage {
  channel: typeof CHANNEL;
  type: typeof EVENT_TYPE;
  nonce: string;
  api: ApiName;
  selector: string | null;
  scriptHost: string;
  timestamp: number;
}

let nonce: string | null = null;
let recorded = 0;
const wrappedMethods: {
  owner: object;
  name: string;
  descriptor: PropertyDescriptor;
  wrapped: (...args: unknown[]) => unknown;
}[] = [];

window.addEventListener('message', onInit);

function onInit(event: MessageEvent<unknown>): void {
  if (
    nonce !== null ||
    event.source !== window ||
    event.origin !== location.origin ||
    !isInitMessage(event.data)
  ) {
    return;
  }

  nonce = event.data.nonce;
  window.removeEventListener('message', onInit);
  window.addEventListener('message', onStop);
  window.postMessage({ channel: CHANNEL, type: 'GHOSTPRINT_PROBE_READY', nonce }, location.origin);
  installProbes();
}

function onStop(event: MessageEvent<unknown>): void {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    typeof event.data !== 'object' ||
    event.data === null ||
    !('channel' in event.data) ||
    !('type' in event.data) ||
    !('nonce' in event.data) ||
    event.data.channel !== CHANNEL ||
    event.data.type !== STOP_TYPE ||
    event.data.nonce !== nonce
  ) {
    return;
  }

  window.removeEventListener('message', onStop);
  for (const entry of wrappedMethods) {
    const current = Object.getOwnPropertyDescriptor(entry.owner, entry.name);
    if (current?.value === entry.wrapped) Object.defineProperty(entry.owner, entry.name, entry.descriptor);
  }
  wrappedMethods.length = 0;
  nonce = null;
}

function isInitMessage(value: unknown): value is { channel: typeof CHANNEL; type: typeof INIT_TYPE; nonce: string } {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.channel === CHANNEL &&
    message.type === INIT_TYPE &&
    typeof message.nonce === 'string' &&
    /^[a-f0-9]{32}$/.test(message.nonce)
  );
}

function installProbes(): void {
  wrapMethod(EventTarget.prototype, 'addEventListener', (args, target, stack) => {
    const eventName = args[0];
    if (typeof eventName === 'string' && EVENT_NAMES.has(eventName)) {
      emit('addEventListener', selectorFor(target), stack);
    }
  });

  wrapMethod(MutationObserver.prototype, 'observe', (args, _target, stack) => {
    const target = args[0];
    if (target instanceof Element && (target.matches(FORM_SELECTOR) || target.querySelector(FORM_SELECTOR))) {
      emit('MutationObserver.observe', selectorFor(target), stack);
    }
  });

  wrapMethod(window, 'fetch', (_args, _target, stack) => emit('fetch', selectorFor(document.activeElement), stack));
  wrapMethod(Navigator.prototype, 'sendBeacon', (_args, _target, stack) =>
    emit('sendBeacon', selectorFor(document.activeElement), stack),
  );
  wrapMethod(XMLHttpRequest.prototype, 'send', (_args, _target, stack) =>
    emit('XMLHttpRequest.send', selectorFor(document.activeElement), stack),
  );
  wrapMethod(HTMLCanvasElement.prototype, 'toDataURL', (_args, target, stack) =>
    emit('HTMLCanvasElement.toDataURL', selectorFor(target), stack),
  );
  wrapMethod(CanvasRenderingContext2D.prototype, 'getImageData', (_args, target, stack) =>
    emit('CanvasRenderingContext2D.getImageData', selectorFor(canvasFor(target)), stack),
  );

  const webglPrototypes: object[] = [];
  if (typeof WebGLRenderingContext !== 'undefined') webglPrototypes.push(WebGLRenderingContext.prototype);
  if (typeof WebGL2RenderingContext !== 'undefined') webglPrototypes.push(WebGL2RenderingContext.prototype);
  for (const prototype of webglPrototypes) {
    wrapMethod(prototype, 'getParameter', (_args, target, stack) =>
      emit('WebGLRenderingContext.getParameter', selectorFor(canvasFor(target)), stack),
    );
  }
}

function wrapMethod(
  owner: object,
  name: string,
  inspect: (args: unknown[], target: unknown, stack: string) => void,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(owner, name);
  if (descriptor?.configurable !== true || typeof descriptor.value !== 'function') return;

  const nativeMethod = descriptor.value as (...args: unknown[]) => unknown;
  const wrapped = new Proxy(nativeMethod, {
    apply(target, thisArg, args) {
      if (recorded < MAX_EVENTS) {
        try {
          inspect(args, thisArg, new Error().stack ?? '');
        } catch {
          // Probe failures must never change the page's call path.
        }
      }
      return Reflect.apply(target, thisArg, args);
    },
  });

  Object.defineProperty(owner, name, { ...descriptor, value: wrapped });
  wrappedMethods.push({ owner, name, descriptor, wrapped });
}

function emit(api: ApiName, selector: string | null, stack: string): void {
  if (nonce === null || recorded >= MAX_EVENTS) return;
  const scriptHost = hostFromStack(stack);
  if (scriptHost === null) return;

  recorded += 1;
  const message: ProbeMessage = {
    channel: CHANNEL,
    type: EVENT_TYPE,
    nonce,
    api,
    selector,
    scriptHost,
    timestamp: Date.now(),
  };
  window.postMessage(message, location.origin);
}

function hostFromStack(stack: string): string | null {
  for (const line of stack.split('\n').slice(2)) {
    const match = line.match(/https?:\/\/[^\s)]+/);
    if (match === null) continue;
    try {
      const url = new URL(match[0]);
      if (url.hostname.length > 0) return url.hostname.toLowerCase();
    } catch {
      // Ignore non-URL stack frames.
    }
  }
  return null;
}

function selectorFor(value: unknown): string | null {
  if (!(value instanceof Element)) return null;
  const parts: string[] = [];
  let current: Element | null = value;
  while (current !== null && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const type = current instanceof HTMLInputElement ? `[type="${current.type}"]` : '';
    parts.push(`${tag}${type}${nthOfType(current)}`);
    current = current.parentElement;
  }
  const selector = parts.reverse().join(' > ');
  return selector.length <= 256 ? selector : null;
}

function nthOfType(element: Element): string {
  const parent = element.parentElement;
  if (parent === null) return '';
  const sameTag = Array.from(parent.children).filter((sibling) => sibling.tagName === element.tagName);
  return sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(element) + 1})` : '';
}

function canvasFor(value: unknown): HTMLCanvasElement | null {
  if (typeof value !== 'object' || value === null || !('canvas' in value)) return null;
  const canvas: unknown = value.canvas;
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}