import { describe, expect, it } from 'vitest';
import { basalMetabolicRate, calculatePlan, type PlanInput } from '../src';

const asha: PlanInput = {
  sex: 'female',
  age: 34,
  weightKg: 82,
  heightCm: 165,
  goalWeightKg: 76,
  activity: 'sedentary',
};

describe('basalMetabolicRate', () => {
  it('applies Mifflin-St Jeor for women', () => {
    expect(basalMetabolicRate(asha)).toBeCloseTo(1520.25, 2);
  });

  it('applies Mifflin-St Jeor for men', () => {
    expect(basalMetabolicRate({ ...asha, sex: 'male' })).toBeCloseTo(1686.25, 2);
  });

  it('uses the midpoint constant when sex is unknown', () => {
    expect(basalMetabolicRate({ ...asha, sex: undefined })).toBeCloseTo(1603.25, 2);
  });
});

describe('calculatePlan', () => {
  it('computes the plan for a sedentary 34-year-old woman, 82 kg, 165 cm, goal 76 kg', () => {
    expect(calculatePlan(asha)).toEqual({
      maintenanceKcal: 1800,
      targetKcal: 1250,
      dailyDeficitKcal: 550,
      proteinTargetG: 115,
      weeksToGoal: 12,
      floorApplied: false,
    });
  });

  it('gives the same woman about 2,350 used and 1,800 target when moderately active', () => {
    expect(calculatePlan({ ...asha, activity: 'moderate' })).toMatchObject({
      maintenanceKcal: 2350,
      targetKcal: 1800,
      proteinTargetG: 115,
    });
  });

  it.each([
    ['female', 1200],
    ['male', 1500],
    [undefined, 1350],
  ] as const)('never sets the target below the floor (sex %s -> %i)', (sex, floor) => {
    const plan = calculatePlan({
      sex,
      age: 60,
      weightKg: 50,
      heightCm: 150,
      goalWeightKg: 45,
      activity: 'sedentary',
    });
    expect(plan.targetKcal).toBe(floor);
    expect(plan.floorApplied).toBe(true);
  });

  it('shrinks the deficit and lengthens the timeline when the floor applies', () => {
    const plan = calculatePlan({ ...asha, weightKg: 62, goalWeightKg: 58 });
    // BMR 1320.25 x 1.2 = 1584 -> maintenance 1,600; 1,034 wanted, floor 1,200 wins.
    expect(plan).toMatchObject({ maintenanceKcal: 1600, targetKcal: 1200, dailyDeficitKcal: 400 });
    expect(plan.weeksToGoal).toBe(11); // 4 kg at 0.364 kg/week
  });

  it('reports the goal as unreachable when the floor is above maintenance', () => {
    const plan = calculatePlan({
      sex: 'male',
      age: 90,
      weightKg: 45,
      heightCm: 150,
      goalWeightKg: 40,
      activity: 'sedentary',
    });
    expect(plan.maintenanceKcal).toBeLessThan(1500);
    expect(plan).toMatchObject({ targetKcal: 1500, dailyDeficitKcal: 0, weeksToGoal: null });
  });

  it('applies no deficit when already at the goal weight', () => {
    const plan = calculatePlan({ ...asha, goalWeightKg: 82 });
    expect(plan).toMatchObject({
      targetKcal: plan.maintenanceKcal,
      dailyDeficitKcal: 0,
      weeksToGoal: 0,
      floorApplied: false,
    });
  });

  it('applies no deficit when the goal is above the current weight', () => {
    const plan = calculatePlan({ ...asha, goalWeightKg: 90 });
    expect(plan).toMatchObject({ dailyDeficitKcal: 0, weeksToGoal: 0 });
    expect(plan.targetKcal).toBe(plan.maintenanceKcal);
  });

  it('rounds weeks up for a goal a fraction of a kilo away', () => {
    expect(calculatePlan({ ...asha, goalWeightKg: 81.9 }).weeksToGoal).toBe(1);
  });

  it('rounds calories to the nearest 50 and protein to the nearest 5', () => {
    const plan = calculatePlan({ ...asha, weightKg: 71.3, activity: 'light' });
    expect(plan.maintenanceKcal % 50).toBe(0);
    expect(plan.targetKcal % 50).toBe(0);
    expect(plan.proteinTargetG).toBe(100); // 71.3 x 1.4 = 99.8
    expect(plan.maintenanceKcal - plan.targetKcal).toBe(plan.dailyDeficitKcal);
  });

  it('raises maintenance with each activity level', () => {
    const levels = (['sedentary', 'light', 'moderate', 'active'] as const).map(
      (activity) => calculatePlan({ ...asha, activity }).maintenanceKcal,
    );
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(4);
  });
});
