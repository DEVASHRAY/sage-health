import { z } from 'zod';
import { mealSlotSchema } from './common';
import { mealItemSchema } from './meal';

/** Largest photo accepted, measured after base64 decoding. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_ESTIMATE_TEXT_LENGTH = 1000;

export const imageMimeTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
export type ImageMimeType = z.infer<typeof imageMimeTypeSchema>;

/**
 * Body of `POST /v1/meals/estimate`.
 *
 * Shape only. Two rules are enforced by the server after parsing because they map to their own
 * status codes: the input the source needs must be present (422) and the decoded image must not
 * exceed `MAX_IMAGE_BYTES` (413). A photo may carry `text` as a note, e.g. the answer to the
 * follow-up question ("cooked in ghee").
 */
export const estimateRequestSchema = z.object({
  source: z.enum(['photo', 'text']),
  imageBase64: z
    .string()
    .regex(/^[A-Za-z0-9+/]*={0,2}$/, 'must be standard base64 without a data: prefix')
    .optional(),
  mimeType: imageMimeTypeSchema.optional(),
  text: z.string().trim().max(MAX_ESTIMATE_TEXT_LENGTH).optional(),
  slot: mealSlotSchema.optional(),
});
export type EstimateRequest = z.infer<typeof estimateRequestSchema>;

export const estimateSchema = z.object({
  /** False when the input is not food at all (a desk, a street, gibberish). */
  isMeal: z.boolean(),
  /** False when a photo is too dark or blurry to judge. */
  readable: z.boolean(),
  reasonIfNot: z.string().nullable(),
  items: z.array(mealItemSchema),
  totalKcal: z.number().int().nonnegative(),
  totalProteinG: z.number().nonnegative(),
  /** At most one follow-up about something the input cannot show (oil, ghee, sugar). */
  question: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
});
export type Estimate = z.infer<typeof estimateSchema>;
