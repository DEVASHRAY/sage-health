import { EstimatorError, EstimatorUnavailableError } from '../ai/errors';
import {
  DeviceNotRegisteredError,
  EstimateInputMissingError,
  ImageTooLargeError,
  InvalidInputError,
  NotFoundError,
} from '../services/errors';
import { HttpError } from './httpErrors';

/**
 * The one place that decides which HTTP response each failure becomes. Anything unrecognised
 * is a 500 with a generic message, so internals never leak to clients.
 */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  if (error instanceof NotFoundError) return new HttpError(404, 'NOT_FOUND', error.message);
  if (error instanceof DeviceNotRegisteredError) {
    return new HttpError(401, 'DEVICE_NOT_REGISTERED', error.message);
  }
  if (error instanceof InvalidInputError) {
    return new HttpError(400, 'VALIDATION_ERROR', error.message);
  }
  if (error instanceof EstimateInputMissingError) {
    return new HttpError(422, 'ESTIMATE_INPUT_MISSING', error.message);
  }
  if (error instanceof ImageTooLargeError) {
    return new HttpError(413, 'IMAGE_TOO_LARGE', error.message, {
      limitBytes: error.limitBytes,
      actualBytes: error.actualBytes,
    });
  }

  if (error instanceof EstimatorUnavailableError) {
    return new HttpError(
      503,
      'ESTIMATOR_UNAVAILABLE',
      'The estimator is temporarily unavailable. Keep the photo and try again shortly.',
      {
        attempts: error.attempts.map(({ provider, model, code }) => ({ provider, model, code })),
      },
    );
  }
  if (error instanceof EstimatorError) {
    return new HttpError(
      502,
      'ESTIMATOR_REJECTED',
      'The estimator could not process this request.',
    );
  }

  return fromFrameworkError(error) ?? new HttpError(500, 'INTERNAL_ERROR', 'Something went wrong.');
}

/** Errors Fastify raises before a handler runs (bad JSON, body too large, wrong media type). */
function fromFrameworkError(error: unknown): HttpError | null {
  if (!(error instanceof Error) || !('statusCode' in error)) return null;
  const status = error.statusCode;
  if (typeof status !== 'number' || status < 400 || status >= 500) return null;

  if (status === 413) {
    return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  if (status === 404) return new HttpError(404, 'NOT_FOUND', 'Not found.');
  return new HttpError(status, 'VALIDATION_ERROR', error.message);
}
