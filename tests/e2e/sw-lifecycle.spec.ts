import { expect, test } from './fixtures';
import type { LedgerSummary, TabLedger } from '../../src/shared/types';

const PAGE = 'https://shop.test/';
const HTML = `<!doctype html><title>shop</title>
<img src="https://www.google-analytics.com/collect?v=2">
<img src="https://static.hotjar.com/c/hotjar-1.js">
<img src="https://an-unknown-tracker.test/px.gif">`;

/**
 * The MV3 service worker is terminated when idle. Per-tab counts must survive that,
 * which is the whole reason the ledger is mirrored to chrome.storage.session.
 *
 * Asking a revived worker for a summary exercises the rehydration path, not just the
 * persistence path -- storage could be intact while in-memory recovery is broken.
 */
test('a revived service worker rehydrates the ledger with no data loss', async ({
  context,
  extensionPage,
}) => {
  await context.route('**/*', (route) =>
    route.request().url() === PAGE
      ? route.fulfill({ contentType: 'text/html', body: HTML })
      : route.fulfill({ contentType: 'image/gif', body: '' }),
  );

  const page = await context.newPage();
  await page.goto(PAGE);

  const readLedger = async (): Promise<TabLedger | undefined> => {
    const ledgers = (await extensionPage.evaluate(async () => {
      const all = await chrome.storage.session.get(null);
      return Object.entries(all)
        .filter(([key]) => key.startsWith('ledger:'))
        .map(([, value]) => value);
    })) as TabLedger[];
    return ledgers.find((ledger) => ledger.pageDomain === 'shop.test');
  };

  await expect
    .poll(async () => Object.keys((await readLedger())?.trackers ?? {}).length, { timeout: 15_000 })
    .toBe(3);

  const before = await readLedger();
  const tabId = before?.tabId ?? -1;
  expect(tabId).toBeGreaterThanOrEqual(0);

  const client = await context.newCDPSession(page);
  await client.send('ServiceWorker.enable');
  await client.send('ServiceWorker.stopAllWorkers');
  await client.detach();

  // Waking the worker through the message router forces hydrate() to run first.
  const summary = (await extensionPage.evaluate(
    async (id) =>
      (await chrome.runtime.sendMessage({ type: 'GET_LEDGER', tabId: id })) as unknown,
    tabId,
  )) as { type: string; summary: LedgerSummary | null };

  expect(summary.type).toBe('LEDGER');
  expect(summary.summary).toMatchObject({
    tabId,
    pageDomain: 'shop.test',
    total: 3,
    // Google and Contentsquare both own one domain here; ties break on entity id.
    topEntity: { id: 'contentsquare', name: 'Contentsquare', count: 1 },
  });

  expect((await readLedger())?.trackers).toEqual(before?.trackers);
});
