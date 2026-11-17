import type { Meal } from '@sage/shared';
import type { MealRecord } from './ports';

/** Stored meal -> API meal. Drops the owner id and serialises instants as ISO strings (UTC). */
export function toMealDto(record: MealRecord): Meal {
  return {
    id: record.id,
    slot: record.slot,
    eatenAt: record.eatenAt.toISOString(),
    source: record.source,
    items: record.items,
    totalKcal: record.totalKcal,
    totalProteinG: record.totalProteinG,
    createdAt: record.createdAt.toISOString(),
  };
}
