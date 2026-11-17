import type { MealSlot } from '../schemas/common';
import type { Plan } from '../schemas/profile';
import { sumItems, type Nutrition } from './totals';

export interface SummarisableMeal {
  id: string;
  slot: MealSlot;
  items: readonly Nutrition[];
}

export interface MealTotals {
  mealId: string;
  slot: MealSlot;
  totalKcal: number;
  totalProteinG: number;
}

export interface DaySummary {
  eatenKcal: number;
  /** Target minus eaten. Negative when over target; null when there is no plan yet. */
  leftKcal: number | null;
  proteinG: number;
  meals: MealTotals[];
}

/**
 * Totals for one day. Everything is derived from the items, never from stored totals, so the
 * summary cannot disagree with the list of foods the user sees.
 */
export function summariseDay(
  meals: readonly SummarisableMeal[],
  plan: Pick<Plan, 'targetKcal'> | null,
): DaySummary {
  const perMeal = meals.map((meal) => ({
    mealId: meal.id,
    slot: meal.slot,
    ...sumItems(meal.items),
  }));
  const day = sumItems(
    perMeal.map((meal) => ({ kcal: meal.totalKcal, proteinG: meal.totalProteinG })),
  );
  return {
    eatenKcal: day.totalKcal,
    leftKcal: plan ? plan.targetKcal - day.totalKcal : null,
    proteinG: day.totalProteinG,
    meals: perMeal,
  };
}
