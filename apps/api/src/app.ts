import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { DEVICE_ID_HEADER } from '@sage/shared';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { MealEstimator } from './ai/mealEstimator';
import { requireUser } from './routes/deviceAuth';
import { registerDayRoutes } from './routes/dayRoutes';
import { toHttpError } from './routes/errorMapping';
import { registerHealthRoutes } from './routes/healthRoutes';
import { HttpError } from './routes/httpErrors';
import { registerMealRoutes } from './routes/mealRoutes';
import { registerProfileRoutes } from './routes/profileRoutes';
import { registerUserRoutes } from './routes/userRoutes';
import { BootstrapUser } from './services/BootstrapUser';
import { DeleteMeal } from './services/DeleteMeal';
import { EstimateMeal } from './services/EstimateMeal';
import { GetDay } from './services/GetDay';
import { IdentifyUser } from './services/IdentifyUser';
import { LogMeal } from './services/LogMeal';
import type { Clock, MealRepository, ProfileRepository, UserRepository } from './services/ports';
import { SaveProfile } from './services/SaveProfile';
import { UpdateMeal } from './services/UpdateMeal';

/** JSON bodies other than photos are tiny; anything bigger is a mistake or an attack. */
const DEFAULT_BODY_LIMIT_BYTES = 64 * 1024;
const DEFAULT_ESTIMATE_RATE_LIMIT_PER_MINUTE = 30;

export interface AppDeps {
  users: UserRepository;
  profiles: ProfileRepository;
  meals: MealRepository;
  estimator: MealEstimator;
  clock?: Clock;
  /** A pino-compatible logger. Omit for a silent app (tests). */
  logger?: FastifyBaseLogger;
  /** Browser origins allowed by CORS. Empty or omitted disables CORS entirely. */
  corsOrigins?: readonly string[];
  estimateRateLimitPerMinute?: number;
  /** Releases resources (database pool) when the app closes. */
  onClose?: () => Promise<void>;
}

/**
 * Composition root. Everything the app needs from the outside world arrives through `deps`,
 * so production wires Prisma and Gemini while tests wire in-memory fakes.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const clock = deps.clock ?? { now: () => new Date() };

  const app = Fastify({
    ...(deps.logger ? { loggerInstance: deps.logger } : { logger: false }),
    bodyLimit: DEFAULT_BODY_LIMIT_BYTES,
  });
  app.decorateRequest('userId', '');

  app.setErrorHandler((error, request, reply) => {
    const httpError = toHttpError(error);
    if (httpError.statusCode >= 500) {
      request.log.error({ err: error, code: httpError.code }, 'request failed');
    }
    if (error instanceof RateLimitedError) {
      void reply.header('retry-after', error.retryAfterSeconds);
    }
    return reply.code(httpError.statusCode).send(httpError.toBody());
  });
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(new HttpError(404, 'NOT_FOUND', `No route for ${request.method} here.`).toBody()),
  );

  await app.register(helmet);
  if (deps.corsOrigins && deps.corsOrigins.length > 0) {
    await app.register(cors, {
      origin: [...deps.corsOrigins],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['content-type', DEVICE_ID_HEADER],
    });
  }
  // Opt-in per route. Counters live in memory: use a shared store before running >1 instance.
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) =>
      new RateLimitedError(Math.ceil(context.ttl / 1000)),
  });

  if (deps.onClose) app.addHook('onClose', deps.onClose);

  registerHealthRoutes(app);

  const identifyUser = new IdentifyUser(deps.users);
  await app.register(
    (v1, _options, done) => {
      registerUserRoutes(v1, new BootstrapUser(deps.users, deps.profiles));

      void v1.register((authenticated, _opts, registered) => {
        authenticated.addHook('onRequest', requireUser(identifyUser));
        registerProfileRoutes(authenticated, new SaveProfile(deps.profiles));
        registerMealRoutes(
          authenticated,
          {
            estimateMeal: new EstimateMeal(deps.estimator),
            logMeal: new LogMeal(deps.meals, clock),
            updateMeal: new UpdateMeal(deps.meals),
            deleteMeal: new DeleteMeal(deps.meals),
          },
          {
            estimateRateLimitPerMinute:
              deps.estimateRateLimitPerMinute ?? DEFAULT_ESTIMATE_RATE_LIMIT_PER_MINUTE,
          },
        );
        registerDayRoutes(authenticated, new GetDay(deps.meals, deps.profiles, clock));
        registered();
      });
      done();
    },
    { prefix: '/v1' },
  );

  return app;
}

class RateLimitedError extends HttpError {
  constructor(readonly retryAfterSeconds: number) {
    super(429, 'RATE_LIMITED', `Too many requests. Try again in ${retryAfterSeconds} seconds.`);
  }
}
