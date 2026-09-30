import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = join(ROOT, 'src');
const MANIFEST = join(SRC, 'public', 'manifest.json');
const REQUIRED_DOCS = ['docs/PRIVACY.md', 'docs/THREAT-MODEL.md'];

const FORBIDDEN_SOURCE = [
    { pattern: /\bfetch\s*\(/, name: 'fetch()' },
    { pattern: /\bXMLHttpRequest\s*\(/, name: 'XMLHttpRequest request construction' },
    { pattern: /\bsendBeacon\s*\(|\bnavigator\s*\[\s*['"]sendBeacon['"]\s*\]\s*\(/, name: 'navigator.sendBeacon()' },
    { pattern: /\bEventSource\b/, name: 'EventSource' },
    { pattern: /\bnew\s+WebSocket\b/, name: 'WebSocket' },
    { pattern: /\bimportScripts\s*\(/, name: 'importScripts()' },
    { pattern: /\b(innerHTML|outerHTML)\b/, name: 'HTML string sink' },
    { pattern: /\binsertAdjacentHTML\b/, name: 'insertAdjacentHTML' },
    { pattern: /\bdocument\.(write|writeln)\s*\(/, name: 'document.write()' },
    { pattern: /window\.postMessage\s*\(/g, name: 'window.postMessage()' },
    { pattern: /addEventListener\s*\(\s*['"]message['"]/g, name: 'page message listener' },
];

const ALLOWED_BRIDGE_CALLS = new Map([
    ['src/content/probes/main.ts', new Map([['window.postMessage()', 2], ['page message listener', 5]])],
    ['src/content/probes/index.ts', new Map([['window.postMessage()', 3], ['page message listener', 1]])],
    ['src/content/index.ts', new Map([['window.postMessage()', 1]])],
]);
const TELEMETRY_SOURCE = 'src/shared/telemetry-client.ts';

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
    const relative = file.slice(ROOT.length).replace(/^[/\\]/, '');
    const allowedCalls = ALLOWED_BRIDGE_CALLS.get(relative);
    for (const { pattern, name } of FORBIDDEN_SOURCE) {
        const count = source.match(pattern)?.length ?? 0;
        const allowed = allowedCalls?.get(name) ?? 0;
        const consentedTelemetry =
            name === 'fetch()' &&
            relative === TELEMETRY_SOURCE &&
            count === 1 &&
            source.includes("consent !== 'granted'") &&
            source.includes('isSecureTelemetryEndpoint(endpoint)') &&
            source.includes('credentials:') &&
            source.includes("'omit'") &&
            source.includes('referrerPolicy:') &&
            source.includes("'no-referrer'") &&
            source.includes("'count-only-v1'");
        if (!consentedTelemetry && (count > allowed || (allowed > 0 && count !== allowed))) {
            violations.push(`${relative}: ${name} (${count} occurrence(s); ${allowed} allowed)`);
        }
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
    'notifications',
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

console.log('Hardening check passed: source, manifest, and privacy docs follow the local-first policy.');
