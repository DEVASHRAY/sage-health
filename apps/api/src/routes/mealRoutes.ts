import {
  createMealSchema,
  DEVICE_ID_HEADER,
  estimateRequestSchema,
  MAX_IMAGE_BYTES,
  mealIdParamsSchema,
  updateMealSchema,
} from '@sage/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DeleteMeal } from '../services/DeleteMeal';
import type { EstimateMeal } from '../services/EstimateMeal';
import { ImageTooLargeError } from '../services/errors';
import type { LogMeal } from '../services/LogMeal';
import type { UpdateMeal } from '../services/UpdateMeal';
import { parseRequest } from './validation';

/**
 * Transport cap for the estimate route. It is set well above the 6 MB image limit (8 MB as
 * base64) so that a slightly oversized photo reaches the service and gets the precise
 * IMAGE_TOO_LARGE answer, while anything absurd is cut off by the server before buffering.
 */
const ESTIMATE_BODY_LIMIT_BYTES = 12 * 1024 * 1024;

export interface MealRouteServices {
  estimateMeal: EstimateMeal;
  logMeal: LogMeal;
  updateMeal: UpdateMeal;
  deleteMeal: DeleteMeal;
}

export interface MealRouteOptions {
  estimateRateLimitPerMinute: number;
}

export function registerMealRoutes(
  app: FastifyInstance,
  services: MealRouteServices,
  options: MealRouteOptions,
): void {
  app.post(
    '/meals/estimate',
    {
      bodyLimit: ESTIMATE_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: options.estimateRateLimitPerMinute,
          timeWindow: '1 minute',
          keyGenerator: rateLimitKey,
        },
      },
      errorHandler(error, request, reply) {
        // On this route an over-limit body can only mean an over-limit image.
        const tooLarge =
          error instanceof Error && 'code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE';
        const mapped = tooLarge
          ? new ImageTooLargeError(Number(request.headers['content-length'] ?? 0), MAX_IMAGE_BYTES)
          : error;
        app.errorHandler(mapped, request, reply);
      },
    },
    (request) =>
      services.estimateMeal.execute(
        request.userId,
        parseRequest(estimateRequestSchema, request.body, 'body'),
      ),
  );

  app.post('/meals', async (request, reply) => {
    const body = parseRequest(createMealSchema, request.body, 'body');
    const meal = await services.logMeal.execute(request.userId, body);
    return reply.code(201).send(meal);
  });

  app.patch('/meals/:id', (request) => {
    const { id } = parseRequest(mealIdParamsSchema, request.params, 'params');
    const body = parseRequest(updateMealSchema, request.body, 'body');
    return services.updateMeal.execute(request.userId, id, body);
  });

  app.delete('/meals/:id', async (request, reply) => {
    const { id } = parseRequest(mealIdParamsSchema, request.params, 'params');
    await services.deleteMeal.execute(request.userId, id);
    return reply.code(204).send();
  });
}

/** Limits are per device; requests without a usable id fall back to the client address. */
function rateLimitKey(request: FastifyRequest): string {
  const header = request.headers[DEVICE_ID_HEADER];
  return typeof header === 'string' && header !== ''
    ? `device:${header.toLowerCase()}`
    : request.ip;
}
