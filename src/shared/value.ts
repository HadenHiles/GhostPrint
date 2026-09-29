import modelData from '@/data/value-model.json';
import { TrackerCategory } from './types';
import type { TrackerDetail } from './types';

interface SourcedNumber {
  value: number;
  source: string;
  retrievedAt: string;
  scope: string;
}

type CategoryKey = 'advertising' | 'analytics' | 'behavioral' | 'unknown';

interface ValueModel {
  currency: string;
  baseCpmUsd: SourcedNumber;
  categoryWeights: Record<CategoryKey, SourcedNumber>;
  verticalMultipliers: Record<PageVertical, SourcedNumber>;
}

export type PageVertical = 'general' | 'finance' | 'health' | 'ecommerce' | 'news';

const model = modelData as unknown as ValueModel;

const VERTICAL_DOMAINS: Record<Exclude<PageVertical, 'general'>, Set<string>> = {
  finance: new Set(['bankrate.com', 'chase.com', 'investopedia.com', 'nerdwallet.com', 'wellsfargo.com']),
  health: new Set(['cdc.gov', 'healthline.com', 'mayoclinic.org', 'nih.gov', 'webmd.com']),
  ecommerce: new Set(['amazon.com', 'bestbuy.com', 'ebay.com', 'target.com', 'walmart.com']),
  news: new Set(['bbc.com', 'cnn.com', 'reuters.com', 'theguardian.com', 'nytimes.com']),
};

export interface ValueEstimate {
  amount: number;
  currency: string;
  vertical: PageVertical;
}

/** Returns a conservative fee-equivalent proxy, not actual earnings or data-sale value. */
export function estimateValue(details: TrackerDetail[], pageDomain: string | null): ValueEstimate {
  const vertical = classifyPageVertical(pageDomain);
  const verticalMultiplier = verticalMultiplierFor(vertical);

  const weightedEvents = details.reduce((sum, detail) => {
    if (!Number.isFinite(detail.hits) || detail.hits <= 0) return sum;
    const weight = categoryWeightFor(detail.category);
    return sum + detail.hits * weight;
  }, 0);

  return {
    amount: (weightedEvents * model.baseCpmUsd.value * verticalMultiplier) / 1_000,
    currency: model.currency,
    vertical,
  };
}

/** A small hostname-only map; unknown sites use the neutral general multiplier. */
export function classifyPageVertical(pageDomain: string | null): PageVertical {
  const domain = pageDomain?.toLowerCase();
  if (domain === undefined) return 'general';

  for (const [vertical, domains] of Object.entries(VERTICAL_DOMAINS) as [
    Exclude<PageVertical, 'general'>,
    Set<string>,
  ][]) {
    if (domains.has(domain)) return vertical;
  }
  return 'general';
}

function categoryWeightFor(category: TrackerCategory): number {
  switch (category) {
    case TrackerCategory.Advertising:
      return model.categoryWeights.advertising.value;
    case TrackerCategory.Analytics:
      return model.categoryWeights.analytics.value;
    case TrackerCategory.Behavioral:
      return model.categoryWeights.behavioral.value;
    case TrackerCategory.Unknown:
      return model.categoryWeights.unknown.value;
  }
}

function verticalMultiplierFor(vertical: PageVertical): number {
  switch (vertical) {
    case 'finance':
      return model.verticalMultipliers.finance.value;
    case 'health':
      return model.verticalMultipliers.health.value;
    case 'ecommerce':
      return model.verticalMultipliers.ecommerce.value;
    case 'news':
      return model.verticalMultipliers.news.value;
    case 'general':
      return model.verticalMultipliers.general.value;
  }
}