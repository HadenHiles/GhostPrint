import { send } from '@/background/messaging';
import { readLocal, writeLocal } from '@/shared/storage';
import { estimateValue } from '@/shared/value';
import { TrackerCategory } from '@/shared/types';
import type { CategoryTotals, HistorySummary, LedgerSummary } from '@/shared/types';
import { buildShareText, renderWeeklyCard } from './weekly-card';

import type { WeeklyReport } from '@/shared/types';
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

const reportSummary = el('report-summary');
const reportRedact = el<HTMLInputElement>('report-redact');
const reportPreview = el<HTMLImageElement>('report-preview');
const reportStatus = el('report-status');
const reportDownload = el<HTMLButtonElement>('report-download');
const reportCopy = el<HTMLButtonElement>('report-copy');
const reportShare = el<HTMLButtonElement>('report-share');
const telemetryConsentStatus = el('telemetry-consent-status');
const telemetryDestination = el('telemetry-destination');
const telemetryAllow = el<HTMLButtonElement>('telemetry-allow');
const telemetryDecline = el<HTMLButtonElement>('telemetry-decline');
const telemetryRevoke = el<HTMLButtonElement>('telemetry-revoke');
const weeklyReportSection = el('weekly-report-section');
let weeklyReport: WeeklyReport | null = null;
let reportBlob: Blob | null = null;
let previewUrl: string | null = null;
let telemetryConsent: 'undecided' | 'declined' | 'granted' = 'undecided';
let telemetryEndpointConfigured = false;
let weeklyReportViewed = false;

const reportObserver = new IntersectionObserver((entries) => {
  if (weeklyReportViewed || !entries.some((entry) => entry.isIntersecting)) return;
  weeklyReportViewed = true;
  reportObserver.disconnect();
  recordMetric('weekly_report_viewed');
});
reportObserver.observe(weeklyReportSection);

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
    const [ledger, history, details, report, telemetry, local] = await Promise.all([
      send({ type: 'GET_LEDGER' }),
      send({ type: 'GET_HISTORY' }),
      send({ type: 'GET_DETAILS' }),
      send({ type: 'GET_WEEKLY_REPORT' }),
      send({ type: 'GET_TELEMETRY_STATUS' }),
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
    weeklyReport = report.report;
    renderWeeklySummary(weeklyReport);
    telemetryConsent = local.telemetryConsent;
    telemetryEndpointConfigured = telemetry.endpointConfigured;
    telemetryDestination.textContent = telemetry.endpointConfigured
      ? `Telemetry destination: ${telemetry.destination}`
      : 'Telemetry is not configured in this build; no usage data will be sent.';
    renderTelemetryConsent();
    particleOverlay.checked = local.settings.particleOverlayEnabled;
    document.body.dataset.ghostprintLoaded = 'true';
    void updateReportCard();
    recordMetric('popup_opened');
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

reportRedact.addEventListener('change', () => void updateReportCard());

telemetryAllow.addEventListener('click', () => void setTelemetryConsent('granted'));
telemetryDecline.addEventListener('click', () => void setTelemetryConsent('declined'));
telemetryRevoke.addEventListener('click', () => void setTelemetryConsent('declined'));

reportDownload.addEventListener('click', () => {
  if (reportBlob === null) return;
  recordMetric('share_clicked');
  const url = URL.createObjectURL(reportBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ghostprint-weekly-report.png';
  link.click();
  URL.revokeObjectURL(url);
  reportStatus.textContent = 'Report downloaded.';
  recordMetric('share_completed');
});

reportCopy.addEventListener('click', () => {
  void (async () => {
    if (reportBlob === null) return;
    recordMetric('share_clicked');
    if (!('ClipboardItem' in window) || !navigator.clipboard?.write) {
      reportStatus.textContent = 'Image copy is not available in this browser.';
      return;
    }
    const writeItems = navigator.clipboard.write.bind(navigator.clipboard);
    await writeItems([new ClipboardItem({ 'image/png': reportBlob })]);
    reportStatus.textContent = 'Report image copied.';
    recordMetric('share_completed');
  })().catch(() => {
    reportStatus.textContent = 'Could not copy the report image.';
  });
});

reportShare.addEventListener('click', () => {
  void (async () => {
    if (reportBlob === null || weeklyReport === null) return;
    recordMetric('share_clicked');
    const file = new File([reportBlob], 'ghostprint-weekly-report.png', { type: 'image/png' });
    const text = buildShareText(weeklyReport, reportRedact.checked);
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ title: 'GhostPrint weekly privacy report', text, files: [file] });
      reportStatus.textContent = 'Share sheet opened.';
      recordMetric('share_completed');
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      reportStatus.textContent = 'Share text copied; image sharing is unavailable here.';
      recordMetric('share_completed');
    } else {
      reportStatus.textContent = 'Sharing is unavailable in this browser.';
    }
  })().catch(() => {
    reportStatus.textContent = 'Sharing was cancelled or unavailable.';
  });
});

function renderWeeklySummary(report: WeeklyReport): void {
  const delta = report.deltaPercent === null
    ? `${report.deltaCount >= 0 ? '+' : ''}${report.deltaCount} encounters`
    : `${report.deltaPercent >= 0 ? '+' : ''}${Math.round(report.deltaPercent)}%`;
  reportSummary.textContent = `${report.totalTrackers} tracker encounters · ${delta} vs. previous week`;
}

function renderTelemetryConsent(): void {
  telemetryAllow.hidden = telemetryConsent === 'granted';
  telemetryAllow.disabled = !telemetryEndpointConfigured;
  telemetryDecline.hidden = telemetryConsent !== 'undecided';
  telemetryRevoke.hidden = telemetryConsent !== 'granted';
  telemetryConsentStatus.textContent =
    telemetryConsent === 'granted'
      ? 'Anonymous count measurement is on.'
      : telemetryConsent === 'declined'
        ? 'Measurement is off. You can opt in later.'
        : 'Measurement is off until you choose.';
}

async function setTelemetryConsent(consent: 'granted' | 'declined'): Promise<void> {
  const current = await readLocal();
  if (consent === 'granted') {
    const status = await send({ type: 'GET_TELEMETRY_STATUS' });
    if (!status.endpointConfigured) {
      telemetryConsentStatus.textContent = 'Telemetry cannot be enabled because this build has no configured HTTPS sink.';
      return;
    }
  }

  telemetryConsent = consent;
  await writeLocal({
    telemetryConsent: consent,
    telemetryPending: [],
    telemetryCohort: consent === 'granted' ? current.telemetryCohort : null,
    w4TelemetryRecorded: consent === 'granted' ? current.w4TelemetryRecorded : false,
  });
  renderTelemetryConsent();
}

function recordMetric(metric: 'weekly_report_viewed' | 'share_clicked' | 'share_completed' | 'popup_opened'): void {
  void send({ type: 'TRACK_TELEMETRY', metric }).catch(() => {});
}

async function updateReportCard(): Promise<void> {
  if (weeklyReport === null) return;
  reportDownload.disabled = true;
  reportCopy.disabled = true;
  reportShare.disabled = true;
  reportStatus.textContent = 'Preparing report…';
  try {
    reportBlob = await renderWeeklyCard(weeklyReport, reportRedact.checked);
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(reportBlob);
    reportPreview.src = previewUrl;
    reportPreview.hidden = false;
    reportDownload.disabled = false;
    reportCopy.disabled = false;
    reportShare.disabled = false;
    reportStatus.textContent = '';
  } catch {
    reportStatus.textContent = 'Could not render the weekly report on this browser.';
  }
}

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
