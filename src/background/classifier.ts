import rawTrackerData from '@/data/trackers.json';
import { getRegistrableDomain, toHostname } from '@/shared/domain';
import { TrackerCategory } from '@/shared/types';
import type { EntityRecord, HostRecord, TrackerDictionary } from '@/shared/types';

export interface Classification {
  /** The dictionary key that matched, or the request host when unmatched. */
  host: string;
  /** eTLD+1, used for grouping and display. */
  domain: string;
  entityId: string | null;
  entityName: string | null;
  category: TrackerCategory;
}

// JSON imports widen tuples to arrays; the shape is enforced by the dictionary tests.
const trackerData = rawTrackerData as unknown as TrackerDictionary;

const hosts = new Map<string, HostRecord>(Object.entries(trackerData.hosts));
const entities = new Map<string, EntityRecord>(Object.entries(trackerData.entities));

/**
 * Session-replay and keystroke-capture vendors always classify as Behavioral, whatever
 * an upstream source says. This is the category users care most about, so it must not
 * depend on a third party's taxonomy drifting.
 */
const BEHAVIORAL_OVERRIDES = new Set([
  'fullstory.com',
  'hotjar.com',
  'quantummetric.com',
  'glassboxdigital.io',
  'contentsquare.net',
  'logrocket.com',
  'clarity.ms',
  'mouseflow.com',
  'inspectlet.com',
  'smartlook.com',
]);

/**
 * Resolves a request URL to its tracker classification, or null if the host is not a
 * known tracker.
 *
 * Matching walks the hostname from most to least specific, so `a.b.tracker.com` matches
 * a `tracker.com` entry. It never widens past a dictionary entry, which is what keeps
 * shared hosts such as `cloudfront.net` from being classified wholesale.
 */
export function classify(requestUrl: string): Classification | null {
  const host = toHostname(requestUrl);
  if (host === null) return null;

  const domain = getRegistrableDomain(requestUrl);
  if (domain === null) return null;

  const match = lookup(host);
  if (match === null) return null;

  const [matchedHost, entityId, category] = match;
  const entity = entities.get(entityId);

  return {
    host: matchedHost,
    domain,
    entityId,
    entityName: entity?.displayName ?? null,
    category: BEHAVIORAL_OVERRIDES.has(domain) ? TrackerCategory.Behavioral : toCategory(category),
  };
}

/** A third-party request whose host is not in the dictionary. Counted, never dropped. */
export function classifyUnknown(requestUrl: string): Classification | null {
  const host = toHostname(requestUrl);
  const domain = getRegistrableDomain(requestUrl);
  if (host === null || domain === null) return null;

  return {
    host,
    domain,
    entityId: null,
    entityName: null,
    category: TrackerCategory.Unknown,
  };
}

export function getEntity(entityId: string): EntityRecord | null {
  return entities.get(entityId) ?? null;
}

export const dictionaryVersion = trackerData.version;
export const dictionarySize = hosts.size;

function lookup(host: string): [string, string, number] | null {
  const labels = host.split('.');

  // Stop before the final label so a bare TLD is never treated as a candidate.
  for (let i = 0; i < labels.length - 1; i += 1) {
    const candidate = labels.slice(i).join('.');
    const record = hosts.get(candidate);
    if (record !== undefined) return [candidate, record[0], record[1]];
  }
  return null;
}

function toCategory(value: number): TrackerCategory {
  switch (value) {
    case 0:
      return TrackerCategory.Advertising;
    case 1:
      return TrackerCategory.Analytics;
    case 2:
      return TrackerCategory.Behavioral;
    default:
      return TrackerCategory.Unknown;
  }
}
