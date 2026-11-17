import { sumItems, type Meal, type UpdateMealRequest } from '@sage/shared';
import { NotFoundError } from './errors';
import { toMealDto } from './mealMapper';
import type { MealRepository } from './ports';

/** Replaces a meal's items (the user corrected a portion) and recomputes its totals. */
export class UpdateMeal {
  constructor(private readonly meals: MealRepository) {}

  async execute(userId: string, mealId: string, request: UpdateMealRequest): Promise<Meal> {
    const record = await this.meals.replaceItems(
      userId,
      mealId,
      request.items,
      sumItems(request.items),
    );
    if (!record) throw new NotFoundError('Meal');
    return toMealDto(record);
  }
}
