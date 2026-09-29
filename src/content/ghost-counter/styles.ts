/**
 * All styling lives inside the closed shadow root. Nothing here can reach the host page,
 * and `:host { all: initial }` stops the host page's rules reaching us.
 */
export const WIDGET_CSS = `
:host {
  all: initial;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

.root {
  position: relative;
  z-index: 3;
  --bg: #12121a;
  --fg: #e9e9f2;
  --muted: #9292a8;
  --line: #2a2a38;
  --ad: #f0643c;
  --analytics: #3ca0f0;
  --behavioral: #b45cf0;
  --unknown: #5c5c70;

  color: var(--fg);
  font-size: 12px;
  line-height: 1.35;
}

.root[hidden] { display: none !important; }

.particle-overlay {
  position: fixed;
  z-index: 0;
  inset: 0;
  display: block;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}

.xray-layer {
  position: fixed;
  z-index: 2;
  inset: 0;
  display: block;
  pointer-events: none;
}

.xray-layer[hidden] { display: none !important; }
.xray-dimmer { position: absolute; inset: 0; background: rgb(6 10 18 / 62%); }
.xray-map { position: absolute; inset: 0; overflow: visible; }
.xray-outline { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
.xray-line { fill: none; stroke-width: 1.5; opacity: 0.88; vector-effect: non-scaling-stroke; }
.xray-label { fill: #fff; font: 11px/1.2 system-ui, sans-serif; paint-order: stroke; stroke: #10131a; stroke-width: 3px; stroke-linejoin: round; }
.xray-status { position: absolute; left: 16px; bottom: 16px; max-width: min(440px, calc(100vw - 32px)); padding: 8px 10px; border: 1px solid rgb(255 255 255 / 28%); border-radius: 6px; background: #10131a; color: #f4f7ff; font-size: 12px; line-height: 1.4; }

@media (prefers-color-scheme: light) {
  .root {
    --bg: #ffffff;
    --fg: #16161f;
    --muted: #61616f;
    --line: #e2e2ea;
  }
}

.pill {
  display: flex;
  align-items: center;
  gap: 7px;
  width: max-content;
  max-width: 120px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--bg);
  box-shadow: 0 2px 10px rgb(0 0 0 / 28%);
  cursor: pointer;
  user-select: none;
  transition: transform 120ms ease;
}

.pill:hover { transform: translateY(-1px); }
.pill:focus-visible { outline: 2px solid var(--analytics); outline-offset: 2px; }

.ghost { width: 13px; height: 13px; flex: 0 0 auto; }

.count {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  font-size: 13px;
}

.bar {
  display: flex;
  width: 30px;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--line);
}

.bar span { height: 100%; }
.seg-0 { background: var(--ad); }
.seg-1 { background: var(--analytics); }
.seg-2 { background: var(--behavioral); }
.seg-3 { background: var(--unknown); }

.panel {
  display: flex;
  flex-direction: column;
  width: 320px;
  max-width: calc(100vw - 32px);
  max-height: min(400px, calc(100vh - 32px));
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  box-shadow: 0 8px 30px rgb(0 0 0 / 38%);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}

.title { font-weight: 650; font-size: 13px; flex: 1; }

.icon-btn {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.icon-btn:hover { background: var(--line); color: var(--fg); }
.icon-btn:focus-visible { outline: 2px solid var(--analytics); outline-offset: 1px; }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
}

.legend > span { display: flex; align-items: center; gap: 5px; }
.dot { width: 7px; height: 7px; border-radius: 50%; }

.list { overflow-y: auto; padding: 4px 0; }

.group { padding: 6px 12px; }
.group + .group { border-top: 1px solid var(--line); }

.group-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
}

.entity { font-weight: 600; font-size: 12px; }
.entity-count { color: var(--muted); font-size: 11px; margin-left: auto; }

.domain {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 11px;
  padding: 1px 0;
}

.domain-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hits { margin-left: auto; font-variant-numeric: tabular-nums; }

.empty { padding: 20px 12px; color: var(--muted); text-align: center; }

.foot {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--line);
}

.text-btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.text-btn:hover { color: var(--fg); background: var(--line); }
.text-btn:focus-visible { outline: 2px solid var(--analytics); outline-offset: 1px; }

.note { color: var(--muted); font-size: 11px; margin-left: auto; }

@media (prefers-reduced-motion: reduce) {
  .pill { transition: none; }
  .pill:hover { transform: none; }
}
`;
