import { send } from '@/background/messaging';
import { readLocal, writeLocal } from '@/shared/storage';
import { estimateValue } from '@/shared/value';
import { TrackerCategory } from '@/shared/types';
import type { CategoryTotals, HistorySummary, LedgerSummary } from '@/shared/types';

const CATEGORY_ROWS: [TrackerCategory, string][] = [
  [TrackerCategory.Advertising, 'Advertising'],
  [TrackerCategory.Analytics, 'Analytics'],
  [TrackerCategory.Behavioral, 'Behavioral'],
  [TrackerCategory.Unknown, 'Unidentified'],
];

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing #${id}`);
  return node as T;
};

const pageTotal = el('page-total');
const pageLabel = el('page-label');
const pageRows = el('page-rows');
const pageNote = el('page-note');
const siteName = el('site');
const weekTotal = el('week-total');
const weekLabel = el('week-label');
const weekEntities = el('week-entities');
const status = el('status');
const clearButton = el<HTMLButtonElement>('clear');
const particleOverlay = el<HTMLInputElement>('particle-overlay');
const valueAmount = el('value-amount');

function categoryEntries(totals: CategoryTotals): [TrackerCategory, string, number][] {
  const values = new Map<TrackerCategory, number>([
    [TrackerCategory.Advertising, totals[TrackerCategory.Advertising]],
    [TrackerCategory.Analytics, totals[TrackerCategory.Analytics]],
    [TrackerCategory.Behavioral, totals[TrackerCategory.Behavioral]],
    [TrackerCategory.Unknown, totals[TrackerCategory.Unknown]],
  ]);
  return CATEGORY_ROWS.map(([category, label]) => [category, label, values.get(category) ?? 0]);
}

function renderPage(summary: LedgerSummary | null): void {
  const total = summary?.total ?? 0;
  pageTotal.textContent = String(total);
  pageLabel.textContent = total === 1 ? 'tracker' : 'trackers';
  siteName.textContent = summary?.pageDomain ?? '';

  pageRows.replaceChildren();
  if (summary === null || total === 0) {
    pageNote.hidden = false;
    pageNote.textContent =
      summary === null
        ? 'No data for this tab yet. Reload the page to start counting.'
        : 'No third-party trackers seen here.';
    return;
  }

  pageNote.hidden = summary.capped !== true;
  if (summary.capped) pageNote.textContent = 'Counts capped on this very busy page.';

  const max = Math.max(...categoryEntries(summary.byCategory).map(([, , value]) => value), 1);

  for (const [category, label, value] of categoryEntries(summary.byCategory)) {
    if (value === 0) continue;
    pageRows.appendChild(buildRow(category, label, value, max));
  }
}

function buildRow(
  category: TrackerCategory,
  label: string,
  value: number,
  max: number,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  row.title = `${label}: ${value}`;

  const dot = document.createElement('span');
  dot.className = `dot c${category}`;
  row.appendChild(dot);

  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('div');
  fill.className = `fill c${category}`;
  fill.style.width = `${Math.round((value / max) * 100)}%`;
  track.appendChild(fill);
  row.appendChild(track);

  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = String(value);
  row.appendChild(num);

  return row;
}

function renderHistory(summary: HistorySummary): void {
  weekTotal.textContent = String(summary.total);
  weekLabel.textContent = `${summary.total === 1 ? 'encounter' : 'encounters'} across ${summary.distinctDomains} ${summary.distinctDomains === 1 ? 'domain' : 'domains'}`;

  weekEntities.replaceChildren();
  if (summary.topEntities.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Nothing recorded yet this week.';
    weekEntities.appendChild(empty);
    return;
  }

  for (const entity of summary.topEntities) {
    const row = document.createElement('div');
    row.className = 'entity';

    const name = document.createElement('span');
    name.className = 'entity-name';
    name.textContent = entity.name;
    row.appendChild(name);

    const count = document.createElement('span');
    count.className = 'entity-count';
    count.textContent = String(entity.count);
    row.appendChild(count);

    weekEntities.appendChild(row);
  }
}

async function load(): Promise<void> {
  try {
    const [ledger, history, details, local] = await Promise.all([
      send({ type: 'GET_LEDGER' }),
      send({ type: 'GET_HISTORY' }),
      send({ type: 'GET_DETAILS' }),
      readLocal(),
    ]);
    renderPage(ledger.summary);
    renderHistory(history.summary);
    const value = estimateValue(details.trackers, ledger.summary?.pageDomain ?? null);
    valueAmount.textContent = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: value.currency,
      minimumFractionDigits: 3,
      maximumFractionDigits: 4,
    }).format(value.amount);
    particleOverlay.checked = local.settings.particleOverlayEnabled;
    document.body.dataset.ghostprintLoaded = 'true';
  } catch {
    status.textContent = 'Unavailable';
  }
}

particleOverlay.addEventListener('change', () => {
  void (async () => {
    const current = await readLocal();
    await writeLocal({
      settings: { ...current.settings, particleOverlayEnabled: particleOverlay.checked },
    });
  })();
});

el('options').addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

// Two-step so an accidental click cannot wipe 90 days of local history.
clearButton.addEventListener('click', () => {
  if (clearButton.dataset.confirming !== 'true') {
    clearButton.dataset.confirming = 'true';
    clearButton.textContent = 'Confirm?';
    setTimeout(() => {
      clearButton.dataset.confirming = 'false';
      clearButton.textContent = 'Clear data';
    }, 4000);
    return;
  }

  void (async () => {
    await send({ type: 'CLEAR_ALL_DATA' });
    clearButton.dataset.confirming = 'false';
    clearButton.textContent = 'Clear data';
    status.textContent = 'Cleared';
    document.body.dataset.ghostprintCleared = 'true';
    await load();
  })();
});

void load();
