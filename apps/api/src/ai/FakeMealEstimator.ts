import type {
  EstimateInput,
  EstimateOptions,
  ModelMealEstimator,
  RawEstimate,
} from './mealEstimator';

type Behaviour = (input: EstimateInput, options: EstimateOptions) => Promise<RawEstimate>;

export const FAKE_PROVIDER = 'fake';

/**
 * Scriptable estimator for tests. Queue answers, failures or custom behaviour; each call
 * consumes the next one, and the last behaviour repeats once the queue is exhausted.
 */
export class FakeMealEstimator implements ModelMealEstimator {
  readonly provider = FAKE_PROVIDER;
  readonly model: string;
  readonly calls: EstimateInput[] = [];
  readonly #queue: Behaviour[] = [];

  constructor(model = 'fake-model') {
    this.model = model;
  }

  willReturn(estimate: Partial<Omit<RawEstimate, 'provider' | 'model'>> = {}): this {
    return this.willRun(() =>
      Promise.resolve({
        isMeal: true,
        readable: true,
        reasonIfNot: null,
        items: [],
        question: null,
        ...estimate,
        provider: this.provider,
        model: this.model,
      }),
    );
  }

  willFail(error: Error): this {
    return this.willRun(() => Promise.reject(error));
  }

  /** Never settles on its own; rejects only when aborted. Simulates a hung model. */
  willHang(): this {
    return this.willRun(
      (_input, options) =>
        new Promise<RawEstimate>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
  }

  willRun(behaviour: Behaviour): this {
    this.#queue.push(behaviour);
    return this;
  }

  estimate(input: EstimateInput, options: EstimateOptions = {}): Promise<RawEstimate> {
    this.calls.push(input);
    const behaviour = this.#queue.length > 1 ? this.#queue.shift() : this.#queue[0];
    if (!behaviour) return Promise.reject(new Error('FakeMealEstimator has no scripted behaviour'));
    return behaviour(input, options);
  }
}
