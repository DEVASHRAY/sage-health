import { DEVICE_ID_HEADER, deviceIdSchema } from '@sage/shared';
import type { FastifyRequest } from 'fastify';
import type { IdentifyUser } from '../services/IdentifyUser';
import { HttpError } from './httpErrors';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireUser`. Empty until then. */
    userId: string;
  }
}

/**
 * Reads and validates the `x-device-id` header. The id is the caller's only credential, so it
 * is treated like one: required, strictly formatted and never echoed back or logged.
 */
export function readDeviceId(request: FastifyRequest): string {
  const header = request.headers[DEVICE_ID_HEADER];
  if (header === undefined || header === '') {
    throw new HttpError(401, 'DEVICE_ID_REQUIRED', `The ${DEVICE_ID_HEADER} header is required.`);
  }
  const parsed = deviceIdSchema.safeParse(header);
  if (!parsed.success) {
    throw new HttpError(
      401,
      'DEVICE_ID_INVALID',
      `The ${DEVICE_ID_HEADER} header must be a UUID v4.`,
    );
  }
  return parsed.data;
}

/** `onRequest` hook: resolves the user before the body is even read. */
export function requireUser(identifyUser: IdentifyUser) {
  return async (request: FastifyRequest): Promise<void> => {
    const user = await identifyUser.execute(readDeviceId(request));
    request.userId = user.id;
  };
}
