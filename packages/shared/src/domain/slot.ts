import type { MealSlot } from '../schemas/common';

/**
 * Slot boundaries by local hour (24h clock):
 *   05:00-10:59 breakfast, 11:00-15:59 lunch, 16:00-18:59 snack, 19:00-04:59 dinner.
 * Late-night eating counts as dinner rather than a very early breakfast.
 */
export function mealSlotForHour(hour: number): MealSlot {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour must be an integer from 0 to 23, got ${hour}`);
  }
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 19) return 'snack';
  return 'dinner';
}

/** Slot for a `Date`, read in the runtime's local time zone (the device's, on the phone). */
export function mealSlotForTime(date: Date): MealSlot {
  return mealSlotForHour(date.getHours());
}
