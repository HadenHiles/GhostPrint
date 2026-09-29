import { readLocal } from '@/shared/storage';

const GPC_RULE_ID = 741;

export function installGpcRuleSync(): void {
  void syncGpcRule();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && ('settings' in changes || 'gpcExceptions' in changes)) {
      void syncGpcRule();
    }
  });
}

export async function syncGpcRule(): Promise<void> {
  const state = await readLocal();
  const addRules: chrome.declarativeNetRequest.Rule[] = [];

  if (state.settings.gpcEnabled) {
    const condition: chrome.declarativeNetRequest.RuleCondition = { urlFilter: '|http' };
    if (state.gpcExceptions.length > 0) {
      condition.excludedInitiatorDomains = state.gpcExceptions;
    }
    addRules.push({
      id: GPC_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'Sec-GPC', operation: 'set', value: '1' }],
      },
      condition,
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [GPC_RULE_ID],
    addRules,
  });
}