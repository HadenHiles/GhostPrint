import { TrackerCategory } from '@/shared/types';
import type { ProbeObservation } from '../probes';

const EFFECT_LIFETIME_MS = 1_500;
const MAX_EFFECTS = 4;
const PARTICLES_PER_EFFECT = 12;
const MAX_PARTICLES = 60;

const COLORS = new Map<TrackerCategory, string>([
  [TrackerCategory.Advertising, '#f0643c'],
  [TrackerCategory.Analytics, '#3ca0f0'],
  [TrackerCategory.Behavioral, '#b45cf0'],
  [TrackerCategory.Unknown, '#8993a6'],
]);

interface Particle {
  x: number;
  y: number;
  angle: number;
  distance: number;
  startAt: number;
  color: string;
}

export class ParticleOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly reducedMotion: MediaQueryList;
  private readonly particles: Particle[] = [];
  private frame = 0;
  private hiddenAt: number | null = null;
  private enabled = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.resize();
    window.addEventListener('resize', this.resize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.reducedMotion.addEventListener('change', this.onMotionChange);
  }

  show(observation: ProbeObservation): void {
    if (!this.enabled || this.reducedMotion.matches || document.hidden || this.context === null) return;

    let target: Element | null;
    try {
      target = observation.selector === null ? null : document.querySelector(observation.selector);
    } catch {
      return;
    }
    if (target === null || !target.isConnected) return;

    const bounds = target.getBoundingClientRect();
    if (bounds.width === 0 && bounds.height === 0) return;

    while (this.particles.length + PARTICLES_PER_EFFECT > MAX_PARTICLES || this.activeEffects() >= MAX_EFFECTS) {
      const oldestStart = Math.min(...this.particles.map((particle) => particle.startAt));
      const oldestEffect = this.particles.filter((particle) => particle.startAt === oldestStart);
      this.particles.splice(0, oldestEffect.length);
    }

    const now = performance.now();
    const color = COLORS.get(observation.category) ?? COLORS.get(TrackerCategory.Unknown)!;
    const originX = bounds.left + bounds.width / 2;
    const originY = bounds.top + bounds.height / 2;
    for (let index = 0; index < PARTICLES_PER_EFFECT; index += 1) {
      this.particles.push({
        x: originX,
        y: originY,
        angle: (Math.PI * 2 * index) / PARTICLES_PER_EFFECT + Math.random() * 0.25,
        distance: 12 + Math.random() * 24,
        startAt: now,
        color,
      });
    }
    this.scheduleFrame();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) return;

    this.particles.length = 0;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  destroy(): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.reducedMotion.removeEventListener('change', this.onMotionChange);
    this.particles.length = 0;
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private readonly resize = (): void => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * pixelRatio);
    this.canvas.height = Math.round(window.innerHeight * pixelRatio);
    this.context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.hiddenAt = performance.now();
      if (this.frame !== 0) cancelAnimationFrame(this.frame);
      this.frame = 0;
      return;
    }

    if (this.hiddenAt !== null) {
      const pausedFor = performance.now() - this.hiddenAt;
      for (const particle of this.particles) particle.startAt += pausedFor;
      this.hiddenAt = null;
    }
    this.scheduleFrame();
  };

  private readonly onMotionChange = (): void => {
    if (!this.reducedMotion.matches) return;
    this.particles.length = 0;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  private activeEffects(): number {
    return new Set(this.particles.map((particle) => particle.startAt)).size;
  }

  private scheduleFrame(): void {
    if (
      this.frame === 0 &&
      this.particles.length > 0 &&
      this.enabled &&
      !document.hidden &&
      !this.reducedMotion.matches
    ) {
      this.frame = requestAnimationFrame(this.draw);
    }
  }

  private readonly draw = (now: number): void => {
    this.frame = 0;
    const context = this.context;
    if (context === null) return;

    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const active: Particle[] = [];
    for (const particle of this.particles) {
      const progress = (now - particle.startAt) / EFFECT_LIFETIME_MS;
      if (progress >= 1) continue;
      active.push(particle);

      const distance = particle.distance * progress;
      const radius = 2.5 * (1 - progress);
      context.globalAlpha = 1 - progress;
      context.fillStyle = particle.color;
      context.shadowColor = particle.color;
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(
        particle.x + Math.cos(particle.angle) * distance,
        particle.y + Math.sin(particle.angle) * distance,
        radius,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    this.particles.splice(0, this.particles.length, ...active);
    context.globalAlpha = 1;
    context.shadowBlur = 0;

    if (this.particles.length > 0) this.scheduleFrame();
  };
}