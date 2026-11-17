import type { AiRequestLog } from '../services/ports';
import { EstimatorError, EstimatorUnavailableError, type FailedAttempt } from './errors';
import type {
  EstimateInput,
  MealEstimator,
  ModelMealEstimator,
  RawEstimate,
} from './mealEstimator';

export const DEFAULT_ATTEMPT_TIMEOUT_MS = 12_000;

export interface FallbackMealEstimatorOptions {
  /** Budget for each attempt, not for the whole chain. */
  timeoutMs?: number;
  /** Monotonic-enough millisecond clock; injected in tests. */
  now?: () => number;
  /** Told when writing the audit log fails. Logging must never fail an estimate. */
  onLogFailure?: (error: unknown) => void;
}

/**
 * Tries each estimator in order until one answers.
 *
 * - Each attempt gets its own timeout and is aborted when it expires.
 * - A transient failure (timeout, 5xx, 429, malformed output, network) moves on to the next.
 * - A failure caused by our own request (4xx) stops the chain: the next model would reject the
 *   same request, so the error is rethrown as-is.
 * - When every estimator has failed, throws `EstimatorUnavailableError` listing each attempt.
 * - Every attempt, successful or not, is written to the `AiRequestLog`.
 */
export class FallbackMealEstimator implements MealEstimator {
  readonly #estimators: readonly ModelMealEstimator[];
  readonly #log: AiRequestLog;
  readonly #timeoutMs: number;
  readonly #now: () => number;
  readonly #onLogFailure: (error: unknown) => void;

  constructor(
    estimators: readonly ModelMealEstimator[],
    log: AiRequestLog,
    options: FallbackMealEstimatorOptions = {},
  ) {
    if (estimators.length === 0)
      throw new Error('FallbackMealEstimator needs at least one estimator');
    this.#estimators = estimators;
    this.#log = log;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
    this.#now = options.now ?? (() => performance.now());
    this.#onLogFailure = options.onLogFailure ?? (() => undefined);
  }

  async estimate(input: EstimateInput): Promise<RawEstimate> {
    const failures: FailedAttempt[] = [];

    for (const estimator of this.#estimators) {
      const startedAt = this.#now();
      try {
        const estimate = await this.#attempt(estimator, input);
        await this.#record(input, estimator, startedAt, null);
        return estimate;
      } catch (thrown) {
        const error = EstimatorError.from(thrown);
        const durationMs = await this.#record(input, estimator, startedAt, error);
        if (!error.retryable) throw error;
        failures.push({
          provider: estimator.provider,
          model: estimator.model,
          code: error.code,
          message: error.message,
          durationMs,
        });
      }
    }

    throw new EstimatorUnavailableError(failures);
  }

  async #attempt(estimator: ModelMealEstimator, input: EstimateInput): Promise<RawEstimate> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        // Reject before aborting: the abort makes the estimator fail too, and the attempt must
        // be recorded as a timeout rather than as whatever error the abort surfaces.
        reject(new EstimatorError('TIMEOUT', `no answer within ${this.#timeoutMs} ms`));
        controller.abort();
      }, this.#timeoutMs);
    });
    try {
      // The race guarantees the deadline even if an estimator ignores the abort signal.
      return await Promise.race([
        estimator.estimate(input, { signal: controller.signal }),
        timedOut,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async #record(
    input: EstimateInput,
    estimator: ModelMealEstimator,
    startedAt: number,
    error: EstimatorError | null,
  ): Promise<number> {
    const durationMs = Math.max(0, Math.round(this.#now() - startedAt));
    try {
      await this.#log.record({
        userId: input.requesterId,
        provider: estimator.provider,
        model: estimator.model,
        source: input.source,
        durationMs,
        outcome: error ? 'failure' : 'success',
        errorCode: error?.code ?? null,
      });
    } catch (logError) {
      this.#onLogFailure(logError);
    }
    return durationMs;
  }
}
