import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const METRICS = [
  'weekly_report_viewed',
  'share_clicked',
  'share_completed',
  'xray_toggled',
  'popup_opened',
  'w4_retained',
];

export function validateTelemetryPayload(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join(',') !== 'cohort,counts,hourBucket,version') return false;
  if (value.version !== 1 || typeof value.cohort !== 'string' || !/^[a-f0-9]{32}$/.test(value.cohort)) {
    return false;
  }
  if (!Number.isSafeInteger(value.hourBucket) || value.hourBucket < 0) return false;
  if (typeof value.counts !== 'object' || value.counts === null || Array.isArray(value.counts)) return false;

  const countEntries = Object.entries(value.counts);
  if (countEntries.length === 0) return false;
  let total = 0;
  for (const [metric, count] of countEntries) {
    if (!METRICS.includes(metric) || !Number.isSafeInteger(count) || count < 1 || count > 100_000) {
      return false;
    }
    total += count;
  }
  return total <= 100_000;
}

export function aggregateTelemetry(payloads, from, through) {
  const start = parseDate(from, '--from');
  const end = parseDate(through, '--through') + 24 * 60 * 60 * 1_000;
  if (start >= end) throw new Error('--from must be on or before --through');

  const counts = new Map(METRICS.map((metric) => [metric, 0]));
  let batchCount = 0;
  for (const payload of payloads) {
    if (!validateTelemetryPayload(payload)) throw new Error('Input contains an invalid telemetry payload');
    const timestamp = payload.hourBucket * 60 * 60 * 1_000;
    if (timestamp < start || timestamp >= end) continue;
    batchCount += 1;
    for (const [metric, count] of Object.entries(payload.counts)) {
      const total = (counts.get(metric) ?? 0) + count;
      if (!Number.isSafeInteger(total)) throw new Error(`Aggregated ${metric} count is too large`);
      counts.set(metric, total);
    }
  }
  return { from, through, batchCount, counts: Object.fromEntries(counts) };
}

export function renderMarkdown(summary, inputs) {
  const shareRate = ratio(summary.counts.share_completed, summary.counts.weekly_report_viewed);
  const referralRate = ratio(inputs.utmVisits, inputs.installs);
  const retentionRate = ratio(summary.counts.w4_retained, inputs.priorInstalls);
  const lines = [
    '# GhostPrint Telemetry Dashboard',
    '',
    `Reporting period: ${summary.from} through ${summary.through} (UTC)`,
    `Telemetry batches: ${summary.batchCount}`,
    '',
    '## Share and Referral',
    '',
    `- Report share completion: ${formatRatio(shareRate)} (${summary.counts.share_completed} completions / ${summary.counts.weekly_report_viewed} report views). This is an event ratio, not a unique-user rate.`,
    `- UTM landing visits per install: ${formatRatio(referralRate)} (${inputs.utmVisits} visits / ${inputs.installs} installs). Visits are not deduplicated people or installs and do not establish the 3% active-user share-rate gate.`,
    '',
    '## W4 Retention',
    '',
    `- Observed consented W4 returns: ${formatRatio(retentionRate)} (${summary.counts.w4_retained} returns / ${inputs.priorInstalls} installs from four weeks before the reporting period).`,
    '- Approximate only: telemetry has no stable installation identifier, the cohort token rotates weekly, and this event excludes users who do not consent or trigger telemetry at the four-week point.',
    '',
    '## Event Counts',
    '',
    '| Metric | Count |',
    '|---|---:|',
  ];
  for (const [metric, count] of Object.entries(summary.counts)) lines.push(`| ${metric} | ${count} |`);
  lines.push('', '> Counts are directional and can be spoofed. Duplicate R2 payload imports will be counted more than once.');
  return `${lines.join('\n')}\n`;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function formatRatio(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}

function parseDate(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid UTC date`);
  }
  return timestamp;
}

function parseCount(value, name) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer`);
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw new Error(`${name} is too large`);
  return count;
}

function readArguments(args) {
  const options = { inputs: [] };
  while (args.length > 0) {
    const flag = args.shift();
    const value = args.shift();
    if (flag === undefined || value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag ?? 'option'}`);
    }
    if (flag === '--input') options.inputs.push(value);
    else if (flag === '--from') options.from = value;
    else if (flag === '--through') options.through = value;
    else if (flag === '--installs') options.installs = parseCount(value, flag);
    else if (flag === '--utm-visits') options.utmVisits = parseCount(value, flag);
    else if (flag === '--prior-installs') options.priorInstalls = parseCount(value, flag);
    else if (flag === '--output') options.output = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  for (const [key, flag] of [
    ['from', '--from'],
    ['through', '--through'],
    ['installs', '--installs'],
    ['utmVisits', '--utm-visits'],
    ['priorInstalls', '--prior-installs'],
  ]) {
    if (!Object.hasOwn(options, key)) throw new Error(`Missing required option: ${flag}`);
  }
  if (options.inputs.length === 0) throw new Error('Provide at least one --input payload file');
  return options;
}

function readPayloadFiles(files) {
  const uniquePaths = new Set();
  return files.flatMap((file) => {
    const path = resolve(file);
    if (uniquePaths.has(path)) throw new Error(`Input file listed more than once: ${file}`);
    uniquePaths.add(path);
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const payloads = Array.isArray(parsed) ? parsed : [parsed];
    if (payloads.some((payload) => !validateTelemetryPayload(payload))) {
      throw new Error(`Invalid telemetry payload in ${file}`);
    }
    return payloads;
  });
}

function main() {
  try {
    const options = readArguments(process.argv.slice(2));
    const summary = aggregateTelemetry(readPayloadFiles(options.inputs), options.from, options.through);
    const report = renderMarkdown(summary, options);
    if (options.output === undefined) console.log(report.trimEnd());
    else writeFileSync(options.output, report);
  } catch (error) {
    console.error(`Telemetry dashboard: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Usage: npm run telemetry:dashboard -- --input <payload.json> [--input <payload.json> ...] --from YYYY-MM-DD --through YYYY-MM-DD --installs N --utm-visits N --prior-installs N [--output report.md]');
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();