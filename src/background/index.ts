import { installRouter } from './messaging';
import { clearAll, DEFAULT_LOCAL, readLocal, writeLocal } from '@/shared/storage';
import type { Request } from '@/shared/types';

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const current = await readLocal();
    await writeLocal({ ...DEFAULT_LOCAL, ...current });
  })();
});

installRouter(async (request: Request) => {
  switch (request.type) {
    case 'PING':
      return { type: 'PONG', at: Date.now() };

    case 'GET_LEDGER':
      // Populated by P1-03 (request interception engine).
      return { type: 'LEDGER', summary: null };

    case 'CLEAR_ALL_DATA':
      await clearAll();
      return { type: 'CLEARED' };
  }
});
