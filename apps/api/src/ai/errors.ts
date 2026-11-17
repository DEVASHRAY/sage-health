/**
 * Why a single attempt against a model failed.
 *
 * Retryable codes describe the model or the network having a bad moment, so the next model in
 * the chain is worth trying. Non-retryable codes mean our own request is at fault (or our
 * credentials are), and every other model would reject it the same way.
 */
const FAILURE_CODES = {
  TIMEOUT: { retryable: true },
  UPSTREAM_ERROR: { retryable: true }, // HTTP 5xx
  RATE_LIMITED: { retryable: true }, // HTTP 429
  MALFORMED_OUTPUT: { retryable: true },
  NETWORK_ERROR: { retryable: true },
  MODEL_NOT_FOUND: { retryable: true }, // HTTP 404: this model id is wrong, the next may exist
  UNEXPECTED_ERROR: { retryable: true },
  BAD_REQUEST: { retryable: false }, // other HTTP 4xx
  UNAUTHORIZED: { retryable: false }, // HTTP 401 / 403
} as const;

export type EstimatorFailureCode = keyof typeof FAILURE_CODES;

export class EstimatorError extends Error {
  readonly code: EstimatorFailureCode;
  readonly httpStatus: number | undefined;

  constructor(code: EstimatorFailureCode, message: string, options?: { httpStatus?: number }) {
    super(message);
    this.name = 'EstimatorError';
    this.code = code;
    this.httpStatus = options?.httpStatus;
  }

  get retryable(): boolean {
    return FAILURE_CODES[this.code].retryable;
  }

  static fromHttpStatus(status: number, message: string): EstimatorError {
    return new EstimatorError(codeForHttpStatus(status), message, { httpStatus: status });
  }

  /** Wraps anything an estimator threw, so callers only ever handle `EstimatorError`. */
  static from(error: unknown): EstimatorError {
    if (error instanceof EstimatorError) return error;
    const message = error instanceof Error ? error.message : 'unknown estimator failure';
    return new EstimatorError('UNEXPECTED_ERROR', message);
  }
}

function codeForHttpStatus(status: number): EstimatorFailureCode {
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_ERROR';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  return 'BAD_REQUEST';
}

export interface FailedAttempt {
  provider: string;
  model: string;
  code: EstimatorFailureCode;
  message: string;
  durationMs: number;
}

/** Every estimator in the chain failed for a transient reason. The request may be retried later. */
export class EstimatorUnavailableError extends Error {
  readonly attempts: readonly FailedAttempt[];

  constructor(attempts: readonly FailedAttempt[]) {
    const summary = attempts.map((a) => `${a.provider}/${a.model}: ${a.code}`).join('; ');
    super(`No estimator produced a usable answer (${summary || 'no estimators configured'})`);
    this.name = 'EstimatorUnavailableError';
    this.attempts = attempts;
  }
}
