import type { z } from 'zod';
import { HttpError } from './httpErrors';

export type RequestPart = 'body' | 'params' | 'query';

/** Parses one part of a request with a shared schema, or throws the standard 400. */
export function parseRequest<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  part: RequestPart,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new HttpError(
    400,
    'VALIDATION_ERROR',
    `Request ${part} is invalid.`,
    result.error.issues.map((issue) => ({
      in: part,
      path: issue.path.join('.'),
      message: issue.message,
    })),
  );
}
