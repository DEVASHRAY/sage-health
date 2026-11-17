import { dayParamsSchema, dayQuerySchema } from '@sage/shared';
import type { FastifyInstance } from 'fastify';
import type { GetDay } from '../services/GetDay';
import { parseRequest } from './validation';

export function registerDayRoutes(app: FastifyInstance, getDay: GetDay): void {
  app.get('/days/:date', (request) => {
    const { date } = parseRequest(dayParamsSchema, request.params, 'params');
    const { tzOffsetMinutes } = parseRequest(dayQuerySchema, request.query, 'query');
    return getDay.execute(request.userId, { date, tzOffsetMinutes });
  });
}
