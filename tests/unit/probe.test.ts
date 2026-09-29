import { describe, expect, it } from 'vitest';
import { parseProbeMessage } from '@/content/probes';
import { TrackerCategory } from '@/shared/types';

const nonce = '0123456789abcdef0123456789abcdef';

function message(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    channel: 'ghostprint-probe',
    type: 'GHOSTPRINT_PROBE_EVENT',
    nonce,
    api: 'addEventListener',
    selector: 'input[type="text"]',
    scriptHost: 'static.hotjar.com',
    timestamp: 1_800_000_000_000,
    ...overrides,
  };
}

describe('probe message attribution', () => {
  it('attributes a third-party script host to its classified eTLD+1', () => {
    expect(parseProbeMessage(message(), nonce, 'https://shop.example.com/')).toEqual({
      domain: 'hotjar.com',
      entityId: 'contentsquare',
      entityName: 'Contentsquare',
      category: TrackerCategory.Behavioral,
      selector: 'input[type="text"]',
      api: 'addEventListener',
      timestamp: 1_800_000_000_000,
    });
  });

  it('rejects first-party sources and invalid bridge payloads', () => {
    expect(parseProbeMessage(message({ scriptHost: 'cdn.shop.example.com' }), nonce, 'https://shop.example.com/')).toBeNull();
    expect(parseProbeMessage(message({ nonce: 'wrong' }), nonce, 'https://shop.example.com/')).toBeNull();
    expect(parseProbeMessage(message({ api: 'keydown' }), nonce, 'https://shop.example.com/')).toBeNull();
    expect(parseProbeMessage(message({ selector: 'x'.repeat(257) }), nonce, 'https://shop.example.com/')).toBeNull();
  });

  it('rejects hosts without a registrable domain', () => {
    expect(parseProbeMessage(message({ scriptHost: 'localhost' }), nonce, 'https://shop.example.com/')).toBeNull();
  });
});