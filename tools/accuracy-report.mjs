import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FIXTURE_DIR = join(ROOT, 'tests/fixtures/ground-truth');
const DATA_FILE = join(ROOT, 'src/data/trackers.json');
const JSON_OUTPUT = join(ROOT, 'accuracy-results.json');
const MARKDOWN_OUTPUT = join(ROOT, 'accuracy-results.md');
const TRACKER_DATA = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const HOSTS = new Map(Object.entries(TRACKER_DATA.hosts));

const files = readdirSync(FIXTURE_DIR).filter((file) => file.endsWith('.json')).sort();
const fixtures = files.map((file) => JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')));
const siteResults = fixtures.map(evaluateFixture);
const allRequests = siteResults.flatMap((site) => site.requests);
const metrics = measure(allRequests);
const output = {
    generatedAt: new Date().toISOString(),
    dictionaryVersion: TRACKER_DATA.version,
    fixtureCount: fixtures.length,
    captureTypes: [...new Set(fixtures.map((fixture) => fixture.captureType))],
    metrics,
    sites: siteResults.map((site) => ({
        siteId: site.siteId,
        siteUrl: site.siteUrl,
        platform: site.platform,
        captureType: site.captureType,
        labeledBy: site.labeledBy,
        labeledAt: site.labeledAt,
        metrics: site.metrics,
    })),
};

writeFileSync(JSON_OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(MARKDOWN_OUTPUT, renderMarkdown(output));

for (const site of siteResults) {
    console.log(`${site.siteId}: precision ${format(site.metrics.precision)}, recall ${format(site.metrics.recall)}`);
}
console.log(`Overall: precision ${format(metrics.precision)}, recall ${format(metrics.recall)}`);
console.log(`Results: ${JSON_OUTPUT}`);
console.log(`Report: ${MARKDOWN_OUTPUT}`);

function evaluateFixture(fixture) {
    const requests = fixture.requests.map((request) => {
        const predicted = lookupHost(new URL(request.url).hostname.toLowerCase());
        return {
            url: request.url,
            expectedTracker: request.expectedTracker,
            predictedTracker: predicted !== null,
            expectedCategory: request.expectedCategory,
            predictedCategory: predicted?.[1],
            expectedEntityId: request.expectedEntityId,
            predictedEntityId: predicted?.[0],
        };
    });

    return {
        siteId: fixture.siteId,
        siteUrl: fixture.siteUrl,
        platform: fixture.platform,
        captureType: fixture.captureType,
        labeledBy: fixture.labeledBy,
        labeledAt: fixture.labeledAt,
        metrics: measure(requests),
        requests,
    };
}

function lookupHost(host) {
    const labels = host.split('.');
    for (let index = 0; index < labels.length - 1; index += 1) {
        const candidate = labels.slice(index).join('.');
        const record = HOSTS.get(candidate);
        if (record !== undefined) return record;
    }
    return null;
}

function measure(requests) {
    let truePositives = 0;
    let trueNegatives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let entityMatches = 0;
    let entityMismatches = 0;
    const categoryConfusion = new Map();

    for (const request of requests) {
        if (request.expectedTracker && request.predictedTracker) truePositives += 1;
        else if (!request.expectedTracker && !request.predictedTracker) trueNegatives += 1;
        else if (!request.expectedTracker) falsePositives += 1;
        else falseNegatives += 1;

        if (request.expectedCategory !== undefined && request.predictedCategory !== undefined) {
            const key = `${request.expectedCategory}->${request.predictedCategory}`;
            categoryConfusion.set(key, (categoryConfusion.get(key) ?? 0) + 1);
        }

        if (request.expectedEntityId !== undefined) {
            if (request.expectedEntityId === request.predictedEntityId) entityMatches += 1;
            else entityMismatches += 1;
        }
    }

    return {
        total: requests.length,
        truePositives,
        trueNegatives,
        falsePositives,
        falseNegatives,
        precision: ratio(truePositives, truePositives + falsePositives),
        recall: ratio(truePositives, truePositives + falseNegatives),
        categoryConfusion: Object.fromEntries(categoryConfusion),
        entityMatches,
        entityMismatches,
    };
}

function ratio(numerator, denominator) {
    return denominator === 0 ? 1 : numerator / denominator;
}

function format(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function renderMarkdown(result) {
    const lines = [
        '# GhostPrint Detection Accuracy',
        '',
        `Generated: ${result.generatedAt} · dictionary: ${result.dictionaryVersion}`,
        `Corpus: ${result.fixtureCount} fixture(s) · capture types: ${result.captureTypes.join(', ')}`,
        '',
        '| Site | Platform | Capture type | Precision | Recall | Requests |',
        '|---|---|---|---:|---:|---:|',
    ];
    for (const site of result.sites) {
        lines.push(`| ${site.siteId} | ${site.platform} | ${site.captureType} | ${format(site.metrics.precision)} | ${format(site.metrics.recall)} | ${site.metrics.total} |`);
    }
    lines.push(
        '',
        `Overall precision: ${format(result.metrics.precision)}`,
        `Overall recall: ${format(result.metrics.recall)}`,
        '',
        '> Synthetic fixtures validate the evaluator and classifier regressions. They are not the live e-commerce success gate.',
    );
    return `${lines.join('\n')}\n`;
}
