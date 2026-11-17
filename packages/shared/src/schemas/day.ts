import { z } from 'zod';
import { localDateSchema, mealSlotSchema, tzOffsetMinutesSchema } from './common';
import { mealItemSchema, mealSchema } from './meal';
import { planSchema } from './profile';

export const dayParamsSchema = z.object({ date: localDateSchema });
export const dayQuerySchema = z.object({ tzOffsetMinutes: tzOffsetMinutesSchema.default(0) });

export const suggestionSchema = z.object({
  slot: mealSlotSchema,
  items: z.array(mealItemSchema),
  totalKcal: z.number().int().nonnegative(),
  /** `yesterday` when the source meal was eaten the day before, `earlier` when it is older. */
  basedOn: z.enum(['yesterday', 'earlier']),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const dayResponseSchema = z.object({
  date: localDateSchema,
  /** Null until the profile has been saved. */
  plan: planSchema.nullable(),
  eatenKcal: z.number().int().nonnegative(),
  /** Target minus eaten; negative when over target, null when there is no plan yet. */
  leftKcal: z.number().int().nullable(),
  proteinG: z.number().nonnegative(),
  meals: z.array(mealSchema),
  streakDays: z.number().int().nonnegative(),
  suggestion: suggestionSchema.nullable(),
});
export type DayResponse = z.infer<typeof dayResponseSchema>;
