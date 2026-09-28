import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = join(ROOT, 'src');
const MANIFEST = join(SRC, 'public', 'manifest.json');
const REQUIRED_DOCS = ['docs/PRIVACY.md', 'docs/THREAT-MODEL.md'];

const FORBIDDEN_SOURCE = [
  { pattern: /\bfetch\s*\(/, name: 'fetch()' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' },
  { pattern: /\bsendBeacon\b/, name: 'navigator.sendBeacon' },
  { pattern: /\bEventSource\b/, name: 'EventSource' },
  { pattern: /\bnew\s+WebSocket\b/, name: 'WebSocket' },
  { pattern: /\bimportScripts\s*\(/, name: 'importScripts()' },
  { pattern: /\b(innerHTML|outerHTML)\b/, name: 'HTML string sink' },
  { pattern: /\binsertAdjacentHTML\b/, name: 'insertAdjacentHTML' },
  { pattern: /\bdocument\.(write|writeln)\s*\(/, name: 'document.write()' },
  { pattern: /window\.postMessage\s*\(/, name: 'window.postMessage()' },
  { pattern: /addEventListener\s*\(\s*['"]message['"]/, name: 'page message listener' },
];

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const violations = [];
for (const file of walk(SRC)) {
  if (!/\.(ts|js|html)$/.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const { pattern, name } of FORBIDDEN_SOURCE) {
    if (pattern.test(source)) violations.push(`${file.slice(ROOT.length + 1)}: ${name}`);
  }
}

for (const relative of REQUIRED_DOCS) {
  if (!existsSync(join(ROOT, relative))) violations.push(`${relative}: missing required document`);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const expectedPermissions = [
  'storage',
  'tabs',
  'webRequest',
  'declarativeNetRequest',
  'declarativeNetRequestFeedback',
  'webNavigation',
  'alarms',
];
for (const permission of expectedPermissions) {
  if (!manifest.permissions.includes(permission)) {
    violations.push(`src/public/manifest.json: missing permission ${permission}`);
  }
}

if (manifest.content_scripts?.some((script) => script.all_frames !== false)) {
  violations.push('src/public/manifest.json: content scripts must remain top-frame only');
}
if (manifest.content_security_policy?.extension_pages !== "script-src 'self'; object-src 'self'") {
  violations.push('src/public/manifest.json: unexpected extension-page CSP');
}

if (violations.length > 0) {
  console.error('Hardening check failed:');
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log('Hardening check passed: source, manifest, and privacy docs are within MVP policy.');
