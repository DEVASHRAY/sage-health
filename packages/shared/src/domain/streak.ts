import { addDays } from './localDay';

/**
 * Consecutive days, ending today, with at least one meal logged.
 *
 * A day that has only just started should not wipe out the streak, so when nothing is logged
 * today yet the run is counted up to yesterday instead. It drops to 0 only once a full day
 * has been missed.
 */
export function countStreakDays(loggedDates: ReadonlySet<string>, today: string): number {
  let cursor = loggedDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (loggedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
