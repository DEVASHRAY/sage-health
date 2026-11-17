import type {
  Meal as MealRow,
  MealItem as MealItemRow,
  Profile as ProfileRow,
} from '@prisma/client';
import type { MealRecord, ProfileRecord } from '../services/ports';

export type MealRowWithItems = MealRow & { items: MealItemRow[] };

export function toMealRecord(row: MealRowWithItems): MealRecord {
  return {
    id: row.id,
    userId: row.userId,
    slot: row.slot,
    eatenAt: row.eatenAt,
    source: row.source,
    items: [...row.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        name: item.name,
        portion: item.portion,
        kcal: item.kcal,
        proteinG: item.proteinG,
        confidence: item.confidence,
      })),
    totalKcal: row.totalKcal,
    totalProteinG: row.totalProteinG,
    createdAt: row.createdAt,
  };
}

export function toProfileRecord(row: ProfileRow): ProfileRecord {
  return {
    profile: {
      name: row.name,
      ...(row.sex ? { sex: row.sex } : {}),
      age: row.age,
      weightKg: row.weightKg,
      heightCm: row.heightCm,
      goalWeightKg: row.goalWeightKg,
      activity: row.activity,
    },
    plan: {
      maintenanceKcal: row.maintenanceKcal,
      targetKcal: row.targetKcal,
      dailyDeficitKcal: row.dailyDeficitKcal,
      proteinTargetG: row.proteinTargetG,
      weeksToGoal: row.weeksToGoal,
      floorApplied: row.floorApplied,
    },
  };
}
