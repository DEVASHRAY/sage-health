import {
  addDays,
  countStreakDays,
  localDateOf,
  localDayRange,
  localHourOf,
  mealSlotForHour,
  summariseDay,
  type DayResponse,
  type Suggestion,
} from '@sage/shared';
import { toMealDto } from './mealMapper';
import type { Clock, MealRecord, MealRepository, ProfileRepository } from './ports';

/** How far back a streak is counted. A longer streak is reported as this many days. */
export const STREAK_LOOKBACK_DAYS = 366;

export interface GetDayQuery {
  /** The local calendar day to show, `YYYY-MM-DD`. */
  date: string;
  /** UTC minus local time in minutes, as `Date.prototype.getTimezoneOffset()` reports it. */
  tzOffsetMinutes: number;
}

/** Everything the "Today" screen shows for one local calendar day. */
export class GetDay {
  constructor(
    private readonly meals: MealRepository,
    private readonly profiles: ProfileRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, query: GetDayQuery): Promise<DayResponse> {
    const { date, tzOffsetMinutes } = query;
    const day = localDayRange(date, tzOffsetMinutes);

    const [meals, profileRecord, streakDays] = await Promise.all([
      this.meals.listEatenBetween(userId, day),
      this.profiles.findByUserId(userId),
      this.#streakDays(userId, query),
    ]);
    const plan = profileRecord?.plan ?? null;
    const summary = summariseDay(meals, plan);

    return {
      date,
      plan,
      eatenKcal: summary.eatenKcal,
      leftKcal: summary.leftKcal,
      proteinG: summary.proteinG,
      meals: meals.map(toMealDto),
      streakDays,
      suggestion: await this.#suggestion(userId, query, meals),
    };
  }

  async #streakDays(userId: string, { date, tzOffsetMinutes }: GetDayQuery): Promise<number> {
    const lookback = {
      start: localDayRange(addDays(date, -(STREAK_LOOKBACK_DAYS - 1)), tzOffsetMinutes).start,
      end: localDayRange(date, tzOffsetMinutes).end,
    };
    const instants = await this.meals.listEatenAtBetween(userId, lookback);
    const loggedDates = new Set(instants.map((instant) => localDateOf(instant, tzOffsetMinutes)));
    return countStreakDays(loggedDates, date);
  }

  /**
   * "Same as last time?" for the slot the user is in right now. Offered only when the day being
   * viewed is the user's today and that slot is still empty; a past day never gets a suggestion.
   */
  async #suggestion(
    userId: string,
    { date, tzOffsetMinutes }: GetDayQuery,
    mealsOfDay: readonly MealRecord[],
  ): Promise<Suggestion | null> {
    const now = this.clock.now();
    if (localDateOf(now, tzOffsetMinutes) !== date) return null;

    const slot = mealSlotForHour(localHourOf(now, tzOffsetMinutes));
    if (mealsOfDay.some((meal) => meal.slot === slot)) return null;

    const startOfDay = localDayRange(date, tzOffsetMinutes).start;
    const previous = await this.meals.findLatestInSlotBefore(userId, slot, startOfDay);
    if (!previous) return null;

    const eatenOn = localDateOf(previous.eatenAt, tzOffsetMinutes);
    return {
      slot,
      items: previous.items,
      totalKcal: previous.totalKcal,
      basedOn: eatenOn === addDays(date, -1) ? 'yesterday' : 'earlier',
    };
  }
}
