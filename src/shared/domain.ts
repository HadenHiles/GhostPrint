import { parse } from 'tldts';

const TRACKABLE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Registrable domain (eTLD+1) under ICANN rules only.
 *
 * ICANN-only is deliberate: the tracker dictionary is keyed the same way, so
 * `metrics.example.s3.amazonaws.com` must collapse to `amazonaws.com` to match.
 * Returns null for anything that cannot carry a third-party tracker: non-HTTP(S)
 * schemes, IP literals, and hostnames with no public suffix (e.g. `localhost`).
 */
export function getRegistrableDomain(url: string | null | undefined): string | null {
  const hostname = toHostname(url);
  if (hostname === null) return null;

  const { domain, isIp } = parse(hostname, { allowPrivateDomains: false });
  if (isIp === true || domain === null) return null;
  return domain.toLowerCase();
}

/**
 * Same-party test for a request against the page that initiated it.
 *
 * Uses private suffixes so that `a.github.io` and `b.github.io` are correctly
 * treated as different parties. Unresolvable inputs are reported as first-party
 * so that unknown edge cases never inflate the tracker count.
 */
export function isThirdParty(
  requestUrl: string | null | undefined,
  pageUrl: string | null | undefined,
): boolean {
  const requestHost = toHostname(requestUrl);
  const pageHost = toHostname(pageUrl);
  if (requestHost === null || pageHost === null) return false;
  if (requestHost === pageHost) return false;

  const request = parse(requestHost, { allowPrivateDomains: true });
  const page = parse(pageHost, { allowPrivateDomains: true });
  if (request.domain === null || page.domain === null) return false;

  return request.domain.toLowerCase() !== page.domain.toLowerCase();
}

/**
 * Normalized, punycoded hostname, or null if the URL is not HTTP(S) or is unparseable.
 * `new URL()` performs IDN -> punycode conversion for us.
 */
export function toHostname(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!TRACKABLE_PROTOCOLS.has(parsed.protocol)) return null;

  const hostname = parsed.hostname.toLowerCase();
  if (hostname.length === 0) return null;

  // URL keeps IPv6 literals bracketed; strip for consistent downstream handling.
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}
