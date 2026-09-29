import { expect, test } from './fixtures';

const PAGE_URL = 'https://example.test/';

test('service worker boots and seeds default settings', async ({ serviceWorker }) => {
  await expect
    .poll(
      () =>
        serviceWorker.evaluate(async () => {
          const { settings } = await chrome.storage.local.get('settings');
          return settings as {
            enabled: boolean;
            showCounter: boolean;
            particleOverlayEnabled: boolean;
            weeklyReportNotificationEnabled: boolean;
          } | undefined;
        }),
      { timeout: 10_000 },
    )
    .toEqual({
      enabled: true,
      showCounter: true,
      particleOverlayEnabled: false,
      weeklyReportNotificationEnabled: false,
    });
});

test('registers the X-Ray command and surfaces an unavailable shortcut', async ({ extensionPage }) => {
  const result = await extensionPage.evaluate(async () => {
    const commands = await chrome.commands.getAll();
    const xray = commands.find((command) => command.name === 'toggle-xray');
    const warning = document.querySelector<HTMLElement>('#xray-warning');
    return {
      registered: xray !== undefined,
      shortcut: xray?.shortcut ?? '',
      warningHidden: warning?.hidden ?? true,
    };
  });

  expect(result.registered).toBe(true);
  expect(result.warningHidden).toBe(result.shortcut !== '');
});

test('content script completes a round trip to the service worker', async ({ context }) => {
  await context.route(`${PAGE_URL}**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>t</title>' }),
  );
  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await expect(page.locator('html')).toHaveAttribute('data-ghostprint-ready', /^\d+$/, {
    timeout: 10_000,
  });
});

test('popup completes a round trip to the service worker', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await page.waitForFunction(() => document.body.dataset.ghostprintLoaded === 'true', undefined, {
    timeout: 15_000,
  });
});

test('options page clears all local data', async ({ context, extensionId, serviceWorker }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/index.html`);

  await serviceWorker.evaluate(() => chrome.storage.local.set({ mutedOrigins: ['x.example'] }));
  await page.locator('#clear').click();
  await expect(page.locator('#cleared')).toBeVisible();

  const muted = await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get('mutedOrigins')).mutedOrigins as string[],
  );
  expect(muted).toEqual([]);
});

test('weekly report notifications are opt-in and persist from Options', async ({
  context,
  extensionId,
  extensionPage,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/index.html`);
  const toggle = options.locator('#weekly-report-notification');
  await expect(toggle).not.toBeChecked();
  await toggle.check();

  await expect
    .poll(() =>
      extensionPage.evaluate(async () => {
        const local = await chrome.storage.local.get<{
          settings?: { weeklyReportNotificationEnabled?: boolean };
        }>('settings');
        return local.settings?.weeklyReportNotificationEnabled;
      }),
    )
    .toBe(true);
});
