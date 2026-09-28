import { describe, expect, it } from 'vitest';
import { getRegistrableDomain, isThirdParty, toHostname } from '@/shared/domain';

describe('toHostname', () => {
  const cases: [string | null | undefined, string | null][] = [
    ['https://example.com/a?b=c#d', 'example.com'],
    ['http://EXAMPLE.com', 'example.com'],
    ['https://user:pass@example.com:8443/x', 'example.com'],
    ['https://例え.テスト/', 'xn--r8jz45g.xn--zckzah'],
    ['https://bücher.de', 'xn--bcher-kva.de'],
    ['https://xn--bcher-kva.de', 'xn--bcher-kva.de'],
    ['https://[2001:db8::1]/x', '2001:db8::1'],
    ['about:blank', null],
    ['about:srcdoc', null],
    ['chrome://extensions', null],
    ['chrome-extension://abcdefg/popup.html', null],
    ['moz-extension://abc/x', null],
    ['data:text/html,<p>hi</p>', null],
    ['blob:https://example.com/uuid', null],
    ['javascript:alert(1)', null],
    ['ws://example.com/socket', null],
    ['wss://example.com/socket', null],
    ['file:///Users/x/index.html', null],
    ['ftp://example.com/f', null],
    ['not a url', null],
    ['', null],
    [null, null],
    [undefined, null],
  ];

  it.each(cases)('%s -> %s', (input, expected) => {
    expect(toHostname(input)).toBe(expected);
  });
});

describe('getRegistrableDomain', () => {
  const cases: [string | null | undefined, string | null][] = [
    // Simple
    ['https://example.com/', 'example.com'],
    ['https://www.example.com/', 'example.com'],
    ['https://a.b.c.example.com/', 'example.com'],
    ['https://EXAMPLE.COM/', 'example.com'],
    ['https://example.com.', 'example.com'],

    // Multi-part ICANN suffixes
    ['https://www.bbc.co.uk/news', 'bbc.co.uk'],
    ['https://shop.example.co.uk/', 'example.co.uk'],
    ['https://example.com.au/', 'example.com.au'],
    ['https://foo.bar.pvt.k12.ma.us/', 'bar.pvt.k12.ma.us'],
    ['https://example.co.jp/', 'example.co.jp'],

    // Private suffixes must collapse to the ICANN registrable domain
    ['https://bucket.s3.amazonaws.com/key', 'amazonaws.com'],
    ['https://s3.amazonaws.com/', 'amazonaws.com'],
    ['https://d123.cloudfront.net/x.js', 'cloudfront.net'],
    ['https://user.github.io/repo', 'github.io'],
    ['https://project.pages.dev/', 'pages.dev'],
    ['https://site.blogspot.com/', 'blogspot.com'],

    // Known trackers
    ['https://www.google-analytics.com/collect', 'google-analytics.com'],
    ['https://stats.g.doubleclick.net/j/collect', 'doubleclick.net'],
    ['https://connect.facebook.net/en_US/fbevents.js', 'facebook.net'],
    ['https://static.hotjar.com/c/hotjar-1.js', 'hotjar.com'],
    ['https://analytics.tiktok.com/i18n/pixel/events.js', 'tiktok.com'],
    ['https://dpm.demdex.net/id', 'demdex.net'],

    // IDN
    ['https://例え.テスト/', 'xn--r8jz45g.xn--zckzah'],
    ['https://shop.bücher.de/', 'xn--bcher-kva.de'],

    // IP literals
    ['http://127.0.0.1:8080/', null],
    ['http://192.168.1.10/', null],
    ['http://8.8.8.8/', null],
    ['https://[2001:db8::1]/', null],
    ['https://[::1]/', null],

    // No public suffix
    ['http://localhost/', null],
    ['http://localhost:3000/x', null],
    ['http://my-dev-box/', null],
    ['http://intranet/', null],

    // Non-HTTP schemes
    ['about:blank', null],
    ['chrome://settings', null],
    ['chrome-extension://abc/popup.html', null],
    ['data:text/javascript,void 0', null],
    ['blob:https://example.com/uuid', null],
    ['file:///tmp/a.html', null],
    ['ws://example.com/', null],

    // Junk
    ['', null],
    ['   ', null],
    ['https://', null],
    ['//example.com/x', null],
    ['example.com', null],
    [null, null],
    [undefined, null],
  ];

  it.each(cases)('%s -> %s', (input, expected) => {
    expect(getRegistrableDomain(input)).toBe(expected);
  });
});

describe('isThirdParty', () => {
  const cases: [string, string, boolean][] = [
    ['https://example.com/a.js', 'https://example.com/', false],
    ['https://cdn.example.com/a.js', 'https://www.example.com/', false],
    ['https://example.com/a.js', 'https://example.co.uk/', true],
    ['https://google-analytics.com/c', 'https://example.com/', true],
    ['https://doubleclick.net/x', 'https://google.com/', true],
    ['https://www.bbc.co.uk/x', 'https://bbc.co.uk/', false],
    ['https://evil.co.uk/x', 'https://bbc.co.uk/', true],

    // Private suffixes: sibling subdomains are genuinely different parties.
    ['https://attacker.github.io/x.js', 'https://victim.github.io/', true],
    ['https://victim.github.io/x.js', 'https://victim.github.io/', false],
    ['https://a.s3.amazonaws.com/x', 'https://b.s3.amazonaws.com/', true],

    // Unresolvable inputs must never inflate the count.
    ['about:blank', 'https://example.com/', false],
    ['data:text/javascript,0', 'https://example.com/', false],
    ['https://example.com/a.js', 'about:blank', false],
    ['https://example.com/a.js', 'chrome://newtab', false],
    ['http://127.0.0.1/a.js', 'http://localhost/', false],
    ['garbage', 'https://example.com/', false],
  ];

  it.each(cases)('%s on %s -> %s', (request, page, expected) => {
    expect(isThirdParty(request, page)).toBe(expected);
  });
});
