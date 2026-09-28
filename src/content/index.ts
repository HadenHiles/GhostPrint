import { send } from '@/background/messaging';
import { PORT_NAME } from '@/shared/types';
import type { Push } from '@/shared/types';

/** Marker attribute used by the e2e harness to assert the round trip. */
const READY_ATTR = 'data-ghostprint-ready';

async function boot(): Promise<void> {
  const pong = await send({ type: 'PING' });
  document.documentElement.setAttribute(READY_ATTR, String(pong.at));

  connect();
}

function connect(): void {
  const port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener((message: Push) => {
    void message; // Ghost Counter consumes this in P1-04.
  });
  // The MV3 service worker sleeps after ~30s idle; reconnect lazily on demand.
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
  });
}

void boot();
