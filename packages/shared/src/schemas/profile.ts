import { z } from 'zod';

export const sexSchema = z.enum(['female', 'male']);
export type Sex = z.infer<typeof sexSchema>;

export const activityLevelSchema = z.enum(['sedentary', 'light', 'moderate', 'active']);
export type ActivityLevel = z.infer<typeof activityLevelSchema>;

/** Body of `PUT /v1/profile`. Bounds are plausibility checks for adults, not medical limits. */
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sex: sexSchema.optional(),
  age: z.number().int().min(18).max(100),
  weightKg: z.number().min(30).max(300),
  heightCm: z.number().min(120).max(230),
  goalWeightKg: z.number().min(30).max(300),
  activity: activityLevelSchema,
});
export type Profile = z.infer<typeof profileSchema>;

export const planSchema = z.object({
  /** Estimated calories the body uses per day (TDEE), rounded to the nearest 50. */
  maintenanceKcal: z.number().int().positive(),
  /** Daily calorie target, rounded to the nearest 50 and never below the safe floor. */
  targetKcal: z.number().int().positive(),
  /** `maintenanceKcal - targetKcal`; 0 when there is no weight to lose or no safe room. */
  dailyDeficitKcal: z.number().int().nonnegative(),
  proteinTargetG: z.number().int().positive(),
  /** Whole weeks to reach the goal at this deficit; 0 at goal, null when it cannot be reached safely. */
  weeksToGoal: z.number().int().nonnegative().nullable(),
  /** True when the safe floor, rather than the standard deficit, decided the target. */
  floorApplied: z.boolean(),
});
export type Plan = z.infer<typeof planSchema>;

export const profileResponseSchema = z.object({ profile: profileSchema, plan: planSchema });
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const bootstrapResponseSchema = z.object({
  userId: z.uuid(),
  profile: profileSchema.nullable(),
  plan: planSchema.nullable(),
});
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
