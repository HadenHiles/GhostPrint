import type { ErrorResponse, Push, Request, ResponseFor } from '@/shared/types';
import { PORT_NAME } from '@/shared/types';

type Handler = (request: Request, sender: chrome.runtime.MessageSender) => Promise<unknown>;

const ports = new Set<chrome.runtime.Port>();

/** Registers the single request router. Call once from the service worker entry. */
export function installRouter(handler: Handler): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isRequest(message)) {
      sendResponse({ type: 'ERROR', message: 'Malformed request' } satisfies ErrorResponse);
      return false;
    }

    handler(message, sender).then(sendResponse, (error: unknown) => {
      sendResponse({
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      } satisfies ErrorResponse);
    });

    return true; // keep the channel open for the async response
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;
    ports.add(port);
    port.onDisconnect.addListener(() => ports.delete(port));
  });
}

/** Fan-out to every connected content script / popup port. */
export function broadcast(push: Push): void {
  for (const port of ports) {
    try {
      port.postMessage(push);
    } catch {
      ports.delete(port);
    }
  }
}

/** Typed request helper for content script, popup, and options pages. */
export async function send<R extends Request>(request: R): Promise<ResponseFor<R>> {
  const response: unknown = await chrome.runtime.sendMessage(request);
  if (isErrorResponse(response)) throw new Error(response.message);
  return response as ResponseFor<R>;
}

function isRequest(value: unknown): value is Request {
  if (typeof value !== 'object' || value === null) return false;

  const type = (value as { type?: unknown }).type;
  return (
    type === 'PING' ||
    type === 'GET_LEDGER' ||
    type === 'GET_DETAILS' ||
    type === 'GET_HISTORY' ||
    type === 'CLEAR_ALL_DATA'
  );
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === 'object' && value !== null && (value as ErrorResponse).type === 'ERROR'
  );
}
