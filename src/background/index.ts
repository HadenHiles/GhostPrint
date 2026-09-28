import { installRouter } from './messaging';
import { installRequestMonitor } from './request-monitor';
import { clear, flush, getDetails, getSummary, hydrate } from './tab-state';
import { clearAll, DEFAULT_LOCAL, readLocal, writeLocal } from '@/shared/storage';
import type { Request } from '@/shared/types';

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const current = await readLocal();
    await writeLocal({ ...DEFAULT_LOCAL, ...current });
  })();
});

installRequestMonitor();

installRouter(async (request: Request, sender) => {
  switch (request.type) {
    case 'PING':
      return { type: 'PONG', at: Date.now() };

    case 'GET_LEDGER': {
      await hydrate();
      const tabId = request.tabId ?? sender.tab?.id ?? (await activeTabId());
      return { type: 'LEDGER', summary: tabId === null ? null : getSummary(tabId) };
    }

    case 'GET_DETAILS': {
      await hydrate();
      const tabId = request.tabId ?? sender.tab?.id ?? (await activeTabId());
      return { type: 'DETAILS', trackers: tabId === null ? [] : getDetails(tabId) };
    }

    case 'CLEAR_ALL_DATA':
      clear();
      await flush();
      await clearAll();
      return { type: 'CLEARED' };
  }
});

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}
