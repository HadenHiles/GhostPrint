import { TrackerCategory } from '@/shared/types';
import type { ProbeObservation } from '../probes';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_OBSERVATIONS = 64;
const MAX_VISIBLE_DOMAINS = 12;

const CATEGORY_COLORS = new Map<TrackerCategory, string>([
  [TrackerCategory.Advertising, '#f0643c'],
  [TrackerCategory.Analytics, '#3ca0f0'],
  [TrackerCategory.Behavioral, '#b45cf0'],
  [TrackerCategory.Unknown, '#a3adbd'],
]);

export class XRayOverlay {
  private readonly layer: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly status: HTMLDivElement;
  private readonly cue: HTMLDivElement;
  private readonly cueLabel: HTMLSpanElement;
  private readonly cueButton: HTMLButtonElement;
  private readonly onEscape: () => void;
  private readonly onExplore: () => void;
  private observations: ProbeObservation[] = [];
  private enabled = false;
  private autoCueEnabled = true;
  private frame = 0;
  private cueTimer: number | null = null;
  private lastCueAt = Number.NEGATIVE_INFINITY;

  constructor(root: ShadowRoot, onEscape: () => void, onExplore: () => void) {
    this.onEscape = onEscape;
    this.onExplore = onExplore;
    this.layer = document.createElement('div');
    this.layer.className = 'xray-layer';
    this.layer.hidden = true;

    const dimmer = document.createElement('div');
    dimmer.className = 'xray-dimmer';
    dimmer.setAttribute('aria-hidden', 'true');
    this.layer.appendChild(dimmer);

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('xray-map');
    this.svg.setAttribute('aria-hidden', 'true');
    this.layer.appendChild(this.svg);

    this.status = document.createElement('div');
    this.status.className = 'xray-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.layer.appendChild(this.status);
    root.appendChild(this.layer);

    this.cue = document.createElement('div');
    this.cue.className = 'xray-cue';
    this.cue.hidden = true;
    this.cue.setAttribute('role', 'status');
    this.cue.setAttribute('aria-live', 'polite');
    this.cueLabel = document.createElement('span');
    this.cue.appendChild(this.cueLabel);
    this.cueButton = document.createElement('button');
    this.cueButton.className = 'xray-cue-action';
    this.cueButton.type = 'button';
    this.cueButton.textContent = 'Explore';
    this.cueButton.setAttribute('aria-label', 'Explore this tracker signal with X-Ray');
    this.cueButton.addEventListener('click', this.onExplore);
    this.cue.appendChild(this.cueButton);
    root.appendChild(this.cue);

    window.addEventListener('resize', this.scheduleDraw, { passive: true });
    window.addEventListener('scroll', this.scheduleDraw, { passive: true, capture: true });
    document.addEventListener('keydown', this.handleKeydown);
  }

  setEnabled(enabled: boolean, observations: ProbeObservation[]): void {
    this.enabled = enabled;
    this.observations = observations.slice(-MAX_OBSERVATIONS);
    this.layer.hidden = !enabled;

    if (!enabled) {
      if (this.frame !== 0) cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.svg.replaceChildren();
      this.status.textContent = '';
      this.hideCue();
      return;
    }

    this.hideCue();
    const domainCount = new Set(this.observations.map((item) => item.domain)).size;
    this.status.textContent = `X-Ray on. ${this.observations.length} instrumented signal${this.observations.length === 1 ? '' : 's'} from ${domainCount} third-party domain${domainCount === 1 ? '' : 's'}${domainCount > MAX_VISIBLE_DOMAINS ? `; showing ${MAX_VISIBLE_DOMAINS}` : ''}. Press Escape to exit.`;
    this.scheduleDraw();
  }

  update(observations: ProbeObservation[]): void {
    if (!this.enabled) return;
    this.setEnabled(true, observations);
  }

  setAutoCueEnabled(enabled: boolean): void {
    this.autoCueEnabled = enabled;
    if (!enabled) this.hideCue();
  }

  showAutomaticCue(observation: ProbeObservation): void {
    if (!this.autoCueEnabled || this.enabled || document.hidden) return;
    const now = performance.now();
    if (now - this.lastCueAt < 2_500) return;

    let target: Element | null;
    try {
      target = observation.selector === null ? null : document.querySelector(observation.selector);
    } catch {
      return;
    }
    if (target === null || !target.isConnected) return;
    const bounds = target.getBoundingClientRect();
    if (bounds.width === 0 && bounds.height === 0) return;

    this.lastCueAt = now;
    this.cueLabel.textContent = `${observation.entityName ?? 'Unidentified'} signal · ${observation.domain}`;
    const cueWidth = Math.min(310, Math.max(180, window.innerWidth - 24));
    const left = Math.min(Math.max(12, bounds.left), Math.max(12, window.innerWidth - cueWidth - 12));
    const top = Math.min(Math.max(12, bounds.bottom + 8), Math.max(12, window.innerHeight - 58));
    this.cue.style.left = `${left}px`;
    this.cue.style.top = `${top}px`;
    this.cue.hidden = false;
    if (this.cueTimer !== null) window.clearTimeout(this.cueTimer);
    this.cueTimer = window.setTimeout(() => this.hideCue(), 3_500);
  }

  destroy(): void {
    this.setEnabled(false, []);
    window.removeEventListener('resize', this.scheduleDraw);
    window.removeEventListener('scroll', this.scheduleDraw, true);
    document.removeEventListener('keydown', this.handleKeydown);
    this.layer.remove();
    this.cueButton.removeEventListener('click', this.onExplore);
    this.cue.remove();
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.enabled || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.onEscape();
  };

  private readonly scheduleDraw = (): void => {
    if (!this.enabled || this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  };

  private hideCue(): void {
    if (this.cueTimer !== null) window.clearTimeout(this.cueTimer);
    this.cueTimer = null;
    this.cue.hidden = true;
  }

  private draw(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.replaceChildren();

    const targets: { observation: ProbeObservation; bounds: DOMRect }[] = [];
    const domains = new Map<string, ProbeObservation>();
    for (const observation of this.observations) {
      if (observation.selector === null) continue;
      let target: Element | null;
      try {
        target = document.querySelector(observation.selector);
      } catch {
        continue;
      }
      if (target === null || !target.isConnected) continue;
      const bounds = target.getBoundingClientRect();
      if (bounds.width === 0 && bounds.height === 0) continue;
      targets.push({ observation, bounds });
      if (!domains.has(observation.domain)) domains.set(observation.domain, observation);
    }

    const sortedDomains = [...domains.entries()]
      .sort(([domainA, observationA], [domainB, observationB]) => {
        const parentA = observationA.entityId ?? observationA.entityName ?? domainA;
        const parentB = observationB.entityId ?? observationB.entityName ?? domainB;
        return parentA.localeCompare(parentB) || domainA.localeCompare(domainB);
      })
      .slice(0, MAX_VISIBLE_DOMAINS);
    const visibleDomains = new Set(sortedDomains.map(([domain]) => domain));
    const nodeX = width >= 440 ? width - 192 : 196;
    const labelX = width >= 440 ? nodeX + 15 : nodeX - 15;
    const labelAnchor = width >= 440 ? 'start' : 'end';
    const nodePositions = new Map<string, number>();
    const rowGap = Math.min(34, Math.max(18, (height - 72) / Math.max(sortedDomains.length, 1)));
    sortedDomains.forEach(([domain], index) => {
      nodePositions.set(domain, 36 + index * rowGap);
    });

    for (const { observation, bounds } of targets) {
      if (!visibleDomains.has(observation.domain)) continue;
      const nodeY = nodePositions.get(observation.domain);
      if (nodeY === undefined) continue;
      const color = colorFor(observation.category);
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const controlX = (centerX + nodeX) / 2;

      const outline = document.createElementNS(SVG_NS, 'rect');
      outline.setAttribute('x', String(bounds.left));
      outline.setAttribute('y', String(bounds.top));
      outline.setAttribute('width', String(bounds.width));
      outline.setAttribute('height', String(bounds.height));
      outline.setAttribute('rx', '3');
      outline.setAttribute('class', 'xray-outline');
      outline.setAttribute('stroke', color);
      this.svg.appendChild(outline);

      const line = document.createElementNS(SVG_NS, 'path');
      line.setAttribute('d', `M ${centerX} ${centerY} C ${controlX} ${centerY}, ${controlX} ${nodeY}, ${nodeX} ${nodeY}`);
      line.setAttribute('class', 'xray-line');
      line.setAttribute('stroke', color);
      this.svg.appendChild(line);
    }

    sortedDomains.forEach(([domain, observation]) => {
      const y = nodePositions.get(domain);
      if (y === undefined) return;
      const color = colorFor(observation.category);

      const node = document.createElementNS(SVG_NS, 'circle');
      node.setAttribute('cx', String(nodeX));
      node.setAttribute('cy', String(y));
      node.setAttribute('r', '5');
      node.setAttribute('fill', color);
      this.svg.appendChild(node);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(labelX));
      label.setAttribute('y', String(y + 4));
      label.setAttribute('text-anchor', labelAnchor);
      label.setAttribute('class', 'xray-label');
      label.setAttribute('textLength', String(Math.min(170, Math.max(48, width - 200))));
      label.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      label.textContent = `${observation.entityName ?? 'Unidentified'} · ${domain}`;
      this.svg.appendChild(label);
    });
  }
}

function colorFor(category: TrackerCategory): string {
  return CATEGORY_COLORS.get(category) ?? '#a3adbd';
}