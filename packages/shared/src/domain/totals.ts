import { roundToOneDecimal } from './rounding';

export interface Nutrition {
  kcal: number;
  proteinG: number;
}

export interface Totals {
  totalKcal: number;
  totalProteinG: number;
}

/**
 * The single place meal totals are computed. Calories are whole numbers; protein keeps one
 * decimal so that summing many small items does not drift.
 */
export function sumItems(items: readonly Nutrition[]): Totals {
  let kcal = 0;
  let proteinG = 0;
  for (const item of items) {
    kcal += item.kcal;
    proteinG += item.proteinG;
  }
  return { totalKcal: Math.round(kcal), totalProteinG: roundToOneDecimal(proteinG) };
}
