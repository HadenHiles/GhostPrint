import { anchorStyle, pickAnchor } from './anchor';
import { WIDGET_CSS } from './styles';
import { TrackerCategory } from '@/shared/types';
import type { CategoryTotals, LedgerSummary, TrackerDetail } from '@/shared/types';
import type { WidgetAnchor } from '@/shared/storage';

const CATEGORY_LABELS = new Map<TrackerCategory, string>([
  [TrackerCategory.Advertising, 'Advertising'],
  [TrackerCategory.Analytics, 'Analytics'],
  [TrackerCategory.Behavioral, 'Behavioral'],
  [TrackerCategory.Unknown, 'Unidentified'],
]);

function labelFor(category: TrackerCategory): string {
  return CATEGORY_LABELS.get(category) ?? 'Unidentified';
}

/** Literal-keyed so counts are read without a dynamic index into the totals record. */
function categoryEntries(totals: CategoryTotals): [TrackerCategory, number][] {
  return [
    [TrackerCategory.Advertising, totals[TrackerCategory.Advertising]],
    [TrackerCategory.Analytics, totals[TrackerCategory.Analytics]],
    [TrackerCategory.Behavioral, totals[TrackerCategory.Behavioral]],
    [TrackerCategory.Unknown, totals[TrackerCategory.Unknown]],
  ];
}

export interface WidgetCallbacks {
  onExpand: () => Promise<TrackerDetail[]>;
  onMuteOrigin: () => void;
  onDisable: () => void;
}

export class GhostCounter {
  private readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly container: HTMLDivElement;
  private readonly callbacks: WidgetCallbacks;

  private summary: LedgerSummary | null = null;
  private anchor: WidgetAnchor = 'bottom-right';
  private expanded = false;
  private resizeHandler: (() => void) | null = null;

  constructor(callbacks: WidgetCallbacks, preferredAnchor: WidgetAnchor | null) {
    this.callbacks = callbacks;

    this.host = document.createElement('ghostprint-counter');
    // Attach to documentElement: at document_start <body> may not exist yet.
    document.documentElement.appendChild(this.host);

    this.root = this.host.attachShadow({ mode: 'closed' });

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(WIDGET_CSS);
    this.root.adoptedStyleSheets = [sheet];

    this.container = document.createElement('div');
    this.container.className = 'root';
    this.root.appendChild(this.container);

    this.anchor = pickAnchor(this.host, preferredAnchor);
    this.applyHostStyle();
    this.render();

    this.resizeHandler = () => {
      this.anchor = pickAnchor(this.host, this.anchor);
      this.applyHostStyle();
    };
    window.addEventListener('resize', this.resizeHandler, { passive: true });
  }

  update(summary: LedgerSummary | null): void {
    this.summary = summary;
    if (!this.expanded) this.render();
  }

  destroy(): void {
    if (this.resizeHandler !== null) window.removeEventListener('resize', this.resizeHandler);
    this.host.remove();
  }

  /**
   * Every host-element property is forced, because host pages routinely set aggressive
   * global rules (`* { position: static !important }` and similar).
   */
  private applyHostStyle(): void {
    const declarations: Record<string, string> = {
      position: 'fixed',
      'z-index': '2147483647',
      margin: '0',
      padding: '0',
      border: '0',
      width: 'auto',
      height: 'auto',
      display: 'block',
      'pointer-events': 'auto',
      visibility: 'visible',
      opacity: '1',
      transform: 'none',
      ...anchorStyle(this.anchor),
    };

    this.host.style.cssText = Object.entries(declarations)
      .map(([key, value]) => `${key}:${value} !important`)
      .join(';');
  }

  private render(): void {
    this.container.replaceChildren(this.expanded ? this.buildPanel() : this.buildPill());
  }

  private buildPill(): HTMLElement {
    const total = this.summary?.total ?? 0;

    const pill = el('button', 'pill');
    pill.setAttribute('type', 'button');
    pill.setAttribute(
      'aria-label',
      `GhostPrint: ${total} third-party ${total === 1 ? 'tracker' : 'trackers'} on this page. Activate for details.`,
    );
    pill.appendChild(ghostIcon());

    const count = el('span', 'count');
    count.textContent = String(total);
    pill.appendChild(count);
    pill.appendChild(this.buildBar());

    pill.addEventListener('click', () => void this.expand());
    return pill;
  }

  private buildBar(): HTMLElement {
    const bar = el('span', 'bar');
    const totals = this.summary?.byCategory;
    const total = this.summary?.total ?? 0;
    if (totals === undefined || total === 0) return bar;

    for (const [category, value] of categoryEntries(totals)) {
      if (value === 0) continue;
      const segment = el('span', `seg-${category}`);
      segment.style.width = `${Math.round((value / total) * 100)}%`;
      bar.appendChild(segment);
    }
    return bar;
  }

  private async expand(): Promise<void> {
    this.expanded = true;
    this.render();

    const trackers = await this.callbacks.onExpand();
    if (!this.expanded) return;
    this.container.replaceChildren(this.buildPanel(trackers));
  }

  private collapse(): void {
    this.expanded = false;
    this.render();
  }

  private buildPanel(trackers?: TrackerDetail[]): HTMLElement {
    const panel = el('div', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'GhostPrint tracker details');

    const head = el('div', 'head');
    head.appendChild(ghostIcon());
    const title = el('span', 'title');
    title.textContent = `${this.summary?.total ?? 0} trackers on ${this.summary?.pageDomain ?? 'this page'}`;
    head.appendChild(title);

    const close = el('button', 'icon-btn');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Collapse');
    close.textContent = '\u00d7';
    close.addEventListener('click', () => {
      this.collapse();
    });
    head.appendChild(close);
    panel.appendChild(head);

    panel.appendChild(this.buildLegend());

    const list = el('div', 'list');
    if (trackers === undefined) {
      const loading = el('div', 'empty');
      loading.textContent = 'Reading\u2026';
      list.appendChild(loading);
    } else if (trackers.length === 0) {
      const empty = el('div', 'empty');
      empty.textContent = 'No third-party trackers seen on this page yet.';
      list.appendChild(empty);
    } else {
      for (const group of groupByEntity(trackers)) list.appendChild(buildGroup(group));
    }
    panel.appendChild(list);

    panel.appendChild(this.buildFooter());
    queueMicrotask(() => close.focus());
    return panel;
  }

  private buildLegend(): HTMLElement {
    const legend = el('div', 'legend');
    const totals = this.summary?.byCategory;
    if (totals === undefined) return legend;

    for (const [category, value] of categoryEntries(totals)) {
      if (value === 0) continue;
      const item = document.createElement('span');
      item.appendChild(el('span', `dot seg-${category}`));
      const label = document.createElement('span');
      label.textContent = `${labelFor(category)} ${value}`;
      item.appendChild(label);
      legend.appendChild(item);
    }
    return legend;
  }

  private buildFooter(): HTMLElement {
    const foot = el('div', 'foot');

    const mute = el('button', 'text-btn');
    mute.setAttribute('type', 'button');
    mute.textContent = 'Hide on this site';
    mute.addEventListener('click', () => {
      this.callbacks.onMuteOrigin();
    });
    foot.appendChild(mute);

    const disable = el('button', 'text-btn');
    disable.setAttribute('type', 'button');
    disable.textContent = 'Hide everywhere';
    disable.addEventListener('click', () => {
      this.callbacks.onDisable();
    });
    foot.appendChild(disable);

    if (this.summary?.capped === true) {
      const note = el('span', 'note');
      note.textContent = 'counts capped';
      foot.appendChild(note);
    }
    return foot;
  }
}

interface EntityGroup {
  name: string;
  trackers: TrackerDetail[];
}

export function groupByEntity(trackers: TrackerDetail[]): EntityGroup[] {
  const groups = new Map<string, EntityGroup>();

  for (const tracker of trackers) {
    const key = tracker.entityId ?? '\u0000unidentified';
    const name = tracker.entityName ?? 'Unidentified';
    const group = groups.get(key) ?? { name, trackers: [] };
    group.trackers.push(tracker);
    groups.set(key, group);
  }

  // Unidentified sorts last; it is the least interesting group to a reader.
  return [...groups.entries()]
    .sort(([keyA, a], [keyB, b]) => {
      const unknownA = keyA.startsWith('\u0000') ? 1 : 0;
      const unknownB = keyB.startsWith('\u0000') ? 1 : 0;
      return unknownA - unknownB || b.trackers.length - a.trackers.length || a.name.localeCompare(b.name);
    })
    .map(([, group]) => group);
}

function buildGroup(group: EntityGroup): HTMLElement {
  const wrapper = el('div', 'group');

  const head = el('div', 'group-head');
  const name = el('span', 'entity');
  name.textContent = group.name;
  head.appendChild(name);

  const count = el('span', 'entity-count');
  count.textContent = `${group.trackers.length}`;
  head.appendChild(count);
  wrapper.appendChild(head);

  for (const tracker of group.trackers) {
    const row = el('div', 'domain');
    const dot = el('span', `dot seg-${tracker.category}`);
    row.appendChild(dot);

    const domain = el('span', 'domain-name');
    domain.textContent = tracker.domain;
    domain.title = `${tracker.domain} \u2014 ${labelFor(tracker.category)}`;
    row.appendChild(domain);

    const hits = el('span', 'hits');
    hits.textContent = String(tracker.hits);
    row.appendChild(hits);
    wrapper.appendChild(row);
  }
  return wrapper;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function ghostIcon(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'ghost');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute(
    'd',
    'M8 1a5 5 0 0 0-5 5v7.6c0 .5.6.8 1 .4l1-1 1.2 1a.7.7 0 0 0 .9 0l1-.9 1 .9a.7.7 0 0 0 .9 0l1.1-1 1 1c.4.4 1 .1 1-.4V6a5 5 0 0 0-5-5Z',
  );
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);

  for (const cx of [6.2, 9.8]) {
    const eye = document.createElementNS(NS, 'circle');
    eye.setAttribute('cx', String(cx));
    eye.setAttribute('cy', '6.2');
    eye.setAttribute('r', '1');
    eye.setAttribute('fill', 'var(--bg)');
    svg.appendChild(eye);
  }
  return svg;
}
