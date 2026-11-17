import type { PrismaClient } from '@prisma/client';
import type { MealItem, MealSlot, Totals } from '@sage/shared';
import type { InstantRange, MealRecord, MealRepository, NewMeal } from '../services/ports';
import { toMealRecord } from './prismaMappers';

const WITH_ITEMS = { items: { orderBy: { position: 'asc' } } } as const;

const positioned = (items: readonly MealItem[]) =>
  items.map((item, position) => ({ ...item, position }));

export class PrismaMealRepository implements MealRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, meal: NewMeal): Promise<MealRecord> {
    const row = await this.prisma.meal.create({
      data: {
        userId,
        slot: meal.slot,
        eatenAt: meal.eatenAt,
        source: meal.source,
        totalKcal: meal.totalKcal,
        totalProteinG: meal.totalProteinG,
        items: { create: positioned(meal.items) },
      },
      include: WITH_ITEMS,
    });
    return toMealRecord(row);
  }

  async replaceItems(
    userId: string,
    mealId: string,
    items: MealItem[],
    totals: Totals,
  ): Promise<MealRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // The ownership check and the write are one statement: no window for a wrong-owner edit.
      const { count } = await tx.meal.updateMany({
        where: { id: mealId, userId },
        data: { totalKcal: totals.totalKcal, totalProteinG: totals.totalProteinG },
      });
      if (count === 0) return null;

      await tx.mealItem.deleteMany({ where: { mealId } });
      await tx.mealItem.createMany({
        data: positioned(items).map((item) => ({ ...item, mealId })),
      });
      const row = await tx.meal.findUniqueOrThrow({ where: { id: mealId }, include: WITH_ITEMS });
      return toMealRecord(row);
    });
  }

  async delete(userId: string, mealId: string): Promise<boolean> {
    const { count } = await this.prisma.meal.deleteMany({ where: { id: mealId, userId } });
    return count > 0;
  }

  async listEatenBetween(userId: string, range: InstantRange): Promise<MealRecord[]> {
    const rows = await this.prisma.meal.findMany({
      where: { userId, eatenAt: { gte: range.start, lt: range.end } },
      orderBy: [{ eatenAt: 'asc' }, { createdAt: 'asc' }],
      include: WITH_ITEMS,
    });
    return rows.map(toMealRecord);
  }

  async listEatenAtBetween(userId: string, range: InstantRange): Promise<Date[]> {
    const rows = await this.prisma.meal.findMany({
      where: { userId, eatenAt: { gte: range.start, lt: range.end } },
      select: { eatenAt: true },
    });
    return rows.map((row) => row.eatenAt);
  }

  async findLatestInSlotBefore(
    userId: string,
    slot: MealSlot,
    before: Date,
  ): Promise<MealRecord | null> {
    const row = await this.prisma.meal.findFirst({
      where: { userId, slot, eatenAt: { lt: before } },
      orderBy: [{ eatenAt: 'desc' }, { createdAt: 'desc' }],
      include: WITH_ITEMS,
    });
    return row ? toMealRecord(row) : null;
  }
}
