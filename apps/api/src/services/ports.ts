import type { MealItem, MealSlot, MealSource, Plan, Profile, Totals } from '@sage/shared';

/**
 * Ports owned by the service layer. Services depend only on these interfaces; the Prisma
 * implementations live in `infra/` and in-memory ones in the tests.
 */

export interface User {
  id: string;
  deviceId: string;
  createdAt: Date;
}

export interface UserRepository {
  findByDeviceId(deviceId: string): Promise<User | null>;
  /** Returns the user for the device, creating it on first sight. Safe under concurrent calls. */
  findOrCreateByDeviceId(deviceId: string): Promise<User>;
}

export interface ProfileRecord {
  profile: Profile;
  plan: Plan;
}

export interface ProfileRepository {
  findByUserId(userId: string): Promise<ProfileRecord | null>;
  save(userId: string, record: ProfileRecord): Promise<ProfileRecord>;
}

export interface MealRecord extends Totals {
  id: string;
  userId: string;
  slot: MealSlot;
  eatenAt: Date;
  source: MealSource;
  /** In the order the user saw them. */
  items: MealItem[];
  createdAt: Date;
}

export interface NewMeal extends Totals {
  slot: MealSlot;
  eatenAt: Date;
  source: MealSource;
  items: MealItem[];
}

export interface InstantRange {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

/** Every method is scoped to a user, so one user's meals are unreachable with another's id. */
export interface MealRepository {
  create(userId: string, meal: NewMeal): Promise<MealRecord>;
  /** Null when the meal does not exist or belongs to someone else. */
  replaceItems(
    userId: string,
    mealId: string,
    items: MealItem[],
    totals: Totals,
  ): Promise<MealRecord | null>;
  /** False when the meal does not exist or belongs to someone else. */
  delete(userId: string, mealId: string): Promise<boolean>;
  /** Meals eaten in the range, oldest first. */
  listEatenBetween(userId: string, range: InstantRange): Promise<MealRecord[]>;
  /** Just the timestamps of meals eaten in the range (for streaks). */
  listEatenAtBetween(userId: string, range: InstantRange): Promise<Date[]>;
  findLatestInSlotBefore(userId: string, slot: MealSlot, before: Date): Promise<MealRecord | null>;
}

export interface AiRequestEntry {
  userId: string | null;
  provider: string;
  model: string;
  source: 'photo' | 'text';
  durationMs: number;
  outcome: 'success' | 'failure';
  errorCode: string | null;
}

/** Audit trail of calls to AI models. Deliberately has no field for the image or the text. */
export interface AiRequestLog {
  record(entry: AiRequestEntry): Promise<void>;
}

export interface Clock {
  now(): Date;
}
