import type { WeeklyReport } from '@/shared/types';

export const WEEKLY_CARD_WIDTH = 1_200;
export const WEEKLY_CARD_HEIGHT = 630;

export async function renderWeeklyCard(report: WeeklyReport, redactDomain: boolean): Promise<Blob> {
  const canvas = new OffscreenCanvas(WEEKLY_CARD_WIDTH, WEEKLY_CARD_HEIGHT);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('OffscreenCanvas 2D context is unavailable.');

  context.fillStyle = '#101820';
  context.fillRect(0, 0, WEEKLY_CARD_WIDTH, WEEKLY_CARD_HEIGHT);
  context.fillStyle = '#ffce47';
  context.fillRect(0, 0, 18, WEEKLY_CARD_HEIGHT);
  context.fillStyle = '#1a2b36';
  context.fillRect(712, 0, 488, WEEKLY_CARD_HEIGHT);
  context.fillStyle = '#34d1bf';
  context.beginPath();
  context.arc(1_020, 150, 106, 0, Math.PI * 2);
  context.fill();

  context.textBaseline = 'top';
  context.fillStyle = '#ffce47';
  context.font = '700 22px system-ui, sans-serif';
  context.fillText('GHOSTPRINT  /  WEEKLY PRIVACY REPORT', 64, 54);

  context.fillStyle = '#f7f4eb';
  context.font = '700 52px Georgia, serif';
  context.fillText('A week under', 64, 112);
  context.fillText('observation.', 64, 172);

  context.fillStyle = '#34d1bf';
  context.font = '700 112px system-ui, sans-serif';
  context.fillText(String(report.totalTrackers), 64, 278);
  context.fillStyle = '#f7f4eb';
  context.font = '500 27px system-ui, sans-serif';
  context.fillText(report.totalTrackers === 1 ? 'tracker encounter' : 'tracker encounters', 70, 400);

  const delta = deltaLabel(report.deltaCount, report.deltaPercent);
  context.fillStyle = '#b9c9cf';
  context.font = '500 20px system-ui, sans-serif';
  context.fillText(`${delta} vs. previous week`, 70, 445);

  context.fillStyle = '#10242b';
  context.font = '800 20px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText('TOP SIGNAL', 1_020, 122);
  context.fillStyle = '#f7f4eb';
  context.font = '700 23px system-ui, sans-serif';
  const domainLabel = redactDomain ? 'Redacted' : report.topTrackerDomain ?? 'No tracker activity';
  context.fillText(trimText(context, domainLabel, 370), 956, 320, 370);
  context.fillStyle = '#b9c9cf';
  context.font = '500 19px system-ui, sans-serif';
  const entityLabel = report.topEntityName ?? 'Unidentified';
  context.fillText(`Corporate parent: ${trimText(context, entityLabel, 330)}`, 956, 358, 370);

  context.textAlign = 'left';
  context.fillStyle = '#ffce47';
  context.font = '700 18px system-ui, sans-serif';
  context.fillText('ESTIMATED DATA-USE FEE EQUIVALENT', 756, 440);
  context.fillStyle = '#f7f4eb';
  context.font = '700 38px system-ui, sans-serif';
  context.fillText(formatCurrency(report.estimatedValue), 756, 470);
  context.fillStyle = '#b9c9cf';
  context.font = '400 14px system-ui, sans-serif';
  context.fillText('Estimate only. Not earnings, compensation, or a data sale price.', 756, 526);

  context.fillStyle = '#8fa2aa';
  context.font = '500 14px system-ui, sans-serif';
  context.fillText(`${report.weekStarting} — ${report.weekEnding}  ·  Processed locally`, 64, 582);

  return canvas.convertToBlob({ type: 'image/png' });
}

export function buildShareText(report: WeeklyReport, redactDomain: boolean): string {
  const domain = redactDomain ? 'redacted' : report.topTrackerDomain ?? 'none recorded';
  return [
    `My GhostPrint weekly privacy report: ${report.totalTrackers} tracker encounters.`,
    `Top tracker domain: ${domain}.`,
    `Estimated data-use fee equivalent: ${formatCurrency(report.estimatedValue)}.`,
    'Estimate only; not earnings, compensation, or a data sale price.',
  ].join('\n');
}

function deltaLabel(count: number, percentage: number | null): string {
  if (percentage === null) return `${count >= 0 ? '+' : ''}${count} encounters`;
  return `${count >= 0 ? '+' : ''}${count} (${percentage >= 0 ? '+' : ''}${Math.round(percentage)}%)`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  }).format(amount);
}

function trimText(context: OffscreenCanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (context.measureText(value).width <= maxWidth) return value;
  let trimmed = value;
  while (trimmed.length > 1 && context.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}