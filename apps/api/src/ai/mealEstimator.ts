import { mealItemSchema, roundToOneDecimal, type ImageMimeType, type MealSlot } from '@sage/shared';
import { z } from 'zod';

/** What the service hands to an estimator. Exactly one of `image` and `text` is the subject. */
export interface EstimateInput {
  /** User the estimate is for. Used for the audit log only; never sent to the model. */
  requesterId: string;
  source: 'photo' | 'text';
  image?: { base64: string; mimeType: ImageMimeType };
  /** The description (text source) or an optional note alongside a photo. */
  text?: string;
  slot?: MealSlot;
}

/**
 * The only shape of model output the system accepts. Models may return fractional calories;
 * they are rounded here. Totals are intentionally not part of this schema: any totals a model
 * volunteers are dropped and the server adds up the items itself.
 */
export const modelEstimateSchema = z.object({
  isMeal: z.boolean(),
  readable: z.boolean(),
  reasonIfNot: z.string().trim().max(300).nullish().transform(emptyToNull),
  items: z
    .array(
      mealItemSchema.extend({
        kcal: z.number().min(0).max(5000).transform(Math.round),
        proteinG: z.number().min(0).max(500).transform(roundToOneDecimal),
      }),
    )
    .max(30),
  question: z.string().trim().max(300).nullish().transform(emptyToNull),
});
export type ModelEstimate = z.infer<typeof modelEstimateSchema>;

function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

/** A validated model answer, stamped with who produced it. Not yet safe to show: see the service. */
export interface RawEstimate extends ModelEstimate {
  provider: string;
  model: string;
}

export interface EstimateOptions {
  /** Aborted when the caller stops waiting. Estimators should cancel their I/O. */
  signal?: AbortSignal;
}

/** Port: turns a photo or a sentence into a structured estimate. */
export interface MealEstimator {
  estimate(input: EstimateInput, options?: EstimateOptions): Promise<RawEstimate>;
}

/** An estimator backed by one specific model, so each attempt can be attributed. */
export interface ModelMealEstimator extends MealEstimator {
  readonly provider: string;
  readonly model: string;
}
