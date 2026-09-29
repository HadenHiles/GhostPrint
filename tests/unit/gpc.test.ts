import { describe, expect, it } from 'vitest';
import { isGpcExcepted, normalizeGpcException } from '@/shared/gpc';

describe('GPC site exceptions', () => {
  it('normalizes hostnames and rejects URLs or malformed values', () => {
    expect(normalizeGpcException('  Shop.Example.com  ')).toBe('shop.example.com');
    for (const invalid of ['', 'https://example.com', 'example.com/path', 'example.com:443', '*.example.com', '..example.com']) {
      expect(normalizeGpcException(invalid), invalid).toBeNull();
    }
  });

  it('matches an exception host and its subdomains only', () => {
    expect(isGpcExcepted('shop.example.com', ['example.com'])).toBe(true);
    expect(isGpcExcepted('example.com', ['example.com'])).toBe(true);
    expect(isGpcExcepted('notexample.com', ['example.com'])).toBe(false);
  });
});