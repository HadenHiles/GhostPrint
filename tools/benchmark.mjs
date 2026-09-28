import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const EXTENSION_PATH = join(ROOT, 'dist');
const URL_FILE = join(ROOT, 'tools/performance-sites.json');
const RUNS = 5;
const MAX_DEGRADATION_PERCENT = 5;
const AGGREGATE_LIMIT_PERCENT = 2;
const OUTPUT_JSON = join(ROOT, 'bench-results.json');
const OUTPUT_MARKDOWN = join(ROOT, 'bench-results.md');

const fixtureMode = process.argv.includes('--fixture');
const required = process.argv.includes('--required');

const fixtureHtml = `<!doctype html><meta charset="utf-8"><title>GhostPrint benchmark fixture</title>
<style>body{font:16px sans-serif}main{max-width:48rem;margin:4rem auto}</style>
<main><h1>Benchmark fixture</h1><p>This page is intentionally local and deterministic.</p></main>`;

let fixtureServer;
let urls;
if (fixtureMode) {
  fixtureServer = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(fixtureHtml);
  });
  await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  urls = [`http://127.0.0.1:${fixtureServer.address().port}/`];
} else {
  if (!existsSync(URL_FILE)) throw new Error(`Missing benchmark URL file: ${URL_FILE}`);
  urls = JSON.parse(readFileSync(URL_FILE, 'utf8'));
}

if (!Array.isArray(urls) || urls.length === 0 || urls.some((url) => typeof url !== 'string')) {
  throw new Error('Benchmark URL input must be a non-empty JSON array of strings.');
}
if (!fixtureMode && urls.length !== 50) {
  throw new Error(`Expected exactly 50 benchmark URLs, received ${urls.length}.`);
}

const results = [];
try {
  for (const url of urls) {
    const baseline = await measureVariant(url, false);
    const treatment = await measureVariant(url, true);
    results.push(compare(url, baseline, treatment));
    console.log(formatLine(results.at(-1)));
  }
} finally {
  await fixtureServer?.close();
}

const available = results.filter((result) => result.status === 'measured');
const failed = results.filter((result) => result.status === 'error');
const summary = buildSummary(available);
const output = {
  generatedAt: new Date().toISOString(),
  fixtureMode,
  runs: RUNS,
  thresholds: {
    perSitePercent: MAX_DEGRADATION_PERCENT,
    aggregatePercent: AGGREGATE_LIMIT_PERCENT,
  },
  sites: results,
  summary,
};

writeFileSync(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(OUTPUT_MARKDOWN, renderMarkdown(output));

console.log(`Measured ${available.length}/${results.length} sites.`);
console.log(`Results: ${OUTPUT_JSON}`);
console.log(`Report: ${OUTPUT_MARKDOWN}`);

if (failed.length > 0 && required) {
  throw new Error(`${failed.length} benchmark sites failed and --required was supplied.`);
}
if (!fixtureMode && available.length > 0 && (summary.aggregateDegradationPercent > AGGREGATE_LIMIT_PERCENT || summary.worstSiteDegradationPercent > MAX_DEGRADATION_PERCENT)) {
  throw new Error(
    `Performance threshold exceeded: aggregate ${summary.aggregateDegradationPercent.toFixed(2)}%, worst site ${summary.worstSiteDegradationPercent.toFixed(2)}%.`,
  );
}
if (available.length === 0 && required) {
  throw new Error('No benchmark sites were measured. Network access is required in --required mode.');
}

async function measureVariant(url, extension) {
  const args = extension
    ? [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
    : [];
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args,
  });
  const values = [];
  let error = null;

  try {
    for (let run = 0; run < RUNS; run += 1) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
        const metrics = await page.evaluate(() => {
          const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1)?.startTime;
          const fcp = performance
            .getEntriesByType('paint')
            .find((entry) => entry.name === 'first-contentful-paint')?.startTime;
          const timing = performance.timing;
          return {
            lcp: lcp ?? fcp ?? timing.loadEventEnd - timing.navigationStart,
            lcpSource: lcp === undefined ? (fcp === undefined ? 'loadEventEnd' : 'first-contentful-paint') : 'largest-contentful-paint',
            domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
            loadEventEnd: timing.loadEventEnd - timing.navigationStart,
          };
        });
        if (metrics.lcp === null || metrics.domContentLoaded < 0 || metrics.loadEventEnd < 0) {
          throw new Error('Required performance metrics were unavailable.');
        }
        values.push(metrics);
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
        break;
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }

  return error === null ? { values } : { error };
}

function compare(url, baseline, treatment) {
  if (baseline.error || treatment.error) {
    return { url, status: 'error', error: baseline.error ?? treatment.error };
  }

  const baselineMedian = medianMetrics(discardSlowest(baseline.values));
  const treatmentMedian = medianMetrics(discardSlowest(treatment.values));
  const degradation = {
    lcp: percent(treatmentMedian.lcp, baselineMedian.lcp),
    domContentLoaded: percent(treatmentMedian.domContentLoaded, baselineMedian.domContentLoaded),
    loadEventEnd: percent(treatmentMedian.loadEventEnd, baselineMedian.loadEventEnd),
  };

  return {
    url,
    status: 'measured',
    baseline: baselineMedian,
    treatment: treatmentMedian,
    degradationPercent: degradation,
    worstDegradationPercent: Math.max(...Object.values(degradation)),
  };
}

function discardSlowest(values) {
  return [...values].sort((a, b) => b.loadEventEnd - a.loadEventEnd).slice(1);
}

function medianMetrics(values) {
  return {
    lcp: median(values.map((value) => value.lcp)),
    domContentLoaded: median(values.map((value) => value.domContentLoaded)),
    loadEventEnd: median(values.map((value) => value.loadEventEnd)),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return sorted.slice(middle - 1, middle + 1).reduce((sum, value) => sum + value, 0) / 2;
  }
  return sorted.slice(middle, middle + 1).at(0);
}

function percent(treatment, baseline) {
  return baseline === 0 ? 0 : ((treatment - baseline) / baseline) * 100;
}

function buildSummary(results) {
  if (results.length === 0) {
    return {
      measuredSites: 0,
      aggregateDegradationPercent: 0,
      worstSiteDegradationPercent: 0,
    };
  }

  const baseline = results.map((result) => result.baseline.loadEventEnd);
  const treatment = results.map((result) => result.treatment.loadEventEnd);
  return {
    measuredSites: results.length,
    aggregateDegradationPercent: percent(median(treatment), median(baseline)),
    worstSiteDegradationPercent: Math.max(...results.map((result) => result.worstDegradationPercent)),
  };
}

function formatLine(result) {
  if (result.status === 'error') return `SKIP ${result.url}: ${result.error}`;
  return `${result.url}: worst ${result.worstDegradationPercent.toFixed(2)}%`;
}

function renderMarkdown(output) {
  const lines = [
    '# GhostPrint Performance Benchmark',
    '',
    `Generated: ${output.generatedAt} · runs per variant: ${output.runs} · fixture mode: ${output.fixtureMode}`,
    '',
    '| URL | Status | Baseline load | Treatment load | Worst degradation |',
    '|---|---:|---:|---:|---:|',
  ];

  for (const result of output.sites) {
    if (result.status === 'error') {
      lines.push(`| ${result.url} | error | - | - | ${result.error} |`);
    } else {
      lines.push(`| ${result.url} | measured | ${result.baseline.loadEventEnd.toFixed(1)} ms | ${result.treatment.loadEventEnd.toFixed(1)} ms | ${result.worstDegradationPercent.toFixed(2)}% |`);
    }
  }

  lines.push(
    '',
    `Aggregate degradation: ${output.summary.aggregateDegradationPercent.toFixed(2)}% (limit ${output.thresholds.aggregatePercent}%)`,
    `Worst site degradation: ${output.summary.worstSiteDegradationPercent.toFixed(2)}% (limit ${output.thresholds.perSitePercent}%)`,
  );
  return `${lines.join('\n')}\n`;
}
