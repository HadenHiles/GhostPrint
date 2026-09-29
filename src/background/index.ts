import { installRouter } from './messaging';
import { installRequestMonitor } from './request-monitor';
import { installGpcRuleSync } from './gpc';
import {
  flush as flushHistory,
  getSummary as getHistorySummary,
  installHistory,
  reset as resetHistory,
  getWeeklyReport,
} from './history';
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
installHistory();
installGpcRuleSync();

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== 'ghostprint-weekly-report') return;
  void chrome.tabs.create({ url: chrome.runtime.getURL('popup/index.html') });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-xray') return;
  void sendXrayMessageToActiveTab('GHOSTPRINT_TOGGLE_XRAY');
});

installRouter(async (request: Request, sender) => {
  switch (request.type) {
    case 'PING':
      return { type: 'PONG', at: Date.now() };

    case 'GET_LEDGER': {
      await hydrate();
      const tabId = request.tabId ?? (await resolveTabId(sender));
      return { type: 'LEDGER', summary: tabId === null ? null : getSummary(tabId) };
    }

    case 'GET_DETAILS': {
      await hydrate();
      const tabId = request.tabId ?? (await resolveTabId(sender));
      return { type: 'DETAILS', trackers: tabId === null ? [] : getDetails(tabId) };
    }

    case 'GET_HISTORY':
      return { type: 'HISTORY', summary: await getHistorySummary(request.days) };

    case 'GET_WEEKLY_REPORT':
      return { type: 'WEEKLY_REPORT', report: await getWeeklyReport() };

    case 'CLEAR_ALL_DATA':
      clear();
      resetHistory();
      await flush();
      await clearAll();
      await flushHistory();
      return { type: 'CLEARED' };
  }
});

/**
 * Resolves which tab a request is about.
 *
 * A content script means its own tab. An extension page (popup, options) always means
 * the page the user is looking at, never itself -- and the popup does occupy a tab when
 * opened directly or under automation, so `sender.tab` cannot be trusted there.
 */
async function resolveTabId(sender: chrome.runtime.MessageSender): Promise<number | null> {
  if (sender.url?.startsWith('http') === true && sender.tab?.id !== undefined) {
    return sender.tab.id;
  }
  return activeTabId();
}

async function activeTabId(): Promise<number | null> {
  const active = await chrome.tabs.query({ active: true, currentWindow: true });
  const current = active.find(isPageTab);
  if (current?.id !== undefined) return current.id;

  const all = await chrome.tabs.query({});
  const recent = all
    .filter(isPageTab)
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return recent[0]?.id ?? null;
}

function isPageTab(tab: chrome.tabs.Tab): boolean {
  return tab.url?.startsWith('http') === true;
}

async function sendXrayMessageToActiveTab(type: 'GHOSTPRINT_TOGGLE_XRAY'): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined || !isPageTab(tab)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
  } catch {
    // The tab may not have a content script if navigation/injection is still in flight.
  }
}
