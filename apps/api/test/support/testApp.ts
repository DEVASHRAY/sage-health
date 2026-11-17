import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { FakeMealEstimator } from '../../src/ai/FakeMealEstimator';
import type { MealEstimator } from '../../src/ai/mealEstimator';
import { buildApp, type AppDeps } from '../../src/app';
import {
  FixedClock,
  InMemoryMealRepository,
  InMemoryProfileRepository,
  InMemoryUserRepository,
} from './inMemoryRepositories';

export interface TestApp {
  app: FastifyInstance;
  users: InMemoryUserRepository;
  profiles: InMemoryProfileRepository;
  meals: InMemoryMealRepository;
  estimator: FakeMealEstimator;
  clock: FixedClock;
  /** Sends a request as the given device (or anonymously when `deviceId` is null). */
  request(
    deviceId: string | null,
    options: Omit<InjectOptions, 'headers'> & { headers?: Record<string, string> },
  ): Promise<LightMyRequestResponse>;
}

export interface TestAppOverrides extends Partial<
  Pick<AppDeps, 'estimateRateLimitPerMinute' | 'corsOrigins'>
> {
  estimator?: MealEstimator;
  now?: string;
}

/** The real app, wired with in-memory repositories and a scriptable estimator. */
export async function createTestApp(overrides: TestAppOverrides = {}): Promise<TestApp> {
  const users = new InMemoryUserRepository();
  const profiles = new InMemoryProfileRepository();
  const meals = new InMemoryMealRepository();
  const estimator = new FakeMealEstimator();
  const clock = new FixedClock(overrides.now ?? '2026-03-10T07:30:00.000Z');

  const app = await buildApp({
    users,
    profiles,
    meals,
    estimator: overrides.estimator ?? estimator,
    clock,
    estimateRateLimitPerMinute: overrides.estimateRateLimitPerMinute ?? 1000,
    ...(overrides.corsOrigins ? { corsOrigins: overrides.corsOrigins } : {}),
  });

  return {
    app,
    users,
    profiles,
    meals,
    estimator,
    clock,
    request: (deviceId, options) =>
      app.inject({
        ...options,
        headers: { ...(deviceId ? { 'x-device-id': deviceId } : {}), ...options.headers },
      }),
  };
}

/** Registers the device and returns its user id. */
export async function bootstrap(testApp: TestApp, deviceId: string): Promise<string> {
  const response = await testApp.request(deviceId, { method: 'POST', url: '/v1/users/bootstrap' });
  return response.json<{ userId: string }>().userId;
}
