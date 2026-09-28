import { expect, test } from './fixtures';
import type { TabLedger } from '../../src/shared/types';
import type { BrowserContext, Page } from '@playwright/test';

const PAGE = 'https://shop.test/';

const HTML = `<!doctype html><meta charset="utf-8"><title>shop</title>
<img src="https://www.google-analytics.com/collect?v=2">
<img src="https://static.hotjar.com/c/hotjar-1.js">
<img src="https://an-unknown-tracker.test/px.gif">
<img src="https://d111111abcdef8.cloudfront.net/logo.png">
<img src="/first-party.png">`;

/** Fulfils the page and every third-party asset it references, with no real network. */
async function stubNetwork(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(PAGE) && !url.includes('.png')) {
      return route.fulfill({ contentType: 'text/html', body: HTML });
    }
    return route.fulfill({ contentType: 'image/gif', body: '' });
  });
}

async function readLedgers(extensionPage: Page): Promise<TabLedger[]> {
  return (await extensionPage.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    return Object.entries(all)
      .filter(([key]) => key.startsWith('ledger:'))
      .map(([, value]) => value);
  })) as TabLedger[];
}

/** Session storage key order is not meaningful, so always select by page domain. */
async function ledgerFor(extensionPage: Page, pageDomain: string): Promise<TabLedger | undefined> {
  const ledgers = await readLedgers(extensionPage);
  return ledgers.find((ledger) => ledger.pageDomain === pageDomain);
}

async function visitShop(context: BrowserContext): Promise<Page> {
  await stubNetwork(context);
  const page = await context.newPage();
  await page.goto(PAGE);
  return page;
}

test('records third-party trackers and attributes them to a corporate parent', async ({
  context,
  extensionPage,
}) => {
  await visitShop(context);

  await expect
    .poll(async () => (await ledgerFor(extensionPage, 'shop.test'))?.trackers ?? {}, {
      timeout: 15_000,
    })
    .toMatchObject({
      'google-analytics.com': { entityId: 'google', category: 1 },
      'hotjar.com': { entityId: 'contentsquare', category: 2 },
    });
});

test('counts unknown third parties separately instead of dropping them', async ({
  context,
  extensionPage,
}) => {
  await visitShop(context);

  await expect
    .poll(async () => (await ledgerFor(extensionPage, 'shop.test'))?.trackers ?? {}, {
      timeout: 15_000,
    })
    .toMatchObject({ 'an-unknown-tracker.test': { entityId: null, category: 3 } });
});

test('does not attribute a shared CDN to any entity', async ({ context, extensionPage }) => {
  await visitShop(context);

  await expect
    .poll(async () => (await ledgerFor(extensionPage, 'shop.test'))?.trackers ?? {}, {
      timeout: 15_000,
    })
    .toMatchObject({ 'cloudfront.net': { entityId: null, category: 3 } });
});

test('ignores first-party requests', async ({ context, extensionPage }) => {
  await visitShop(context);

  await expect
    .poll(async () => Object.keys((await ledgerFor(extensionPage, 'shop.test'))?.trackers ?? {}), {
      timeout: 15_000,
    })
    .not.toContain('shop.test');
});

test('resets the ledger on navigation rather than accumulating across pages', async ({
  context,
  extensionPage,
}) => {
  const page = await visitShop(context);

  await expect
    .poll(
      async () => Object.keys((await ledgerFor(extensionPage, 'shop.test'))?.trackers ?? {}).length,
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  await context.route('https://other.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>other</title>' }),
  );
  await page.goto('https://other.test/');

  await expect
    .poll(async () => (await ledgerFor(extensionPage, 'other.test')) !== undefined, {
      timeout: 15_000,
    })
    .toBe(true);

  expect(Object.keys((await ledgerFor(extensionPage, 'other.test'))?.trackers ?? {})).toHaveLength(
    0,
  );
  expect(await ledgerFor(extensionPage, 'shop.test')).toBeUndefined();
});

test('drops the ledger when the tab closes', async ({ context, extensionPage }) => {
  const page = await visitShop(context);

  await expect
    .poll(async () => (await ledgerFor(extensionPage, 'shop.test')) !== undefined, {
      timeout: 15_000,
    })
    .toBe(true);

  await page.close();

  await expect
    .poll(async () => (await ledgerFor(extensionPage, 'shop.test')) !== undefined, {
      timeout: 15_000,
    })
    .toBe(false);
});
