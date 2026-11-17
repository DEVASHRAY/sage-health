import { z } from 'zod';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export const mealSlotSchema = z.enum(MEAL_SLOTS);
export type MealSlot = z.infer<typeof mealSlotSchema>;

/** How a saved meal was captured. `repeat` is a one-tap copy of an earlier meal. */
export const mealSourceSchema = z.enum(['photo', 'text', 'repeat']);
export type MealSource = z.infer<typeof mealSourceSchema>;

export const confidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof confidenceSchema>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Anonymous per-device identifier, sent in the `x-device-id` header. */
export const deviceIdSchema = z
  .string()
  .regex(UUID_V4, 'must be a UUID v4')
  .transform((value) => value.toLowerCase());

export const DEVICE_ID_HEADER = 'x-device-id';

/** A calendar date, `YYYY-MM-DD`, that actually exists (rejects 2025-02-30). */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be formatted YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'must be a real calendar date');
export type LocalDate = z.infer<typeof localDateSchema>;

/**
 * Offset between UTC and the device's local time in minutes, with the same sign as
 * JavaScript's `Date.prototype.getTimezoneOffset()`: UTC minus local time.
 * India (UTC+5:30) is -330; New York in winter (UTC-5) is 300.
 */
export const tzOffsetMinutesSchema = z.coerce.number().int().min(-840).max(720);
