import { NotFoundError } from './errors';
import type { MealRepository } from './ports';

export class DeleteMeal {
  constructor(private readonly meals: MealRepository) {}

  async execute(userId: string, mealId: string): Promise<void> {
    const deleted = await this.meals.delete(userId, mealId);
    if (!deleted) throw new NotFoundError('Meal');
  }
}
