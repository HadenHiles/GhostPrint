import type { WidgetAnchor } from '@/shared/storage';

/** Preference order: bottom-right first, then the remaining corners. */
export const ANCHOR_ORDER: WidgetAnchor[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

const EDGE_GAP = 16;
const PROBE_INSET = 24;

export function anchorStyle(anchor: WidgetAnchor): Record<string, string> {
  const [vertical, horizontal] = anchor.split('-');
  return {
    top: vertical === 'top' ? `${EDGE_GAP}px` : 'auto',
    bottom: vertical === 'bottom' ? `${EDGE_GAP}px` : 'auto',
    left: horizontal === 'left' ? `${EDGE_GAP}px` : 'auto',
    right: horizontal === 'right' ? `${EDGE_GAP}px` : 'auto',
  };
}

/**
 * Picks the first corner not already occupied by a fixed or sticky element.
 *
 * The host element's z-index is deliberately not considered: the widget renders at the
 * maximum stacking level, so it covers whatever is there regardless. Only positioning
 * matters -- statically positioned content scrolls out from under us, fixed and sticky
 * content (chat bubbles, cookie bars, checkout CTAs) stays covered.
 *
 * Falls back to the preferred corner when every corner is contested: covering a small
 * part of the page is better than refusing to render.
 */
export function pickAnchor(
  host: Element,
  preferred: WidgetAnchor | null,
  probe: (x: number, y: number) => Element[] = (x, y) => document.elementsFromPoint(x, y),
): WidgetAnchor {
  const order =
    preferred === null ? ANCHOR_ORDER : [preferred, ...ANCHOR_ORDER.filter((a) => a !== preferred)];

  for (const anchor of order) {
    if (!isContested(anchor, host, probe)) return anchor;
  }
  return order[0] ?? 'bottom-right';
}

function isContested(
  anchor: WidgetAnchor,
  host: Element,
  probe: (x: number, y: number) => Element[],
): boolean {
  const [vertical, horizontal] = anchor.split('-');
  const x = horizontal === 'left' ? PROBE_INSET : window.innerWidth - PROBE_INSET;
  const y = vertical === 'top' ? PROBE_INSET : window.innerHeight - PROBE_INSET;

  for (const element of probe(x, y)) {
    // The shadow root is closed, so the host element itself is what surfaces here.
    if (element === host || host.contains(element)) continue;
    if (element === document.documentElement || element === document.body) continue;

    const style = getComputedStyle(element);
    if (style.position === 'fixed' || style.position === 'sticky') return true;
  }
  return false;
}
