import { MAX_IMAGE_BYTES, type Estimate, type EstimateRequest } from '@sage/shared';
import type { EstimateInput, MealEstimator } from '../ai/mealEstimator';
import { EstimateInputMissingError, ImageTooLargeError, InvalidInputError } from './errors';
import { normaliseEstimate } from './estimateNormaliser';

const DEFAULT_MIME_TYPE = 'image/jpeg';

/** Asks the AI what is on the plate. Saves nothing: the user confirms first (see LogMeal). */
export class EstimateMeal {
  constructor(private readonly estimator: MealEstimator) {}

  async execute(userId: string, request: EstimateRequest): Promise<Estimate> {
    const input = toEstimatorInput(userId, request);
    return normaliseEstimate(await this.estimator.estimate(input));
  }
}

function toEstimatorInput(userId: string, request: EstimateRequest): EstimateInput {
  const text = request.text && request.text.length > 0 ? request.text : undefined;
  const base = { requesterId: userId, ...(request.slot ? { slot: request.slot } : {}) };

  if (request.source === 'text') {
    if (!text) throw new EstimateInputMissingError('A text estimate needs a non-empty "text".');
    return { ...base, source: 'text', text };
  }

  if (!request.imageBase64) {
    throw new EstimateInputMissingError(
      text
        ? 'A photo estimate needs "imageBase64". To estimate from words alone, send source "text".'
        : 'Send "imageBase64" for a photo estimate or "text" for a text estimate.',
    );
  }
  assertImageWithinLimit(request.imageBase64);
  return {
    ...base,
    source: 'photo',
    image: { base64: request.imageBase64, mimeType: request.mimeType ?? DEFAULT_MIME_TYPE },
    ...(text ? { text } : {}),
  };
}

function assertImageWithinLimit(base64: string): void {
  if (base64.length % 4 !== 0) {
    throw new InvalidInputError(
      '"imageBase64" is not valid base64 (length is not a multiple of 4).',
    );
  }
  const bytes = decodedByteLength(base64);
  if (bytes > MAX_IMAGE_BYTES) throw new ImageTooLargeError(bytes, MAX_IMAGE_BYTES);
}

/** Size of the decoded payload, computed from the encoded length without allocating it. */
export function decodedByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}
