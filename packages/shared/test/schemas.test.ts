import { describe, expect, it } from 'vitest';
import {
  createMealSchema,
  dayQuerySchema,
  deviceIdSchema,
  estimateRequestSchema,
  localDateSchema,
  profileSchema,
} from '../src';

describe('contract schemas', () => {
  it('accepts only UUID v4 device ids and normalises case', () => {
    expect(deviceIdSchema.parse('7B0E5C7E-9D55-4B0A-8F0E-2D6C1E0A9F11')).toBe(
      '7b0e5c7e-9d55-4b0a-8f0e-2d6c1e0a9f11',
    );
    expect(deviceIdSchema.safeParse('7b0e5c7e-9d55-1b0a-8f0e-2d6c1e0a9f11').success).toBe(false);
    expect(deviceIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('rejects dates that do not exist', () => {
    expect(localDateSchema.safeParse('2026-02-28').success).toBe(true);
    expect(localDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(localDateSchema.safeParse('2026-2-3').success).toBe(false);
  });

  it('coerces the tz offset from a query string and defaults to UTC', () => {
    expect(dayQuerySchema.parse({ tzOffsetMinutes: '-330' })).toEqual({ tzOffsetMinutes: -330 });
    expect(dayQuerySchema.parse({})).toEqual({ tzOffsetMinutes: 0 });
    expect(dayQuerySchema.safeParse({ tzOffsetMinutes: '9000' }).success).toBe(false);
    expect(dayQuerySchema.safeParse({ tzOffsetMinutes: 'abc' }).success).toBe(false);
  });

  it('allows a profile without sex and trims the name', () => {
    const parsed = profileSchema.parse({
      name: '  Asha ',
      age: 34,
      weightKg: 82,
      heightCm: 165,
      goalWeightKg: 76,
      activity: 'sedentary',
    });
    expect(parsed.name).toBe('Asha');
    expect(parsed.sex).toBeUndefined();
  });

  it('rejects implausible profile numbers', () => {
    const base = {
      name: 'A',
      age: 34,
      weightKg: 82,
      heightCm: 165,
      goalWeightKg: 76,
      activity: 'light',
    };
    expect(profileSchema.safeParse({ ...base, age: 12 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, weightKg: -5 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, heightCm: 1.65 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, activity: 'couch' }).success).toBe(false);
  });

  it('requires at least one item and an ISO timestamp with offset on a meal', () => {
    const item = { name: 'Roti', portion: '2 rotis', kcal: 200, proteinG: 6, confidence: 'high' };
    const meal = {
      slot: 'lunch',
      eatenAt: '2026-03-10T13:00:00+05:30',
      source: 'photo',
      items: [item],
    };
    expect(createMealSchema.safeParse(meal).success).toBe(true);
    expect(createMealSchema.safeParse({ ...meal, items: [] }).success).toBe(false);
    expect(createMealSchema.safeParse({ ...meal, eatenAt: 'yesterday' }).success).toBe(false);
    expect(createMealSchema.safeParse({ ...meal, items: [{ ...item, kcal: -1 }] }).success).toBe(
      false,
    );
  });

  it('rejects base64 with a data: prefix', () => {
    expect(
      estimateRequestSchema.safeParse({
        source: 'photo',
        imageBase64: 'data:image/png;base64,AAAA',
      }).success,
    ).toBe(false);
    expect(estimateRequestSchema.safeParse({ source: 'photo', imageBase64: 'AAAA' }).success).toBe(
      true,
    );
  });
});
