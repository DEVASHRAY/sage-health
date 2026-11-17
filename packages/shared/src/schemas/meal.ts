import { z } from 'zod';
import { confidenceSchema, mealSlotSchema, mealSourceSchema } from './common';

export const MAX_ITEMS_PER_MEAL = 30;

export const mealItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Human portion, e.g. "2 rotis" or "1 katori". */
  portion: z.string().trim().min(1).max(120),
  kcal: z.number().int().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  confidence: confidenceSchema,
});
export type MealItem = z.infer<typeof mealItemSchema>;

export const mealItemsSchema = z.array(mealItemSchema).min(1).max(MAX_ITEMS_PER_MEAL);

/** Body of `POST /v1/meals`. Totals are deliberately absent: the server computes them. */
export const createMealSchema = z.object({
  slot: mealSlotSchema,
  eatenAt: z.iso.datetime({ offset: true }),
  source: mealSourceSchema,
  items: mealItemsSchema,
});
export type CreateMealRequest = z.infer<typeof createMealSchema>;

/** Body of `PATCH /v1/meals/:id`. */
export const updateMealSchema = z.object({ items: mealItemsSchema });
export type UpdateMealRequest = z.infer<typeof updateMealSchema>;

export const mealIdParamsSchema = z.object({ id: z.uuid() });

export const mealSchema = z.object({
  id: z.uuid(),
  slot: mealSlotSchema,
  eatenAt: z.iso.datetime(),
  source: mealSourceSchema,
  items: z.array(mealItemSchema),
  totalKcal: z.number().int().nonnegative(),
  totalProteinG: z.number().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type Meal = z.infer<typeof mealSchema>;
