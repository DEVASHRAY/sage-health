import type { FastifyInstance } from 'fastify';
import type { BootstrapUser } from '../services/BootstrapUser';
import { readDeviceId } from './deviceAuth';

export function registerUserRoutes(app: FastifyInstance, bootstrapUser: BootstrapUser): void {
  // The only /v1 route that works for a device the server has never seen.
  app.post('/users/bootstrap', (request) => bootstrapUser.execute(readDeviceId(request)));
}
