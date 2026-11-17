import type { ActivityLevel, Plan, Profile, Sex } from '../schemas/profile';
import { roundToNearest } from './rounding';

/**
 * How the daily plan is calculated.
 *
 * 1. Resting burn (BMR), Mifflin-St Jeor:
 *      BMR = 10 x weightKg + 6.25 x heightCm - 5 x age + s
 *    where s = +5 for men, -161 for women, and -78 (the midpoint) when sex is not given.
 * 2. Maintenance (TDEE) = BMR x activity multiplier:
 *      sedentary 1.2, light 1.375, moderate 1.55, active 1.725.
 * 3. Deficit for about 0.5 kg per week: body fat stores roughly 7,700 kcal per kg, so
 *      0.5 x 7,700 / 7 = 550 kcal per day.
 *    No deficit is applied when the goal weight is not below the current weight.
 * 4. Target = max(safe floor, TDEE - deficit). Floors: 1,200 kcal for women, 1,500 for men,
 *    1,350 when sex is unknown. When the floor wins, the deficit shrinks (possibly to zero) and
 *    reaching the goal takes longer; the plan says so through `floorApplied`.
 * 5. Protein = 1.4 g per kg of current weight.
 * 6. Weeks to goal = kg to lose / (actual deficit x 7 / 7,700), rounded up.
 *
 * Rounding: maintenance and target are each rounded to the nearest 50 kcal from the unrounded
 * TDEE (rounding the already-rounded figure would compound the error). The reported deficit is
 * the difference of the two rounded figures so the three numbers on screen always add up.
 * Protein is rounded to the nearest 5 g.
 *
 * Worked example: woman, 34, 82 kg, 165 cm, goal 76 kg.
 *   BMR = 820 + 1031.25 - 170 - 161 = 1520.25
 *   moderate:  TDEE 2356 -> maintenance 2,350, target 1,800, protein 115 g, 12 weeks
 *   sedentary: TDEE 1824 -> maintenance 1,800, target 1,250, protein 115 g, 12 weeks
 */

export const KCAL_PER_KG_BODY_FAT = 7700;
export const TARGET_LOSS_KG_PER_WEEK = 0.5;
export const STANDARD_DAILY_DEFICIT_KCAL = (TARGET_LOSS_KG_PER_WEEK * KCAL_PER_KG_BODY_FAT) / 7;
export const PROTEIN_G_PER_KG = 1.4;

const KCAL_STEP = 50;
const PROTEIN_STEP_G = 5;

export const ACTIVITY_MULTIPLIERS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

const BMR_SEX_CONSTANT: Readonly<Record<Sex | 'unknown', number>> = {
  male: 5,
  female: -161,
  unknown: -78,
};

export const SAFE_FLOOR_KCAL: Readonly<Record<Sex | 'unknown', number>> = {
  female: 1200,
  male: 1500,
  unknown: 1350,
};

export type PlanInput = Pick<
  Profile,
  'sex' | 'age' | 'weightKg' | 'heightCm' | 'goalWeightKg' | 'activity'
>;

export function basalMetabolicRate(
  input: Pick<PlanInput, 'sex' | 'age' | 'weightKg' | 'heightCm'>,
): number {
  const sexConstant = BMR_SEX_CONSTANT[input.sex ?? 'unknown'];
  return 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + sexConstant;
}

export function calculatePlan(input: PlanInput): Plan {
  const tdee = basalMetabolicRate(input) * ACTIVITY_MULTIPLIERS[input.activity];
  const floor = SAFE_FLOOR_KCAL[input.sex ?? 'unknown'];
  const kgToLose = Math.max(0, input.weightKg - input.goalWeightKg);

  const maintenanceKcal = roundToNearest(tdee, KCAL_STEP);
  const desiredTarget =
    kgToLose > 0 ? roundToNearest(tdee - STANDARD_DAILY_DEFICIT_KCAL, KCAL_STEP) : maintenanceKcal;
  const targetKcal = Math.max(floor, desiredTarget);
  const dailyDeficitKcal = Math.max(0, maintenanceKcal - targetKcal);

  return {
    maintenanceKcal,
    targetKcal,
    dailyDeficitKcal,
    proteinTargetG: roundToNearest(input.weightKg * PROTEIN_G_PER_KG, PROTEIN_STEP_G),
    weeksToGoal: weeksToGoal(kgToLose, dailyDeficitKcal),
    floorApplied: targetKcal > desiredTarget,
  };
}

function weeksToGoal(kgToLose: number, dailyDeficitKcal: number): number | null {
  if (kgToLose === 0) return 0;
  if (dailyDeficitKcal === 0) return null;
  const kgPerWeek = (dailyDeficitKcal * 7) / KCAL_PER_KG_BODY_FAT;
  return Math.ceil(kgToLose / kgPerWeek);
}
