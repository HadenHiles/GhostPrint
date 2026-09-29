import { classify, classifyUnknown } from './classifier';
import { record as recordHistory } from './history';
import { broadcast } from './messaging';
import { forgetTab, getSummary, hydrate, record, resetTab } from './tab-state';
import { getRegistrableDomain, isThirdPartyHosts, toHostname } from '@/shared/domain';
import { TrackerCategory } from '@/shared/types';

/**
 * Observe-only request monitoring.
 *
 * MV3 kept `chrome.webRequest` available in non-blocking mode, and it is the only API
 * that reports requests as they happen. `declarativeNetRequest` can block but cannot
 * observe outside unpacked builds (`onRuleMatchedDebug` is dev-only), so it is reserved
 * for GPC headers and opt-in blocking. See docs/PERMISSIONS.md.
 */

/** Sub-resource types only; the top-level document is the first party by definition. */
const IGNORED_TYPES = new Set<`${chrome.webRequest.ResourceType}`>(['main_frame']);

const BADGE_COLOUR = '#7c3aed';
const pageHosts = new Map<number, string>();
const pageDomains = new Map<number, string>();

export function installRequestMonitor(): void {
  void hydrate();

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      handleRequest(details);
      return undefined;
    },
    { urls: ['<all_urls>'] },
  );

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;

    // about:blank, chrome://, view-source: and friends cannot host third parties;
    // creating a ledger for them would leave empty entries in session storage.
    const pageDomain = getRegistrableDomain(details.url);
    if (pageDomain === null) {
      pageHosts.delete(details.tabId);
      pageDomains.delete(details.tabId);
      forgetTab(details.tabId);
      void setBadge(details.tabId, 0);
      return;
    }

  const pageHost = toHostname(details.url);
  if (pageHost !== null) pageHosts.set(details.tabId, pageHost);
  pageDomains.set(details.tabId, pageDomain);
    resetTab(details.tabId, pageDomain);
    broadcast({ type: 'LEDGER_RESET', tabId: details.tabId });
    void setBadge(details.tabId, 0);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    pageHosts.delete(tabId);
    pageDomains.delete(tabId);
    forgetTab(tabId);
  });

  void chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOUR });
}

function handleRequest(details: chrome.webRequest.OnBeforeRequestDetails): void {
  if (details.tabId < 0) return; // service worker, prefetch, or other non-tab traffic
  if (IGNORED_TYPES.has(details.type)) return;

  // Without an initiator we cannot establish the first party, so we cannot honestly
  // call the request third-party. Skipping is the conservative choice.
  const pageHost = pageHosts.get(details.tabId);
  const requestHost = toHostname(details.url);
  if (requestHost === null) return;

  const pageUrl = details.initiator ?? null;
  const resolvedPageHost = pageHost ?? toHostname(pageUrl);
  if (resolvedPageHost === null) return;
  if (!isThirdPartyHosts(requestHost, resolvedPageHost)) return;

  const classification = classify(details.url) ?? classifyUnknown(details.url);
  if (classification === null) return;

  const pageDomain = pageDomains.get(details.tabId) ?? getRegistrableDomain(pageUrl);
  const isNew = record(details.tabId, pageDomain, {
    domain: classification.domain,
    entityId: classification.entityId,
    category: classification.category,
  });

  if (!isNew) return;

  // Only first sightings reach history, so a page that pings one tracker 500 times
  // counts once rather than swamping the weekly totals.
  void recordHistory({
    domain: classification.domain,
    entityId: classification.entityId,
    category: classification.category,
  });

  const summary = getSummary(details.tabId);
  if (summary === null) return;

  broadcast({ type: 'LEDGER_DELTA', summary });
  void setBadge(details.tabId, summary.total - summary.byCategory[TrackerCategory.Unknown]);
}

/**
 * The badge shows identified trackers only. Unknown third parties are still counted in
 * the ledger and shown in the popup, but promoting them to the badge would overstate
 * what we can actually name.
 */
async function setBadge(tabId: number, count: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' });
  } catch {
    // Tab closed between the request and the badge update.
  }
}
