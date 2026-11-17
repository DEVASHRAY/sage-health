import { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { FallbackMealEstimator } from '../ai/FallbackMealEstimator';
import { GeminiMealEstimator } from '../ai/GeminiMealEstimator';
import type { AppDeps } from '../app';
import type { Config } from '../config/env';
import { PrismaAiRequestLog } from './PrismaAiRequestLog';
import { PrismaMealRepository } from './PrismaMealRepository';
import { PrismaProfileRepository } from './PrismaProfileRepository';
import { PrismaUserRepository } from './PrismaUserRepository';

/** Wires the real adapters: Postgres through Prisma, and the Gemini fallback chain. */
export function createProductionDeps(config: Config, logger: FastifyBaseLogger): AppDeps {
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });

  const estimator = new FallbackMealEstimator(
    config.geminiModels.map(
      (model) => new GeminiMealEstimator({ apiKey: config.geminiApiKey, model }),
    ),
    new PrismaAiRequestLog(prisma),
    {
      timeoutMs: config.estimateTimeoutMs,
      onLogFailure: (err) => {
        logger.warn({ err }, 'could not record AI request');
      },
    },
  );

  return {
    users: new PrismaUserRepository(prisma),
    profiles: new PrismaProfileRepository(prisma),
    meals: new PrismaMealRepository(prisma),
    estimator,
    logger,
    corsOrigins: config.corsOrigins,
    estimateRateLimitPerMinute: config.estimateRateLimitPerMinute,
    onClose: () => prisma.$disconnect(),
  };
}
