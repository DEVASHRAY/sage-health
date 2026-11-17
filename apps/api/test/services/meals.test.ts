import { describe, expect, it } from 'vitest';
import { DeleteMeal } from '../../src/services/DeleteMeal';
import { InvalidInputError, NotFoundError } from '../../src/services/errors';
import { LogMeal } from '../../src/services/LogMeal';
import { UpdateMeal } from '../../src/services/UpdateMeal';
import { chai, dal, roti } from '../support/fixtures';
import { FixedClock, InMemoryMealRepository } from '../support/inMemoryRepositories';

const NOW = '2026-03-10T07:30:00.000Z';

function setup() {
  const meals = new InMemoryMealRepository();
  const clock = new FixedClock(NOW);
  return {
    meals,
    logMeal: new LogMeal(meals, clock),
    updateMeal: new UpdateMeal(meals),
    deleteMeal: new DeleteMeal(meals),
  };
}

const lunch = {
  slot: 'lunch',
  eatenAt: '2026-03-10T13:00:00+05:30',
  source: 'photo',
  items: [roti, dal],
} as const;

describe('LogMeal', () => {
  it('saves the meal with server-computed totals and a UTC timestamp', async () => {
    const { logMeal } = setup();

    const meal = await logMeal.execute('u1', { ...lunch, items: [...lunch.items] });

    expect(meal).toMatchObject({
      slot: 'lunch',
      source: 'photo',
      eatenAt: '2026-03-10T07:30:00.000Z',
      items: [roti, dal],
      totalKcal: 390,
      totalProteinG: 15.3,
    });
    expect(meal).not.toHaveProperty('userId');
  });

  it('ignores totals smuggled in by the client', async () => {
    const { logMeal } = setup();
    const tampered = { ...lunch, items: [roti], totalKcal: 1, totalProteinG: 1 };

    const meal = await logMeal.execute('u1', tampered);

    expect(meal.totalKcal).toBe(roti.kcal);
  });

  it('accepts a meal eaten in the past or slightly ahead of the server clock', async () => {
    const { logMeal } = setup();

    await expect(
      logMeal.execute('u1', { ...lunch, items: [roti], eatenAt: '2025-01-01T00:00:00Z' }),
    ).resolves.toBeDefined();
    await expect(
      logMeal.execute('u1', { ...lunch, items: [roti], eatenAt: '2026-03-11T07:00:00Z' }),
    ).resolves.toBeDefined();
  });

  it('rejects a meal dated more than a day in the future', async () => {
    const { meals, logMeal } = setup();

    await expect(
      logMeal.execute('u1', { ...lunch, items: [roti], eatenAt: '2026-03-12T08:00:00Z' }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(meals.all).toHaveLength(0);
  });
});

describe('UpdateMeal', () => {
  it('replaces the items and recomputes totals', async () => {
    const { logMeal, updateMeal } = setup();
    const meal = await logMeal.execute('u1', { ...lunch, items: [roti, dal] });

    const updated = await updateMeal.execute('u1', meal.id, { items: [chai] });

    expect(updated).toMatchObject({
      id: meal.id,
      items: [chai],
      totalKcal: 90,
      totalProteinG: 2.5,
      eatenAt: meal.eatenAt,
    });
  });

  it('reports not-found for a missing meal and for another user`s meal alike', async () => {
    const { meals, logMeal, updateMeal } = setup();
    const meal = await logMeal.execute('owner', { ...lunch, items: [roti] });

    await expect(updateMeal.execute('intruder', meal.id, { items: [chai] })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      updateMeal.execute('owner', '00000000-0000-4000-8000-000000000000', { items: [chai] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(meals.all[0]?.items).toEqual([roti]);
  });
});

describe('DeleteMeal', () => {
  it('deletes the owner`s meal', async () => {
    const { meals, logMeal, deleteMeal } = setup();
    const meal = await logMeal.execute('owner', { ...lunch, items: [roti] });

    await deleteMeal.execute('owner', meal.id);

    expect(meals.all).toHaveLength(0);
  });

  it('refuses to delete another user`s meal and leaves it in place', async () => {
    const { meals, logMeal, deleteMeal } = setup();
    const meal = await logMeal.execute('owner', { ...lunch, items: [roti] });

    await expect(deleteMeal.execute('intruder', meal.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(meals.all).toHaveLength(1);
  });

  it('reports not-found when deleting twice', async () => {
    const { logMeal, deleteMeal } = setup();
    const meal = await logMeal.execute('owner', { ...lunch, items: [roti] });
    await deleteMeal.execute('owner', meal.id);

    await expect(deleteMeal.execute('owner', meal.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
