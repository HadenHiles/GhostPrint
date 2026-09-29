import { expect, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import type { TabLedger } from '../../src/shared/types';

const SANDBOX_ORIGIN = 'http://facebook.test:4173';
const SANDBOX_PROXY = 'http://127.0.0.1:4173';
const WIDGET = 'ghostprint-counter';

async function openSandbox(context: BrowserContext, path: string): Promise<Page> {
  await context.route(`${SANDBOX_ORIGIN}/**`, async (route) => {
    const target = new URL(route.request().url());
    const response = await route.fetch({ url: `${SANDBOX_PROXY}${target.pathname}` });
    await route.fulfill({ response });
  });

  await context.route(/^https:\/\/(www\.google-analytics\.com|static\.hotjar\.com|an-unknown-tracker\.example)\//, (route) =>
    route.fulfill({ contentType: 'image/gif', body: '' }),
  );

  const page = await context.newPage();
  await page.goto(`${SANDBOX_ORIGIN}${path}`);
  return page;
}

async function readLedger(extensionPage: Page, pageDomain = 'facebook.test'): Promise<TabLedger | undefined> {
  return extensionPage.evaluate(async (domain) => {
    const all = await chrome.storage.session.get(null);
    return Object.values(all)
      .filter((value): value is TabLedger => typeof value === 'object' && value !== null)
      .find((value) => value.pageDomain === domain);
  }, pageDomain);
}

test('Facebook-like sandbox detects trackers without depending on Facebook', async ({
  context,
  extensionPage,
}) => {
  const page = await openSandbox(context, '/facebook');

  await expect(page.locator(WIDGET)).toBeAttached();
  await expect
    .poll(async () => (await readLedger(extensionPage))?.trackers ?? {}, { timeout: 15_000 })
    .toMatchObject({
      'google-analytics.com': { entityId: 'google', category: 1 },
      'hotjar.com': { entityId: 'contentsquare', category: 2 },
    });
});

test('sandbox checkout CTA remains clickable around the widget', async ({ context }) => {
  const page = await openSandbox(context, '/shopify');
  await expect(page.locator(WIDGET)).toBeAttached();
  await page.locator('#buy').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bought?: boolean }).__bought)).toBe(true);
});

test('hostile global CSS does not leak into the closed widget', async ({ context }) => {
  const page = await openSandbox(context, '/hostile-css');
  await expect(page.locator(WIDGET)).toBeAttached();
  expect(await page.locator(WIDGET).evaluate((node) => node.shadowRoot)).toBeNull();
  expect(await page.locator(WIDGET).evaluate((node) => node.childNodes.length)).toBe(0);
});

test('SPA navigation keeps one widget and updates the page ledger', async ({ context }) => {
  const page = await openSandbox(context, '/spa');
  await expect(page.locator(WIDGET)).toBeAttached();
  await page.locator('#navigate').click();
  await expect(page.locator('#view')).toHaveText('Next view');
  expect(await page.locator(WIDGET).count()).toBe(1);
});

test('nested sandbox frames do not receive a second widget', async ({ context }) => {
  const page = await openSandbox(context, '/iframe');
  await expect(page.locator(WIDGET)).toBeAttached();
  expect(await page.locator(WIDGET).count()).toBe(1);
  expect(await page.locator('iframe').contentFrame()?.locator(WIDGET).count()).toBe(0);
});

test('strict CSP sandbox still receives the extension widget', async ({ context }) => {
  const page = await openSandbox(context, '/csp');
  await expect(page.locator(WIDGET)).toBeAttached();
  await page.locator('#csp-button').click();
});
