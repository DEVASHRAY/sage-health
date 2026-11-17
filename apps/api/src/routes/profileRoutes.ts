import { profileSchema } from '@sage/shared';
import type { FastifyInstance } from 'fastify';
import type { SaveProfile } from '../services/SaveProfile';
import { parseRequest } from './validation';

export function registerProfileRoutes(app: FastifyInstance, saveProfile: SaveProfile): void {
  app.put('/profile', (request) =>
    saveProfile.execute(request.userId, parseRequest(profileSchema, request.body, 'body')),
  );
}
