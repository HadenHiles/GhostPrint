import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDomain } from 'tldts';
import { extractHosts, SOURCE } from './sources/easyprivacy.mjs';

/**
 * Generates src/data/trackers.json. The artifact is committed so `npm run build` never
 * touches the network; run `npm run update-trackers` to refresh it.
 *
 * The dictionary is keyed by HOSTNAME, not eTLD+1. Filter lists block specific hosts
 * (`match.adsrvr.org`, `d2v9ip.cloudfront.net`); collapsing those to the registrable
 * domain would mark all of CloudFront and AWS as trackers. See docs/ADR-002.
 *
 * Scope at MVP: entities with a verified corporate parent, enriched with the specific
 * tracking hosts EasyPrivacy lists underneath them. The broad unattributed tracker set
 * is deferred to P1-01b, which needs crawl-derived prevalence to rank and prune ~47k
 * host patterns down to a bundleable set.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ROOT = new URL('../', import.meta.url);
const CACHE_FILE = fileURLToPath(new URL('.cache/easyprivacy.txt', ROOT));
const SEED_FILE = fileURLToPath(new URL('tools/data/entities.seed.json', ROOT));
const OUT_FILE = fileURLToPath(new URL('src/data/trackers.json', ROOT));

const CATEGORY_NAMES = ['advertising', 'analytics', 'behavioral', 'unknown'];

async function readList() {
    const fresh =
        existsSync(CACHE_FILE) && Date.now() - statSync(CACHE_FILE).mtimeMs < CACHE_TTL_MS;
    if (fresh && !process.argv.includes('--refresh')) return readFileSync(CACHE_FILE, 'utf8');

    const response = await fetch(SOURCE.url);
    if (!response.ok) throw new Error(`${SOURCE.title}: HTTP ${response.status}`);
    const text = await response.text();
    mkdirSync(fileURLToPath(new URL('.cache/', ROOT)), { recursive: true });
    writeFileSync(CACHE_FILE, text);
    return text;
}

function loadSeed() {
    const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
    const entities = new Map();
    const byDomain = new Map();

    for (const entity of seed.entities) {
        if (entities.has(entity.id)) throw new Error(`Duplicate entity id: ${entity.id}`);
        entities.set(entity.id, { name: entity.name, displayName: entity.displayName });

        for (const [domain, category] of Object.entries(entity.domains)) {
            if (getDomain(domain, { allowPrivateDomains: false }) !== domain) {
                throw new Error(`Seed domain is not a registrable domain: ${domain}`);
            }
            if (byDomain.has(domain)) throw new Error(`Domain claimed by two entities: ${domain}`);
            if (!Number.isInteger(category) || category < 0 || category > 2) {
                throw new Error(`Invalid category for ${domain}: ${category}`);
            }
            byDomain.set(domain, { entityId: entity.id, category });
        }
    }
    return { entities, byDomain };
}

const listText = await readList();
const { hosts: listHosts, version } = extractHosts(listText);
const seed = loadSeed();

// Seed apexes are authoritative. EasyPrivacy hosts are included only when they sit under
// a seeded registrable domain, so a verified parent and category always apply.
const hosts = new Map();
for (const [domain, { entityId, category }] of seed.byDomain) {
    hosts.set(domain, [entityId, category]);
}

let enriched = 0;
for (const host of listHosts) {
    if (hosts.has(host)) continue;
    const registrable = getDomain(host, { allowPrivateDomains: false });
    const owner = registrable === null ? undefined : seed.byDomain.get(registrable);
    if (owner === undefined) continue;
    hosts.set(host, [owner.entityId, owner.category]);
    enriched += 1;
}

const usedEntityIds = new Set([...hosts.values()].map(([id]) => id));
const entities = Object.fromEntries(
    [...seed.entities.entries()].filter(([id]) => usedEntityIds.has(id)),
);

const artifact = {
    version: `${version}+seed`,
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: [
        SOURCE,
        {
            id: 'ghostprint-entities',
            title: 'GhostPrint entity map',
            license: 'Proprietary',
            attribution: 'GhostPrint',
        },
    ],
    categories: CATEGORY_NAMES,
    entities,
    hosts: Object.fromEntries([...hosts.entries()].sort(([a], [b]) => a.localeCompare(b))),
};

mkdirSync(fileURLToPath(new URL('src/data/', ROOT)), { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(artifact)}\n`);

console.log(`${SOURCE.title} ${version}: ${listHosts.size} host patterns available`);
console.log(`Seed: ${seed.byDomain.size} domains, ${Object.keys(entities).length} entities`);
console.log(`Enriched with ${enriched} hosts under seeded domains`);
console.log(
    `Wrote ${Object.keys(artifact.hosts).length} hosts, ${(statSync(OUT_FILE).size / 1024).toFixed(1)} KB`,
);
