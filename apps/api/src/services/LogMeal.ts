import { sumItems, type CreateMealRequest, type Meal } from '@sage/shared';
import { InvalidInputError } from './errors';
import { toMealDto } from './mealMapper';
import type { Clock, MealRepository } from './ports';

/** Slack for device clocks that run ahead and for time zones ahead of the server. */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/** Saves a meal the user has confirmed. Totals come from the items, never from the client. */
export class LogMeal {
  constructor(
    private readonly meals: MealRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, request: CreateMealRequest): Promise<Meal> {
    const eatenAt = new Date(request.eatenAt);
    if (eatenAt.getTime() - this.clock.now().getTime() > MAX_FUTURE_MS) {
      throw new InvalidInputError('"eatenAt" is in the future.');
    }
    const record = await this.meals.create(userId, {
      slot: request.slot,
      eatenAt,
      source: request.source,
      items: request.items,
      ...sumItems(request.items),
    });
    return toMealDto(record);
  }
}
