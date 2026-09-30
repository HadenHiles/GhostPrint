import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Enforces local-first egress: no outbound calls are permitted except the single
 * count-only telemetry client, which requires explicit consent and a configured HTTPS
 * endpoint. Passive MAIN-world wrappers may refer to page APIs without invoking them.
 * Update this only with an explicit consent/privacy review.
 */
const FORBIDDEN = [
    { pattern: /\bfetch\s*\(/, name: 'fetch()' },
    { pattern: /\bXMLHttpRequest\s*\(/, name: 'XMLHttpRequest request construction' },
    { pattern: /\bsendBeacon\s*\(|\bnavigator\s*\[\s*['"]sendBeacon['"]\s*\]\s*\(/, name: 'navigator.sendBeacon()' },
    { pattern: /\bEventSource\b/, name: 'EventSource' },
    { pattern: /\bnew\s+WebSocket\b/, name: 'WebSocket' },
    { pattern: /\bimportScripts\s*\(/, name: 'importScripts()' },
];

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) yield* walk(full);
        else yield full;
    }
}

const violations = [];
for (const file of walk(DIST)) {
    if (!/\.(js|html)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const { pattern, name } of FORBIDDEN) {
        if (!pattern.test(source)) continue;
        if (name === 'fetch()' && isConsentedTelemetryFetch(source)) continue;
        violations.push(`${file.slice(DIST.length + 1)}: ${name}`);
    }
}

function isConsentedTelemetryFetch(source) {
    const calls = source.match(/\bfetch\s*\(/g) ?? [];
    return calls.length === 1 &&
        source.includes('no-referrer') &&
        source.includes('credentials') &&
        source.includes('omit') &&
        source.includes('count-only-v1') &&
        source.includes('granted') &&
        source.includes('https:');
}

if (violations.length > 0) {
    console.error('Egress check failed. Network primitives found in dist/:');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
}

console.log('Egress check passed: no unapproved outbound calls in dist/.');
