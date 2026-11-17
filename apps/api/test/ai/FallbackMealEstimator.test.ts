import { afterEach, describe, expect, it, vi } from 'vitest';
import { EstimatorError, EstimatorUnavailableError } from '../../src/ai/errors';
import { FakeMealEstimator } from '../../src/ai/FakeMealEstimator';
import { FallbackMealEstimator } from '../../src/ai/FallbackMealEstimator';
import type { EstimateInput } from '../../src/ai/mealEstimator';
import { roti } from '../support/fixtures';
import { InMemoryAiRequestLog } from '../support/inMemoryRepositories';

const input: EstimateInput = { requesterId: 'user-1', source: 'text', text: '2 rotis' };

function chain(options: { timeoutMs?: number } = {}) {
  const primary = new FakeMealEstimator('primary');
  const secondary = new FakeMealEstimator('secondary');
  const log = new InMemoryAiRequestLog();
  const estimator = new FallbackMealEstimator([primary, secondary], log, options);
  return { primary, secondary, log, estimator };
}

describe('FallbackMealEstimator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the first answer and does not call later estimators', async () => {
    const { primary, secondary, log, estimator } = chain();
    primary.willReturn({ items: [roti] });

    const result = await estimator.estimate(input);

    expect(result).toMatchObject({ model: 'primary', items: [roti] });
    expect(secondary.calls).toHaveLength(0);
    expect(log.entries).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        provider: 'fake',
        model: 'primary',
        source: 'text',
        outcome: 'success',
        errorCode: null,
      }),
    ]);
  });

  it('falls back after a 503 and reports which model answered', async () => {
    const { primary, secondary, log, estimator } = chain();
    primary.willFail(EstimatorError.fromHttpStatus(503, 'high demand'));
    secondary.willReturn({ items: [roti] });

    const result = await estimator.estimate(input);

    expect(result.model).toBe('secondary');
    expect(log.entries.map((e) => [e.model, e.outcome, e.errorCode])).toEqual([
      ['primary', 'failure', 'UPSTREAM_ERROR'],
      ['secondary', 'success', null],
    ]);
  });

  it.each([
    ['a 429', EstimatorError.fromHttpStatus(429, 'quota'), 'RATE_LIMITED'],
    ['malformed output', new EstimatorError('MALFORMED_OUTPUT', 'not json'), 'MALFORMED_OUTPUT'],
    ['a network failure', new EstimatorError('NETWORK_ERROR', 'reset'), 'NETWORK_ERROR'],
    ['an unknown model', EstimatorError.fromHttpStatus(404, 'no such model'), 'MODEL_NOT_FOUND'],
    ['an unexpected exception', new TypeError('boom'), 'UNEXPECTED_ERROR'],
  ])('falls back after %s', async (_label, failure, code) => {
    const { primary, secondary, log, estimator } = chain();
    primary.willFail(failure);
    secondary.willReturn();

    await expect(estimator.estimate(input)).resolves.toMatchObject({ model: 'secondary' });
    expect(log.entries[0]).toMatchObject({ outcome: 'failure', errorCode: code });
  });

  it('times out a hung attempt, aborts it and moves on', async () => {
    vi.useFakeTimers();
    const { primary, secondary, log, estimator } = chain({ timeoutMs: 12_000 });
    let aborted = false;
    primary.willRun(
      (_input, options) =>
        new Promise(() => {
          options.signal?.addEventListener('abort', () => (aborted = true));
        }),
    );
    secondary.willReturn();

    const pending = estimator.estimate(input);
    await vi.advanceTimersByTimeAsync(11_999);
    expect(secondary.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ model: 'secondary' });
    expect(aborted).toBe(true);
    expect(log.entries[0]).toMatchObject({ model: 'primary', errorCode: 'TIMEOUT' });
    expect(log.entries[0]?.durationMs).toBeGreaterThanOrEqual(12_000);
  });

  it('gives each attempt its own timeout budget', async () => {
    vi.useFakeTimers();
    const { primary, secondary, estimator } = chain({ timeoutMs: 1_000 });
    primary.willHang();
    secondary.willHang();

    const pending = estimator.estimate(input).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(2_000);

    const error = await pending;
    expect(error).toBeInstanceOf(EstimatorUnavailableError);
    expect((error as EstimatorUnavailableError).attempts.map((a) => a.code)).toEqual([
      'TIMEOUT',
      'TIMEOUT',
    ]);
  });

  it('does not leave a timer running after a fast answer', async () => {
    vi.useFakeTimers();
    const { primary, estimator } = chain();
    primary.willReturn();

    await estimator.estimate(input);

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [403, 'UNAUTHORIZED'],
  ])('does not try the next estimator after our own HTTP %i', async (status, code) => {
    const { primary, secondary, log, estimator } = chain();
    primary.willFail(EstimatorError.fromHttpStatus(status, 'rejected'));
    secondary.willReturn();

    await expect(estimator.estimate(input)).rejects.toMatchObject({
      name: 'EstimatorError',
      code,
      retryable: false,
    });
    expect(secondary.calls).toHaveLength(0);
    expect(log.entries).toHaveLength(1);
  });

  it('throws EstimatorUnavailableError listing every attempt when all fail', async () => {
    const { primary, secondary, log, estimator } = chain();
    primary.willFail(EstimatorError.fromHttpStatus(503, 'high demand'));
    secondary.willFail(new EstimatorError('MALFORMED_OUTPUT', 'model answer was not valid JSON'));

    const error = await estimator.estimate(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EstimatorUnavailableError);
    expect((error as EstimatorUnavailableError).attempts).toEqual([
      expect.objectContaining({ provider: 'fake', model: 'primary', code: 'UPSTREAM_ERROR' }),
      expect.objectContaining({ provider: 'fake', model: 'secondary', code: 'MALFORMED_OUTPUT' }),
    ]);
    expect(log.entries.map((e) => e.outcome)).toEqual(['failure', 'failure']);
  });

  it('still answers when the audit log is down, and reports the log failure', async () => {
    const primary = new FakeMealEstimator('primary').willReturn();
    const onLogFailure = vi.fn();
    const brokenLog = { record: () => Promise.reject(new Error('db down')) };
    const estimator = new FallbackMealEstimator([primary], brokenLog, { onLogFailure });

    await expect(estimator.estimate(input)).resolves.toMatchObject({ model: 'primary' });
    expect(onLogFailure).toHaveBeenCalledOnce();
  });

  it('never writes the image or the text to the audit log', async () => {
    const { primary, log, estimator } = chain();
    primary.willReturn();

    await estimator.estimate({
      requesterId: 'user-1',
      source: 'photo',
      image: { base64: 'SECRETIMAGEBYTES', mimeType: 'image/jpeg' },
      text: 'private note',
    });

    const serialised = JSON.stringify(log.entries);
    expect(serialised).not.toContain('SECRETIMAGEBYTES');
    expect(serialised).not.toContain('private note');
  });

  it('refuses to be built with no estimators', () => {
    expect(() => new FallbackMealEstimator([], new InMemoryAiRequestLog())).toThrow();
  });
});
