import { getDomain } from 'tldts';

/**
 * EasyPrivacy adapter. Used under CC BY-SA 3.0, the permissive half of EasyList's dual
 * license (the other half is GPL-3.0-or-later). See docs/ADR-002.
 */
export const SOURCE = {
    id: 'easyprivacy',
    title: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    license: 'CC BY-SA 3.0',
    attribution: 'The EasyList authors (https://easylist.to/)',
};

/** Domain-anchored pattern with no path component: `||host^` or `||host`. */
const HOST_ONLY = /^[a-z0-9.-]+\^?$/i;

/**
 * Extracts hostnames that filter rules block in their entirety.
 *
 * Excluded on purpose:
 * - rules with a path (`||cdn.example.com/track.js`) -- these target a resource on a
 *   shared host, so treating the host as a tracker causes false positives;
 * - `$domain=`-scoped rules, which describe a narrow first-party relationship rather
 *   than a globally applicable tracker;
 * - exception (`@@`) and cosmetic (`##`) rules, which do not identify trackers.
 *
 * Hostnames are returned verbatim. Do not collapse to eTLD+1: `d2v9ip.cloudfront.net`
 * is a tracker host, `cloudfront.net` is not.
 */
export function extractHosts(listText) {
    const hosts = new Set();

    for (const rawLine of listText.split('\n')) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith('!') || line.startsWith('[')) continue;
        if (line.startsWith('@@')) continue;
        if (line.includes('##') || line.includes('#@#') || line.includes('#?#')) continue;
        if (!line.startsWith('||')) continue;

        const body = line.slice(2);
        const dollar = body.indexOf('$');
        const pattern = dollar === -1 ? body : body.slice(0, dollar);
        const options = dollar === -1 ? '' : body.slice(dollar + 1);

        if (/(^|,)~?domain=/.test(options)) continue;
        if (!HOST_ONLY.test(pattern)) continue;

        const host = pattern.replace(/\^$/, '').toLowerCase();
        if (getDomain(host, { allowPrivateDomains: false }) === null) continue;
        hosts.add(host);
    }

    return { hosts, version: extractVersion(listText) };
}

function extractVersion(listText) {
    const match = /^!\s*Version:\s*(\S+)/m.exec(listText);
    return match === null ? 'unknown' : match[1];
}
