import { describe, expect, it } from 'vitest';
import { mealSlotForHour, mealSlotForTime } from '../src';

describe('mealSlotForHour', () => {
  it.each([
    [0, 'dinner'],
    [4, 'dinner'],
    [5, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [15, 'lunch'],
    [16, 'snack'],
    [18, 'snack'],
    [19, 'dinner'],
    [23, 'dinner'],
  ] as const)('maps %i:00 to %s', (hour, slot) => {
    expect(mealSlotForHour(hour)).toBe(slot);
  });

  it.each([-1, 24, 7.5, Number.NaN])('rejects %s as an hour', (hour) => {
    expect(() => mealSlotForHour(hour)).toThrow(RangeError);
  });
});

describe('mealSlotForTime', () => {
  it('reads the hour in local time', () => {
    expect(mealSlotForTime(new Date(2026, 0, 15, 8, 30))).toBe('breakfast');
    expect(mealSlotForTime(new Date(2026, 0, 15, 13, 0))).toBe('lunch');
    expect(mealSlotForTime(new Date(2026, 0, 15, 17, 59))).toBe('snack');
    expect(mealSlotForTime(new Date(2026, 0, 15, 21, 15))).toBe('dinner');
  });
});
