import { expect, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';

const PAGE = 'https://shop.test/';
const WIDGET = 'ghostprint-counter';

const TRACKERS = `
<img src="https://www.google-analytics.com/collect?v=2">
<img src="https://static.hotjar.com/c/hotjar-1.js">
<img src="https://an-unknown-tracker.test/px.gif">`;

function html(extra = ''): string {
  return `<!doctype html><meta charset="utf-8"><title>shop</title>
<body style="margin:0;height:2000px">
<button id="cta" style="position:fixed;bottom:20px;right:20px;z-index:5"
        onclick="window.__clicked=true">Buy now</button>
${extra}${TRACKERS}`;
}

async function open(context: BrowserContext, body = html()): Promise<Page> {
  await context.route('**/*', (route) =>
    route.request().url() === PAGE
      ? route.fulfill({ contentType: 'text/html', body })
      : route.fulfill({ contentType: 'image/gif', body: '' }),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  Object.assign(page, { __errors: errors });
  await page.goto(PAGE);
  return page;
}

function errorsOf(page: Page): string[] {
  return (page as Page & { __errors: string[] }).__errors;
}

test('injects the counter and keeps its shadow root closed', async ({ context }) => {
  const page = await open(context);

  await expect(page.locator(WIDGET)).toBeAttached();

  // A closed shadow root is the isolation guarantee: the host page cannot read or
  // restyle our UI, and we cannot leak into theirs.
  const pierced = await page.evaluate(
    (sel) => document.querySelector(sel)?.shadowRoot ?? null,
    WIDGET,
  );
  expect(pierced).toBeNull();
});

test('renders within the collapsed size budget', async ({ context }) => {
  const page = await open(context);

  const box = await page.locator(WIDGET).boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeLessThanOrEqual(120);
  expect(box?.height).toBeLessThanOrEqual(40);
});

test('leaks no state onto the host page DOM', async ({ context }) => {
  const page = await open(context);
  await expect(page.locator(WIDGET)).toBeAttached();

  // Only positioning lives on the host element; tracker data stays in the closed root.
  const attributes = await page.locator(WIDGET).evaluate((node) =>
    Array.from(node.attributes).map((attribute) => attribute.name),
  );
  expect(attributes).toEqual(['style']);

  const childCount = await page.locator(WIDGET).evaluate((node) => node.childNodes.length);
  expect(childCount).toBe(0);
});

test('renders inside the viewport at phone, tablet and desktop widths', async ({ context }) => {
  const page = await open(context);
  await expect(page.locator(WIDGET)).toBeAttached();

  for (const [width, height] of [
    [360, 740],
    [768, 1024],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);

    const box = await page.locator(WIDGET).boundingBox();
    expect(box, `${width}x${height}`).not.toBeNull();
    expect(box!.x, `${width}x${height} left edge`).toBeGreaterThanOrEqual(0);
    expect(box!.y, `${width}x${height} top edge`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${width}x${height} right edge`).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height, `${width}x${height} bottom edge`).toBeLessThanOrEqual(height);
  }
});

test('never intercepts clicks on the host page', async ({ context }) => {
  const page = await open(context);
  await expect(page.locator(WIDGET)).toBeAttached();

  await page.locator('#cta').click();
  expect(await page.evaluate(() => (window as unknown as { __clicked?: boolean }).__clicked)).toBe(
    true,
  );
});

test('moves away from a fixed element occupying the preferred corner', async ({ context }) => {
  const bar = `<div id="bar" style="position:fixed;bottom:0;right:0;width:320px;height:90px;
       z-index:99999;background:#333"></div>`;
  const page = await open(context, html(bar));

  await expect(page.locator(WIDGET)).toBeAttached();

  const widget = await page.locator(WIDGET).boundingBox();
  const blocker = await page.locator('#bar').boundingBox();
  expect(widget).not.toBeNull();
  expect(blocker).not.toBeNull();

  const overlaps =
    widget !== null &&
    blocker !== null &&
    widget.x < blocker.x + blocker.width &&
    widget.x + widget.width > blocker.x &&
    widget.y < blocker.y + blocker.height &&
    widget.y + widget.height > blocker.y;
  expect(overlaps).toBe(false);
});

test('expands into the detail panel when activated', async ({ context }) => {
  const page = await open(context);
  const widget = page.locator(WIDGET);
  await expect(widget).toBeAttached();

  const collapsed = await widget.boundingBox();
  await widget.click();

  await expect
    .poll(async () => (await widget.boundingBox())?.height ?? 0, { timeout: 15_000 })
    .toBeGreaterThan(collapsed?.height ?? 0);

  const expanded = await widget.boundingBox();
  expect(expanded?.width).toBeLessThanOrEqual(320);
  expect(expanded?.height).toBeLessThanOrEqual(400);
});

test('stays out of sub-frames', async ({ context }) => {
  const framed = `<iframe src="${PAGE}sub" style="width:300px;height:200px"></iframe>`;
  const page = await open(context, html(framed));
  await expect(page.locator(WIDGET)).toBeAttached();

  expect(await page.locator(WIDGET).count()).toBe(1);
});

/** The install handler seeds defaults asynchronously; overwriting before it lands races. */
async function afterDefaultsSeeded(extensionPage: Page): Promise<void> {
  await expect
    .poll(
      () =>
        extensionPage.evaluate(async () => {
          const { settings } = await chrome.storage.local.get('settings');
          return settings !== undefined;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

test('does not inject on muted origins', async ({ context, extensionPage }) => {
  await afterDefaultsSeeded(extensionPage);
  await extensionPage.evaluate(
    (origin) => chrome.storage.local.set({ mutedOrigins: [origin] }),
    'https://shop.test',
  );

  const page = await open(context);
  await page.waitForTimeout(1500);
  await expect(page.locator(WIDGET)).toHaveCount(0);
});

test('does not inject when the counter is switched off', async ({ context, extensionPage }) => {
  await afterDefaultsSeeded(extensionPage);
  await extensionPage.evaluate(() =>
    chrome.storage.local.set({ settings: { enabled: true, showCounter: false } }),
  );

  const page = await open(context);
  await page.waitForTimeout(1500);
  await expect(page.locator(WIDGET)).toHaveCount(0);
});

test('logs no console errors on a normal page', async ({ context }) => {
  const page = await open(context);
  await expect(page.locator(WIDGET)).toBeAttached();
  await page.waitForTimeout(1000);

  expect(errorsOf(page)).toEqual([]);
});
