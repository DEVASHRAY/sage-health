import { z } from 'zod';

const DEFAULT_GEMINI_MODELS = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite';

const commaSeparated = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// connection string'),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODELS: z
    .string()
    .default(DEFAULT_GEMINI_MODELS)
    .transform(commaSeparated)
    .refine((models) => models.length > 0, 'must list at least one model id'),
  ESTIMATE_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(12_000),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('').transform(commaSeparated),
  ESTIMATE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(30),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  geminiApiKey: string;
  geminiModels: string[];
  estimateTimeoutMs: number;
  port: number;
  host: string;
  logLevel: string;
  corsOrigins: string[];
  estimateRateLimitPerMinute: number;
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Variables set to an empty string (`CORS_ORIGINS=`) count as unset so defaults apply. */
function withoutBlankValues(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value.trim() !== '') result[key] = value;
  }
  return result;
}

/**
 * Reads and validates the environment. Call once at startup and pass the result down; nothing
 * else in the codebase reads `process.env`. Error messages name variables, never their values.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(withoutBlankValues(env));
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const values = parsed.data;
  return {
    nodeEnv: values.NODE_ENV,
    databaseUrl: values.DATABASE_URL,
    geminiApiKey: values.GEMINI_API_KEY,
    geminiModels: values.GEMINI_MODELS,
    estimateTimeoutMs: values.ESTIMATE_TIMEOUT_MS,
    port: values.PORT,
    host: values.HOST,
    logLevel: values.LOG_LEVEL,
    corsOrigins: values.CORS_ORIGINS,
    estimateRateLimitPerMinute: values.ESTIMATE_RATE_LIMIT_PER_MINUTE,
  };
}
