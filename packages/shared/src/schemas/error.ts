import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'DEVICE_ID_REQUIRED',
  'DEVICE_ID_INVALID',
  'DEVICE_NOT_REGISTERED',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'IMAGE_TOO_LARGE',
  'ESTIMATE_INPUT_MISSING',
  'RATE_LIMITED',
  /** Every model in the chain failed transiently. Safe to queue the photo and retry later. */
  'ESTIMATOR_UNAVAILABLE',
  /** The AI provider rejected our request. Retrying the same request will not help. */
  'ESTIMATOR_REJECTED',
  'INTERNAL_ERROR',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof healthResponseSchema>;
