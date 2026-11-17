import { randomUUID } from 'node:crypto';
import type { MealItem, MealSlot, Totals } from '@sage/shared';
import type {
  AiRequestEntry,
  AiRequestLog,
  Clock,
  InstantRange,
  MealRecord,
  MealRepository,
  NewMeal,
  ProfileRecord,
  ProfileRepository,
  User,
  UserRepository,
} from '../../src/services/ports';

export class InMemoryUserRepository implements UserRepository {
  readonly #byDevice = new Map<string, User>();

  findByDeviceId(deviceId: string): Promise<User | null> {
    return Promise.resolve(this.#byDevice.get(deviceId) ?? null);
  }

  findOrCreateByDeviceId(deviceId: string): Promise<User> {
    let user = this.#byDevice.get(deviceId);
    if (!user) {
      user = { id: randomUUID(), deviceId, createdAt: new Date() };
      this.#byDevice.set(deviceId, user);
    }
    return Promise.resolve(user);
  }

  get count(): number {
    return this.#byDevice.size;
  }
}

export class InMemoryProfileRepository implements ProfileRepository {
  readonly #byUser = new Map<string, ProfileRecord>();

  findByUserId(userId: string): Promise<ProfileRecord | null> {
    return Promise.resolve(this.#byUser.get(userId) ?? null);
  }

  save(userId: string, record: ProfileRecord): Promise<ProfileRecord> {
    this.#byUser.set(userId, record);
    return Promise.resolve(record);
  }
}

export class InMemoryMealRepository implements MealRepository {
  readonly #meals = new Map<string, MealRecord>();
  #sequence = 0;

  create(userId: string, meal: NewMeal): Promise<MealRecord> {
    // Distinct, increasing createdAt values keep ordering deterministic.
    const createdAt = new Date(Date.UTC(2020, 0, 1) + this.#sequence++);
    const record: MealRecord = { id: randomUUID(), userId, createdAt, ...meal };
    this.#meals.set(record.id, record);
    return Promise.resolve(record);
  }

  replaceItems(
    userId: string,
    mealId: string,
    items: MealItem[],
    totals: Totals,
  ): Promise<MealRecord | null> {
    const existing = this.#owned(userId, mealId);
    if (!existing) return Promise.resolve(null);
    const updated = { ...existing, items, ...totals };
    this.#meals.set(mealId, updated);
    return Promise.resolve(updated);
  }

  delete(userId: string, mealId: string): Promise<boolean> {
    if (!this.#owned(userId, mealId)) return Promise.resolve(false);
    this.#meals.delete(mealId);
    return Promise.resolve(true);
  }

  listEatenBetween(userId: string, range: InstantRange): Promise<MealRecord[]> {
    return Promise.resolve(
      this.#ofUser(userId)
        .filter((meal) => meal.eatenAt >= range.start && meal.eatenAt < range.end)
        .sort(byEatenAt),
    );
  }

  async listEatenAtBetween(userId: string, range: InstantRange): Promise<Date[]> {
    return (await this.listEatenBetween(userId, range)).map((meal) => meal.eatenAt);
  }

  findLatestInSlotBefore(userId: string, slot: MealSlot, before: Date): Promise<MealRecord | null> {
    const candidates = this.#ofUser(userId)
      .filter((meal) => meal.slot === slot && meal.eatenAt < before)
      .sort(byEatenAt);
    return Promise.resolve(candidates.at(-1) ?? null);
  }

  get all(): MealRecord[] {
    return [...this.#meals.values()];
  }

  #owned(userId: string, mealId: string): MealRecord | undefined {
    const meal = this.#meals.get(mealId);
    return meal?.userId === userId ? meal : undefined;
  }

  #ofUser(userId: string): MealRecord[] {
    return this.all.filter((meal) => meal.userId === userId);
  }
}

function byEatenAt(a: MealRecord, b: MealRecord): number {
  return a.eatenAt.getTime() - b.eatenAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime();
}

export class InMemoryAiRequestLog implements AiRequestLog {
  readonly entries: AiRequestEntry[] = [];

  record(entry: AiRequestEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export class FixedClock implements Clock {
  #now: Date;

  constructor(now: string | Date) {
    this.#now = new Date(now);
  }

  now(): Date {
    return new Date(this.#now);
  }

  set(now: string | Date): void {
    this.#now = new Date(now);
  }
}
