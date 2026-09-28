import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Enforces the Phase 1/2 zero-egress constraint mechanically: no shipped code may
 * contain a network primitive. Update this only alongside an explicit, consented
 * opt-in gate (see ROADMAP P2-06 / P3-00).
 */
const FORBIDDEN = [
    { pattern: /\bfetch\s*\(/, name: 'fetch()' },
    { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' },
    { pattern: /\bsendBeacon\b/, name: 'navigator.sendBeacon' },
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
        if (pattern.test(source)) violations.push(`${file.slice(DIST.length + 1)}: ${name}`);
    }
}

if (violations.length > 0) {
    console.error('Egress check failed. Network primitives found in dist/:');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
}

console.log('Egress check passed: no network primitives in dist/.');
