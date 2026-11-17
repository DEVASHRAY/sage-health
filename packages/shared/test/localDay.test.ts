import { describe, expect, it } from 'vitest';
import { addDays, countStreakDays, localDateOf, localDayRange, localHourOf } from '../src';

const IST = -330;
const NEW_YORK_WINTER = 300;

describe('local day helpers', () => {
  it('places an instant on the local calendar date', () => {
    const instant = new Date('2026-03-10T20:00:00.000Z');
    expect(localDateOf(instant, 0)).toBe('2026-03-10');
    expect(localDateOf(instant, IST)).toBe('2026-03-11'); // 01:30 next day in India
    expect(localDateOf(instant, NEW_YORK_WINTER)).toBe('2026-03-10');
  });

  it('reads the local hour', () => {
    const instant = new Date('2026-03-10T20:00:00.000Z');
    expect(localHourOf(instant, IST)).toBe(1);
    expect(localHourOf(instant, NEW_YORK_WINTER)).toBe(15);
  });

  it('bounds a local day in UTC', () => {
    expect(localDayRange('2026-03-11', IST)).toEqual({
      start: new Date('2026-03-10T18:30:00.000Z'),
      end: new Date('2026-03-11T18:30:00.000Z'),
    });
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('rejects strings that are not dates', () => {
    expect(() => addDays('nope', 1)).toThrow(RangeError);
    expect(() => localDayRange('nope', 0)).toThrow(RangeError);
  });
});

describe('countStreakDays', () => {
  it('is 0 with nothing logged', () => {
    expect(countStreakDays(new Set(), '2026-03-10')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const logged = new Set(['2026-03-08', '2026-03-09', '2026-03-10']);
    expect(countStreakDays(logged, '2026-03-10')).toBe(3);
  });

  it('stops at the first gap', () => {
    const logged = new Set(['2026-03-06', '2026-03-09', '2026-03-10']);
    expect(countStreakDays(logged, '2026-03-10')).toBe(2);
  });

  it('keeps yesterday`s streak alive until today is over', () => {
    expect(countStreakDays(new Set(['2026-03-08', '2026-03-09']), '2026-03-10')).toBe(2);
  });

  it('resets once a whole day has been missed', () => {
    expect(countStreakDays(new Set(['2026-03-07', '2026-03-08']), '2026-03-10')).toBe(0);
  });
});
