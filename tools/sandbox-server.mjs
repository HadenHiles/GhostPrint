import { createServer } from 'node:http';

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://sandbox.test').pathname;
  const pages = {
    '/facebook': facebookPage(),
    '/shopify': shopifyPage(),
    '/hostile-css': hostileCssPage(),
    '/spa': spaPage(),
    '/iframe': iframePage(),
    '/csp': cspPage(),
  };

  if (path === '/asset.js') {
    response.writeHead(200, { 'content-type': 'application/javascript' });
    response.end('window.__sandboxAsset = true;');
    return;
  }

  const body = new Map(Object.entries(pages)).get(path) ?? notFoundPage();
  const headers = { 'content-type': 'text/html; charset=utf-8' };
  if (path === '/csp') {
    headers['content-security-policy'] = "default-src 'self'; script-src 'self'";
  }
  response.writeHead(path in pages ? 200 : 404, headers);
  response.end(body);
});

server.listen(4173, '127.0.0.1');

function shell(title, body, script = '') {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; font-family: Comic Sans MS, cursive; }
  body { margin: 0; min-height: 2000px; background: #10131a; color: #f4f7ff; }
  header { position: fixed; inset: 0 0 auto; height: 64px; z-index: 5; background: #243047; padding: 18px 24px; }
  nav { display: flex; gap: 18px; }
  .chat { position: fixed; right: 18px; bottom: 18px; z-index: 4; padding: 18px; background: #f06; color: #fff; }
  .cookie { position: fixed; left: 0; right: 0; bottom: 0; z-index: 7; padding: 12px; background: #ffe17a; color: #111; }
  main { padding: 110px 24px; max-width: 900px; }
  button { padding: 12px 18px; }
</style></head><body>${body}${script}</body></html>`;
}

function trackers() {
  return `<img src="https://www.google-analytics.com/collect?v=2" alt="">
<img src="https://static.hotjar.com/c/hotjar-1.js" alt="">
<img src="https://an-unknown-tracker.example/pixel" alt="">`;
}

function facebookPage() {
  return shell('Facebook sandbox', `<header><nav><strong>Social</strong><span>Home</span><span>Friends</span><span>Marketplace</span></nav></header>
<main><h1>Facebook-like sandbox</h1><p>This local page simulates a social feed with fixed navigation and chat UI.</p><button id="primary" onclick="window.__clicked=true">Create post</button>${trackers()}</main>
<div class="chat">Chat</div><div class="cookie">Privacy choices</div>`);
}

function shopifyPage() {
  return shell('Shopify sandbox', `<header><nav><strong>Store</strong><span>Catalog</span><span>Orders</span></nav></header>
<main><h1>Shopify-like checkout</h1><p>Product and checkout controls remain clickable while GhostPrint is active.</p><button id="buy" onclick="window.__bought=true">Buy now</button>${trackers()}</main>`);
}

function hostileCssPage() {
  return shell('Hostile CSS sandbox', `<header><nav>Host CSS reset</nav></header>
<main><h1>Hostile stylesheet page</h1><p>The widget must remain isolated from global rules.</p>${trackers()}</main>
<div class="chat">Support</div><div class="cookie">Cookies</div>`);
}

function spaPage() {
  return shell('SPA sandbox', `<header><nav>SPA navigation</nav></header>
<main><h1 id="view">Home view</h1><button id="navigate">Navigate without reload</button>${trackers()}</main>`, `<script>
  document.getElementById('navigate').addEventListener('click', () => {
    history.pushState({}, '', '/spa?view=next');
    document.getElementById('view').textContent = 'Next view';
  });
</script>`);
}

function iframePage() {
  return shell('Frame sandbox', `<main><h1>Top frame</h1><iframe src="/facebook" title="nested page"></iframe>${trackers()}</main>`);
}

function cspPage() {
  return shell('CSP sandbox', `<main><h1>Strict CSP page</h1><button id="csp-button">CSP button</button>${trackers()}</main>`);
}

function notFoundPage() {
  return shell('Not found', '<main><h1>Not found</h1></main>');
}
