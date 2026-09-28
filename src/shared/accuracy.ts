import type { TrackerCategory } from './types';

export interface GroundTruthRequest {
  url: string;
  expectedTracker: boolean;
  expectedCategory?: TrackerCategory;
  expectedEntityId?: string;
}

export interface ClassifiedRequest {
  url: string;
  expectedTracker: boolean;
  predictedTracker: boolean;
  expectedCategory?: TrackerCategory;
  predictedCategory?: TrackerCategory;
  expectedEntityId?: string;
  predictedEntityId?: string;
}

export interface AccuracyMetrics {
  total: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  categoryConfusion: Record<string, number>;
  entityMatches: number;
  entityMismatches: number;
}

export function classifyGroundTruth(
  requests: GroundTruthRequest[],
  classify: (url: string) => { category: TrackerCategory; entityId: string | null } | null,
): ClassifiedRequest[] {
  return requests.map((request) => {
    const result = classify(request.url);
    const classified: ClassifiedRequest = {
      url: request.url,
      expectedTracker: request.expectedTracker,
      predictedTracker: result !== null,
    };
    if (request.expectedCategory !== undefined) {
      classified.expectedCategory = request.expectedCategory;
    }
    if (result !== null) classified.predictedCategory = result.category;
    if (request.expectedEntityId !== undefined) {
      classified.expectedEntityId = request.expectedEntityId;
    }
    if (result !== null && result.entityId !== null) {
      classified.predictedEntityId = result.entityId;
    }
    return classified;
  });
}

export function measureAccuracy(results: ClassifiedRequest[]): AccuracyMetrics {
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let entityMatches = 0;
  let entityMismatches = 0;
  const categoryConfusion = new Map<string, number>();

  for (const result of results) {
    if (result.expectedTracker && result.predictedTracker) truePositives += 1;
    else if (!result.expectedTracker && !result.predictedTracker) trueNegatives += 1;
    else if (!result.expectedTracker) falsePositives += 1;
    else falseNegatives += 1;

    if (result.expectedCategory !== undefined && result.predictedCategory !== undefined) {
      const key = `${result.expectedCategory}->${result.predictedCategory}`;
      categoryConfusion.set(key, (categoryConfusion.get(key) ?? 0) + 1);
    }

    if (result.expectedEntityId !== undefined) {
      if (result.expectedEntityId === result.predictedEntityId) entityMatches += 1;
      else entityMismatches += 1;
    }
  }

  const categoryConfusionRecord = Object.fromEntries(categoryConfusion);

  return {
    total: results.length,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    precision: ratio(truePositives, truePositives + falsePositives),
    recall: ratio(truePositives, truePositives + falseNegatives),
    categoryConfusion: categoryConfusionRecord,
    entityMatches,
    entityMismatches,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
