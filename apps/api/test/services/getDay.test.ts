import { calculatePlan, sumItems, type MealItem, type MealSlot } from '@sage/shared';
import { describe, expect, it } from 'vitest';
import { GetDay } from '../../src/services/GetDay';
import { ashaProfile, chai, dal, roti } from '../support/fixtures';
import {
  FixedClock,
  InMemoryMealRepository,
  InMemoryProfileRepository,
} from '../support/inMemoryRepositories';

const IST = -330;
const USER = 'u1';

/** 08:30 on 10 March in India, i.e. breakfast time. */
const BREAKFAST_TIME_IST = '2026-03-10T03:00:00.000Z';

async function setup(now = BREAKFAST_TIME_IST) {
  const meals = new InMemoryMealRepository();
  const profiles = new InMemoryProfileRepository();
  const clock = new FixedClock(now);
  await profiles.save(USER, { profile: ashaProfile, plan: calculatePlan(ashaProfile) });

  const log = (eatenAt: string, slot: MealSlot, items: MealItem[], userId = USER) =>
    meals.create(userId, {
      slot,
      eatenAt: new Date(eatenAt),
      source: 'text',
      items,
      ...sumItems(items),
    });

  return { meals, profiles, clock, log, getDay: new GetDay(meals, profiles, clock) };
}

describe('GetDay', () => {
  it('returns an empty day with the full target left', async () => {
    const { getDay } = await setup();

    expect(await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST })).toEqual({
      date: '2026-03-10',
      plan: calculatePlan(ashaProfile),
      eatenKcal: 0,
      leftKcal: 1250,
      proteinG: 0,
      meals: [],
      streakDays: 0,
      suggestion: null,
    });
  });

  it('totals the meals of the day in the order they were eaten', async () => {
    const { getDay, log } = await setup('2026-03-10T15:00:00.000Z');
    await log('2026-03-10T08:00:00.000Z', 'lunch', [roti, dal]);
    await log('2026-03-10T03:00:00.000Z', 'breakfast', [chai]);

    const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

    expect(day.meals.map((meal) => meal.slot)).toEqual(['breakfast', 'lunch']);
    expect(day).toMatchObject({ eatenKcal: 480, leftKcal: 770, proteinG: 17.8 });
  });

  it('reports a negative amount left when over target', async () => {
    const { getDay, log } = await setup();
    const feast: MealItem = { ...roti, name: 'Biryani', portion: '3 plates', kcal: 1500 };
    await log('2026-03-10T08:00:00.000Z', 'lunch', [feast]);

    const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

    expect(day.leftKcal).toBe(-250);
  });

  it('has no plan and no calories-left figure before the profile is saved', async () => {
    const { getDay, log } = await setup();
    await log('2026-03-10T03:00:00.000Z', 'breakfast', [chai], 'no-profile-user');

    const day = await getDay.execute('no-profile-user', {
      date: '2026-03-10',
      tzOffsetMinutes: IST,
    });

    expect(day).toMatchObject({ plan: null, leftKcal: null, eatenKcal: 90 });
  });

  it('never includes another user`s meals', async () => {
    const { getDay, log } = await setup();
    await log('2026-03-10T03:00:00.000Z', 'breakfast', [chai], 'someone-else');
    await log('2026-03-09T03:00:00.000Z', 'breakfast', [chai], 'someone-else');

    const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

    expect(day).toMatchObject({ meals: [], eatenKcal: 0, streakDays: 0, suggestion: null });
  });

  describe('time zones', () => {
    // 20:00 UTC on 10 March is 01:30 on 11 March in India and 15:00 on 10 March in New York.
    const LATE_EVENING_UTC = '2026-03-10T20:00:00.000Z';

    it('assigns a meal to the local day of the device, not the UTC day', async () => {
      const { getDay, log } = await setup();
      await log(LATE_EVENING_UTC, 'dinner', [roti]);

      const india10 = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });
      const india11 = await getDay.execute(USER, { date: '2026-03-11', tzOffsetMinutes: IST });
      const newYork10 = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: 300 });
      const utc10 = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: 0 });

      expect(india10.meals).toHaveLength(0);
      expect(india11.meals).toHaveLength(1);
      expect(newYork10.meals).toHaveLength(1);
      expect(utc10.meals).toHaveLength(1);
    });

    it('includes the first instant of the local day and excludes the first of the next', async () => {
      const { getDay, log } = await setup();
      await log('2026-03-09T18:30:00.000Z', 'dinner', [roti]); // 00:00 IST on the 10th
      await log('2026-03-10T18:30:00.000Z', 'dinner', [dal]); // 00:00 IST on the 11th

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.meals.map((meal) => meal.items[0]?.name)).toEqual(['Roti']);
    });
  });

  describe('streak', () => {
    it('counts consecutive local days ending today', async () => {
      const { getDay, log } = await setup();
      await log('2026-03-08T04:00:00.000Z', 'breakfast', [chai]);
      await log('2026-03-09T04:00:00.000Z', 'breakfast', [chai]);
      await log('2026-03-10T02:00:00.000Z', 'breakfast', [chai]);
      await log('2026-03-10T02:30:00.000Z', 'breakfast', [roti]); // two meals, one day

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.streakDays).toBe(3);
    });

    it('keeps the streak through the morning before anything is logged today', async () => {
      const { getDay, log } = await setup();
      await log('2026-03-08T04:00:00.000Z', 'breakfast', [chai]);
      await log('2026-03-09T04:00:00.000Z', 'breakfast', [chai]);

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.streakDays).toBe(2);
    });

    it('breaks on a missed day', async () => {
      const { getDay, log } = await setup();
      await log('2026-03-07T04:00:00.000Z', 'breakfast', [chai]);
      await log('2026-03-09T04:00:00.000Z', 'breakfast', [chai]);
      await log('2026-03-10T02:00:00.000Z', 'breakfast', [chai]);

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.streakDays).toBe(2);
    });

    it('depends on the time zone the days are counted in', async () => {
      const { getDay, log } = await setup();
      // 21:00 UTC on the 8th and 9th: late evening in UTC, but already the 9th and 10th in India.
      await log('2026-03-08T21:00:00.000Z', 'dinner', [roti]);
      await log('2026-03-09T21:00:00.000Z', 'dinner', [roti]);

      const india = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });
      const utc = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: 0 });
      const indiaOn11th = await getDay.execute(USER, { date: '2026-03-11', tzOffsetMinutes: IST });

      expect(india.streakDays).toBe(2); // 9th and 10th (today)
      expect(utc.streakDays).toBe(2); // 8th and 9th, today still open
      expect(indiaOn11th.streakDays).toBe(2); // nothing on the 11th yet
    });
  });

  describe('suggestion', () => {
    it('offers yesterday`s meal for the current slot when that slot is empty today', async () => {
      const { getDay, log } = await setup(BREAKFAST_TIME_IST);
      await log('2026-03-09T03:15:00.000Z', 'breakfast', [chai, roti]);

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.suggestion).toEqual({
        slot: 'breakfast',
        items: [chai, roti],
        totalKcal: 300,
        basedOn: 'yesterday',
      });
    });

    it('picks the most recent earlier meal in the slot and labels older ones honestly', async () => {
      const { getDay, log } = await setup(BREAKFAST_TIME_IST);
      await log('2026-03-05T03:00:00.000Z', 'breakfast', [chai]);
      await log('2026-03-07T03:00:00.000Z', 'breakfast', [roti]);
      await log('2026-03-09T08:00:00.000Z', 'lunch', [dal]); // other slot, more recent

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.suggestion).toMatchObject({
        slot: 'breakfast',
        items: [roti],
        basedOn: 'earlier',
      });
    });

    it('offers nothing once the current slot has a meal today', async () => {
      const { getDay, log } = await setup(BREAKFAST_TIME_IST);
      await log('2026-03-09T03:15:00.000Z', 'breakfast', [chai]);
      await log('2026-03-10T02:45:00.000Z', 'breakfast', [roti]);

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.suggestion).toBeNull();
    });

    it('still suggests when only a different slot is logged today', async () => {
      const { getDay, log, clock } = await setup();
      clock.set('2026-03-10T08:00:00.000Z'); // 13:30 IST, lunch
      await log('2026-03-09T08:00:00.000Z', 'lunch', [dal]);
      await log('2026-03-10T03:00:00.000Z', 'breakfast', [chai]);

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.suggestion).toMatchObject({ slot: 'lunch', items: [dal] });
    });

    it('never suggests a meal from earlier the same day', async () => {
      const { getDay, log, clock } = await setup();
      clock.set('2026-03-10T15:00:00.000Z'); // 20:30 IST, dinner
      await log('2026-03-10T00:00:00.000Z', 'dinner', [roti]); // 05:30 IST today, logged as dinner

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.suggestion).toBeNull(); // slot already has a meal today
    });

    it('works out the current slot in the device`s time zone', async () => {
      // 14:00 UTC: 19:30 in India (dinner) but 09:00 in New York (breakfast).
      const { getDay, log } = await setup('2026-03-10T14:00:00.000Z');
      await log('2026-03-09T14:30:00.000Z', 'dinner', [dal]);
      await log('2026-03-09T13:00:00.000Z', 'breakfast', [chai]);

      const india = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });
      const newYork = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: 300 });

      expect(india.suggestion).toMatchObject({ slot: 'dinner', items: [dal] });
      expect(newYork.suggestion).toMatchObject({ slot: 'breakfast', items: [chai] });
    });

    it('offers nothing when the day being viewed is not the device`s today', async () => {
      const { getDay, log } = await setup(BREAKFAST_TIME_IST);
      await log('2026-03-08T03:15:00.000Z', 'breakfast', [chai]);

      const yesterday = await getDay.execute(USER, { date: '2026-03-09', tzOffsetMinutes: IST });
      // 03:00 UTC on the 10th is still the 9th in New York, so the 10th is "tomorrow" there.
      const tomorrow = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: 300 });

      expect(yesterday.suggestion).toBeNull();
      expect(tomorrow.suggestion).toBeNull();
    });

    it('offers nothing to a user with no history in the slot', async () => {
      const { getDay } = await setup();

      const day = await getDay.execute(USER, { date: '2026-03-10', tzOffsetMinutes: IST });

      expect(day.suggestion).toBeNull();
    });
  });
});
