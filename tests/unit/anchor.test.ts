import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ANCHOR_ORDER, anchorStyle, pickAnchor } from '@/content/ghost-counter/anchor';

/**
 * The anchor logic runs against the host page's DOM, so the browser globals it touches
 * are stubbed here rather than pulling in a full DOM environment.
 */
const host = { contains: () => false } as unknown as Element;

function stubElement(position: string, zIndex: string): Element {
  return { __style: { position, zIndex } } as unknown as Element;
}

beforeEach(() => {
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
  vi.stubGlobal('document', { documentElement: {}, body: {} });
  vi.stubGlobal('getComputedStyle', (element: { __style: CSSStyleDeclaration }) => element.__style);
});

describe('anchorStyle', () => {
  it('pins exactly one horizontal and one vertical edge', () => {
    expect(anchorStyle('bottom-right')).toEqual({
      top: 'auto',
      bottom: '16px',
      left: 'auto',
      right: '16px',
    });
    expect(anchorStyle('top-left')).toEqual({
      top: '16px',
      bottom: 'auto',
      left: '16px',
      right: 'auto',
    });
  });
});

describe('pickAnchor', () => {
  it('defaults to bottom-right when nothing is in the way', () => {
    expect(pickAnchor(host, null, () => [])).toBe('bottom-right');
  });

  it('honours a stored preference', () => {
    expect(pickAnchor(host, 'top-left', () => [])).toBe('top-left');
  });

  it('moves away from a fixed element regardless of its z-index', () => {
    // Regression: a checkout CTA with z-index 5 was being covered, because the widget
    // paints at the maximum stacking level no matter what the host page uses.
    const probe = (x: number) => (x > 640 ? [stubElement('fixed', '5')] : []);
    expect(pickAnchor(host, null, probe)).toBe('bottom-left');
  });

  it('moves away from a high-stacking fixed element', () => {
    const blocked = stubElement('fixed', '9999');
    // Bottom-right is contested; bottom-left is clear.
    const probe = (x: number) => (x > 640 ? [blocked] : []);
    expect(pickAnchor(host, null, probe)).toBe('bottom-left');
  });

  it('treats sticky elements as blocking too', () => {
    const probe = (x: number) => (x > 640 ? [stubElement('sticky', '5000')] : []);
    expect(pickAnchor(host, null, probe)).toBe('bottom-left');
  });

  it('ignores statically positioned elements, which scroll away', () => {
    const probe = () => [stubElement('static', '99999'), stubElement('relative', '99999')];
    expect(pickAnchor(host, null, probe)).toBe('bottom-right');
  });

  it('treats auto z-index on a fixed element as blocking', () => {
    const probe = (x: number) => (x > 640 ? [stubElement('fixed', 'auto')] : []);
    expect(pickAnchor(host, null, probe)).toBe('bottom-left');
  });

  it('never returns the host element as a blocker', () => {
    expect(pickAnchor(host, null, () => [host])).toBe('bottom-right');
  });

  it('ignores the root and body elements', () => {
    const probe = () => [document.documentElement, document.body];
    expect(pickAnchor(host, null, probe)).toBe('bottom-right');
  });

  it('falls back to the preferred corner when every corner is contested', () => {
    const probe = () => [stubElement('fixed', '9999')];
    expect(pickAnchor(host, 'top-right', probe)).toBe('top-right');
    expect(pickAnchor(host, null, probe)).toBe('bottom-right');
  });

  it('tries every corner before giving up', () => {
    const seen: string[] = [];
    const probe = (x: number, y: number) => {
      seen.push(`${x},${y}`);
      return [stubElement('fixed', '9999')];
    };
    pickAnchor(host, null, probe);
    expect(seen).toHaveLength(ANCHOR_ORDER.length);
    expect(new Set(seen).size).toBe(ANCHOR_ORDER.length);
  });
});
