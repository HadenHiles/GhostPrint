import { expect, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

const PAGE = 'https://shop.test/';
const HTML = `<!doctype html><title>shop</title>
<img src="https://www.google-analytics.com/collect?v=2">
<img src="https://static.hotjar.com/c/hotjar-1.js">
<img src="https://an-unknown-tracker.test/px.gif">`;

const EXPECTED_DOMAINS = 3;

async function recordedDomains(extensionPage: Page): Promise<number> {
  return extensionPage.evaluate(async () => {
    const { history } = await chrome.storage.local.get('history');
    const days = Object.values((history ?? {}) as Record<string, Record<string, unknown>>);
    return days.reduce((sum, day) => sum + Object.keys(day).length, 0);
  });
}

/**
 * Browses the fixture page and waits until the background has flushed every tracker.
 * The popup renders a snapshot, so opening it before the data settles reads stale state.
 */
async function browseShop(context: BrowserContext, extensionPage: Page): Promise<Page> {
  // Scoped to HTTP on purpose: a `**/*` pattern also intercepts chrome-extension://
  // navigations, which would serve the popup HTML as a stubbed image.
  await context.route(/^https?:\/\//, (route) =>
    route.request().url() === PAGE
      ? route.fulfill({ contentType: 'text/html', body: HTML })
      : route.fulfill({ contentType: 'image/gif', body: '' }),
  );

  const page = await context.newPage();
  await page.goto(PAGE);
  await page.bringToFront();

  await expect.poll(() => recordedDomains(extensionPage), { timeout: 15_000 }).toBe(
    EXPECTED_DOMAINS,
  );
  return page;
}

async function openPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await popup.waitForFunction(() => document.body.dataset.ghostprintLoaded === 'true', undefined, {
    timeout: 15_000,
  });
  return popup;
}

test('shows the current tab breakdown by category', async ({
  context,
  extensionId,
  extensionPage,
}) => {
  await browseShop(context, extensionPage);
  const popup = await openPopup(context, extensionId);

  await expect(popup.locator('#page-total')).toHaveText('3');
  await expect(popup.locator('#site')).toHaveText('shop.test');

  // One row per non-empty category: analytics, behavioral, unidentified.
  await expect(popup.locator('#page-rows .row')).toHaveCount(3);
  await expect(popup.locator('#page-rows .dot.c1')).toHaveCount(1);
  await expect(popup.locator('#page-rows .dot.c2')).toHaveCount(1);
  await expect(popup.locator('#page-rows .dot.c3')).toHaveCount(1);
});

test('reports the rolling weekly total and top entities', async ({
  context,
  extensionId,
  extensionPage,
}) => {
  await browseShop(context, extensionPage);
  const popup = await openPopup(context, extensionId);

  await expect(popup.locator('#week-total')).toHaveText('3');

  // Unattributed domains are counted but never given a fabricated parent.
  const entities = popup.locator('#week-entities .entity-name');
  await expect(entities).toHaveCount(2);
  await expect(entities).toHaveText(['Contentsquare', 'Google']);
});

test('caps the entity list at five', async ({ context, extensionId, extensionPage }) => {
  await browseShop(context, extensionPage);
  const popup = await openPopup(context, extensionId);

  const count = await popup.locator('#week-entities .entity').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);
});

test('renders its shell well before the service worker replies', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);

  // The shell is static markup, so first paint must not wait on a message round trip.
  await popup.waitForFunction(
    () => performance.getEntriesByType('paint').some((e) => e.name === 'first-contentful-paint'),
    undefined,
    { timeout: 15_000 },
  );

  const paint = await popup.evaluate(
    () =>
      performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')
        ?.startTime ?? Number.POSITIVE_INFINITY,
  );
  expect(paint).toBeLessThan(100);
});

test('clear data empties storage and resets the view', async ({
  context,
  extensionId,
  extensionPage,
}) => {
  await browseShop(context, extensionPage);
  const popup = await openPopup(context, extensionId);
  await expect(popup.locator('#week-total')).toHaveText('3');

  await popup.locator('#clear').click();
  await expect(popup.locator('#clear')).toHaveText('Confirm?');
  await popup.locator('#clear').click();

  await popup.waitForFunction(() => document.body.dataset.ghostprintCleared === 'true', undefined, {
    timeout: 15_000,
  });

  const after = await extensionPage.evaluate(async () => {
    const local = await chrome.storage.local.get(null);
    const session = await chrome.storage.session.get(null);
    return {
      historyDays: Object.keys(local.history ?? {}).length,
      mutedOrigins: local.mutedOrigins as string[],
      schemaVersion: local.schemaVersion as number,
      ledgerKeys: Object.keys(session).filter((key) => key.startsWith('ledger:')).length,
    };
  });

  expect(after.historyDays).toBe(0);
  expect(after.mutedOrigins).toEqual([]);
  expect(after.ledgerKeys).toBe(0);
  // Defaults are restored rather than leaving the extension in an unconfigured state.
  expect(after.schemaVersion).toBe(3);

  await expect(popup.locator('#week-total')).toHaveText('0');
});

test('requires confirmation before clearing', async ({
  context,
  extensionId,
  extensionPage,
}) => {
  await browseShop(context, extensionPage);
  const popup = await openPopup(context, extensionId);

  await popup.locator('#clear').click();
  await expect(popup.locator('#clear')).toHaveText('Confirm?');

  // A single click must never destroy data.
  expect(await recordedDomains(extensionPage)).toBe(EXPECTED_DOMAINS);
});

test('handles a tab with no recorded data', async ({ context, extensionId }) => {
  const popup = await openPopup(context, extensionId);
  await expect(popup.locator('#page-total')).toHaveText('0');
  await expect(popup.locator('#page-note')).toBeVisible();
});

test('particle effects are off by default and the popup toggle persists opt-in', async ({
  context,
  extensionId,
  extensionPage,
}) => {
  const popup = await openPopup(context, extensionId);
  const toggle = popup.locator('#particle-overlay');
  await expect(toggle).not.toBeChecked();
  await toggle.check();

  await expect
    .poll(() =>
      extensionPage.evaluate(async () => {
        const local = await chrome.storage.local.get<{
          settings?: { particleOverlayEnabled?: boolean };
        }>('settings');
        return local.settings?.particleOverlayEnabled;
      }),
    )
    .toBe(true);
});

test('shows the fee-equivalent estimate with a persistent disclaimer and methodology link', async ({
  context,
  extensionId,
  extensionPage,
}) => {
  await browseShop(context, extensionPage);
  const popup = await openPopup(context, extensionId);

  await expect(popup.locator('#value-amount')).toHaveText(/^\$\d+\.\d{3,4}$/);
  await expect(popup.getByText(/Estimate only\. This is not earnings/)).toBeVisible();
  await expect(popup.getByRole('link', { name: 'How is this calculated?' })).toHaveAttribute(
    'href',
    '../options/index.html#value-model',
  );

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/index.html#value-model`);
  await expect(options.locator('#value-model')).toBeVisible();
  await expect(options.getByText(/Legal review of this wording has not been completed/)).toBeVisible();
});

test('renders and redacts the local weekly share card', async ({ context, extensionId, extensionPage }) => {
  await browseShop(context, extensionPage);
  const popup = await openPopup(context, extensionId);
  const preview = popup.locator('#report-preview');
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]))
    .toEqual([1200, 630]);

  const firstPreview = await preview.getAttribute('src');
  await popup.locator('#report-redact').check();
  await expect.poll(() => preview.getAttribute('src')).not.toBe(firstPreview);

  const [download] = await Promise.all([
    popup.waitForEvent('download'),
    popup.locator('#report-download').click(),
  ]);
  expect(download.suggestedFilename()).toBe('ghostprint-weekly-report.png');
});
