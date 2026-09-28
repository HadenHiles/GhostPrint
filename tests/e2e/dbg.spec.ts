import { test } from './fixtures';

const PAGE = 'https://shop.test/';
const HTML = `<!doctype html><title>shop</title>
<img src="https://www.google-analytics.com/collect?v=2">
<img src="https://static.hotjar.com/c/hotjar-1.js">`;

test('dbg', async ({ context, extensionId, extensionPage }) => {
  await context.route(/^https?:\/\//, (route) =>
    route.request().url() === PAGE
      ? route.fulfill({ contentType: 'text/html', body: HTML })
      : route.fulfill({ contentType: 'image/gif', body: '' }),
  );
  const page = await context.newPage();
  await page.goto(PAGE);
  await page.waitForTimeout(2500);

  console.log(
    'session:',
    JSON.stringify(await extensionPage.evaluate(() => chrome.storage.session.get(null))),
  );
  console.log(
    'local:',
    JSON.stringify(await extensionPage.evaluate(() => chrome.storage.local.get(null))),
  );

  const popup = await context.newPage();
  popup.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await popup.waitForTimeout(2000);
  console.log('page-total:', await popup.locator('#page-total').textContent());
  console.log('week-total:', await popup.locator('#week-total').textContent());
  console.log('site:', await popup.locator('#site').textContent());
});
