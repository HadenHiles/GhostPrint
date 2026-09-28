import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { getDomain } from 'tldts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const EXTENSION_PATH = join(ROOT, 'dist');
const DEFAULT_URLS = join(ROOT, 'tools/performance-sites.json');
const RAW_OUTPUT = join(ROOT, 'crawl-results.json');
const PREVALENCE_OUTPUT = join(ROOT, 'prevalence-results.json');
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SETTLE_MS = 5_000;
const DEFAULT_LIMIT = 1_000;

const args = parseArgs(process.argv.slice(2));
const urls = readUrls(args.urlsFile ?? DEFAULT_URLS).slice(0, args.limit ?? DEFAULT_LIMIT);
if (urls.length === 0) throw new Error('No crawl URLs supplied.');

const results = [];
const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
});

try {
    for (const [index, url] of urls.entries()) {
        const result = await crawlSite(context, url, args);
        results.push(result);
        console.log(`[${index + 1}/${urls.length}] ${result.url}: ${result.status}, ${result.thirdPartyHosts.length} hosts`);
    }
} finally {
    await context.close();
}

const prevalence = aggregatePrevalence(results);
const output = {
    generatedAt: new Date().toISOString(),
    source: args.urlsFile ?? DEFAULT_URLS,
    requestedSites: urls.length,
    completedSites: results.filter((result) => result.status === 'complete').length,
    results,
};
writeFileSync(RAW_OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(
    PREVALENCE_OUTPUT,
    `${JSON.stringify({ generatedAt: output.generatedAt, sites: output.completedSites, hosts: prevalence }, null, 2)}\n`,
);

console.log(`Wrote ${RAW_OUTPUT}`);
console.log(`Wrote ${PREVALENCE_OUTPUT}`);

function parseArgs(argv) {
    let urlsFile;
    let limit;
    let settleMs = DEFAULT_SETTLE_MS;
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv.at(index);
        const value = argv.at(index + 1);
        if (argument === '--urls-file') urlsFile = value;
        else if (argument === '--limit') limit = Number(value);
        else if (argument === '--settle-ms') settleMs = Number(value);
        else if (argument === '--timeout-ms') timeoutMs = Number(value);
        else throw new Error(`Unknown argument: ${argument}`);
        index += 1;
    }
    return { urlsFile, limit, settleMs, timeoutMs };
}

function readUrls(file) {
    const input = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(input)) throw new Error(`${file} must contain a JSON array of URLs.`);
    return input.filter((url) => typeof url === 'string' && /^https?:\/\//.test(url));
}

async function crawlSite(context, url, options) {
    const page = await context.newPage();
    const requestHosts = new Set();
    let pageDomain = null;
    let error = null;

    page.on('request', (request) => {
        try {
            const requestUrl = new URL(request.url());
            if (!/^https?:$/.test(requestUrl.protocol)) return;
            const requestDomain = getDomain(requestUrl.hostname, { allowPrivateDomains: false });
            if (requestDomain === null || requestDomain === pageDomain) return;
            requestHosts.add(requestUrl.hostname.toLowerCase());
        } catch {
            // Ignore malformed or browser-internal request URLs.
        }
    });

    try {
        pageDomain = getDomain(new URL(url).hostname, { allowPrivateDomains: false });
        if (pageDomain === null) throw new Error('Page has no registrable domain.');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
        await page.waitForTimeout(options.settleMs);
    } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
    } finally {
        await page.close();
    }

    return {
        url,
        pageDomain,
        status: error === null ? 'complete' : 'error',
        error,
        thirdPartyHosts: [...requestHosts].sort(),
    };
}

function aggregatePrevalence(results) {
    const completed = results.filter((result) => result.status === 'complete');
    const counts = new Map();
    for (const result of completed) {
        for (const host of result.thirdPartyHosts) counts.set(host, (counts.get(host) ?? 0) + 1);
    }

    return Object.fromEntries(
        [...counts.entries()]
            .map(([host, count]) => [host, { sites: count, prevalence: count / completed.length }])
            .sort(([, a], [, b]) => b.prevalence - a.prevalence),
    );
}
