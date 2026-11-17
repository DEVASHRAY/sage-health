import { describe, expect, it } from 'vitest';
import { summariseDay, sumItems, type SummarisableMeal } from '../src';

const breakfast: SummarisableMeal = {
  id: 'm1',
  slot: 'breakfast',
  items: [
    { kcal: 240, proteinG: 6.2 },
    { kcal: 90, proteinG: 3.1 },
  ],
};
const lunch: SummarisableMeal = { id: 'm2', slot: 'lunch', items: [{ kcal: 610, proteinG: 22.4 }] };

describe('sumItems', () => {
  it('returns zeros for no items', () => {
    expect(sumItems([])).toEqual({ totalKcal: 0, totalProteinG: 0 });
  });

  it('keeps protein to one decimal without floating point drift', () => {
    expect(sumItems([0.1, 0.2, 0.3].map((proteinG) => ({ kcal: 0, proteinG })))).toEqual({
      totalKcal: 0,
      totalProteinG: 0.6,
    });
  });
});

describe('summariseDay', () => {
  it('adds up the day and each meal', () => {
    expect(summariseDay([breakfast, lunch], { targetKcal: 1850 })).toEqual({
      eatenKcal: 940,
      leftKcal: 910,
      proteinG: 31.7,
      meals: [
        { mealId: 'm1', slot: 'breakfast', totalKcal: 330, totalProteinG: 9.3 },
        { mealId: 'm2', slot: 'lunch', totalKcal: 610, totalProteinG: 22.4 },
      ],
    });
  });

  it('lets calories left go negative when over target', () => {
    expect(summariseDay([breakfast, lunch], { targetKcal: 900 }).leftKcal).toBe(-40);
  });

  it('leaves the whole target on an empty day', () => {
    expect(summariseDay([], { targetKcal: 1850 })).toEqual({
      eatenKcal: 0,
      leftKcal: 1850,
      proteinG: 0,
      meals: [],
    });
  });

  it('has no calories-left figure before a plan exists', () => {
    expect(summariseDay([breakfast], null).leftKcal).toBeNull();
  });
});
