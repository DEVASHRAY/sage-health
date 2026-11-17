import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { calculatePlan, sumItems, type MealItem, type MealSlot } from '@sage/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeMealEstimator } from '../../src/ai/FakeMealEstimator';
import { buildApp } from '../../src/app';
import { PrismaAiRequestLog } from '../../src/infra/PrismaAiRequestLog';
import { PrismaMealRepository } from '../../src/infra/PrismaMealRepository';
import { PrismaProfileRepository } from '../../src/infra/PrismaProfileRepository';
import { PrismaUserRepository } from '../../src/infra/PrismaUserRepository';
import {
  ashaProfile,
  profileWithoutSex,
  chai,
  dal,
  DEVICE_A,
  DEVICE_B,
  roti,
} from '../support/fixtures';

/**
 * Runs the Prisma repositories against a real Postgres.
 *
 * Needs TEST_DATABASE_URL (see .env.example) pointing at a database this suite may wipe.
 * Without it the suite is skipped, loudly, so the rest of `npm test` still runs anywhere.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  console.warn('TEST_DATABASE_URL is not set: skipping the Postgres integration suite.');
}

describe.skipIf(!databaseUrl)('Prisma repositories (Postgres)', () => {
  let prisma: PrismaClient;
  let users: PrismaUserRepository;
  let profiles: PrismaProfileRepository;
  let meals: PrismaMealRepository;

  beforeAll(() => {
    const apiRoot = fileURLToPath(new URL('../..', import.meta.url));
    const prismaCli = fileURLToPath(
      new URL('../../../../node_modules/prisma/build/index.js', import.meta.url),
    );
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasourceUrl: databaseUrl as string });
    users = new PrismaUserRepository(prisma);
    profiles = new PrismaProfileRepository(prisma);
    meals = new PrismaMealRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "AiRequest", "MealItem", "Meal", "Profile", "User" CASCADE',
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const log = (userId: string, eatenAt: string, slot: MealSlot, items: MealItem[]) =>
    meals.create(userId, {
      slot,
      eatenAt: new Date(eatenAt),
      source: 'photo',
      items,
      ...sumItems(items),
    });

  describe('users', () => {
    it('creates a user once per device', async () => {
      const first = await users.findOrCreateByDeviceId(DEVICE_A);
      const again = await users.findOrCreateByDeviceId(DEVICE_A);
      const other = await users.findOrCreateByDeviceId(DEVICE_B);

      expect(again.id).toBe(first.id);
      expect(other.id).not.toBe(first.id);
      expect(await prisma.user.count()).toBe(2);
    });

    it('survives concurrent first requests from the same device', async () => {
      const created = await Promise.all(
        Array.from({ length: 10 }, () => users.findOrCreateByDeviceId(DEVICE_A)),
      );

      expect(new Set(created.map((user) => user.id)).size).toBe(1);
      expect(await prisma.user.count()).toBe(1);
    });

    it('finds by device id, or returns null', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);

      expect(await users.findByDeviceId(DEVICE_A)).toEqual(user);
      expect(await users.findByDeviceId(DEVICE_B)).toBeNull();
    });
  });

  describe('profiles', () => {
    it('round-trips profile and plan, and overwrites on the second save', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);
      const record = { profile: ashaProfile, plan: calculatePlan(ashaProfile) };

      expect(await profiles.findByUserId(user.id)).toBeNull();
      expect(await profiles.save(user.id, record)).toEqual(record);
      expect(await profiles.findByUserId(user.id)).toEqual(record);

      const withoutSex = profileWithoutSex();
      const changed = { ...withoutSex, weightKg: 80.5 };
      const updated = { profile: changed, plan: calculatePlan(changed) };
      await profiles.save(user.id, updated);

      expect(await profiles.findByUserId(user.id)).toEqual(updated);
      expect(await prisma.profile.count()).toBe(1);
    });

    it('stores a null weeksToGoal', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);
      const plan = { ...calculatePlan(ashaProfile), weeksToGoal: null };

      const saved = await profiles.save(user.id, { profile: ashaProfile, plan });

      expect(saved.plan.weeksToGoal).toBeNull();
    });
  });

  describe('meals', () => {
    it('stores items in order with totals and timestamps', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);

      const meal = await log(user.id, '2026-03-10T07:30:00.000Z', 'lunch', [roti, dal, chai]);

      expect(meal).toMatchObject({
        userId: user.id,
        slot: 'lunch',
        source: 'photo',
        items: [roti, dal, chai],
        totalKcal: 480,
        totalProteinG: 17.8,
      });
      expect(meal.eatenAt.toISOString()).toBe('2026-03-10T07:30:00.000Z');
      expect(meal.createdAt).toBeInstanceOf(Date);
    });

    it('replaces items atomically for the owner only', async () => {
      const owner = await users.findOrCreateByDeviceId(DEVICE_A);
      const intruder = await users.findOrCreateByDeviceId(DEVICE_B);
      const meal = await log(owner.id, '2026-03-10T07:30:00.000Z', 'lunch', [roti, dal]);

      const denied = await meals.replaceItems(intruder.id, meal.id, [chai], sumItems([chai]));
      const afterDenied = await meals.listEatenBetween(owner.id, {
        start: new Date('2026-03-10T00:00:00Z'),
        end: new Date('2026-03-11T00:00:00Z'),
      });
      const updated = await meals.replaceItems(
        owner.id,
        meal.id,
        [chai, roti],
        sumItems([chai, roti]),
      );

      expect(denied).toBeNull();
      expect(afterDenied[0]?.items).toEqual([roti, dal]);
      expect(updated).toMatchObject({ id: meal.id, items: [chai, roti], totalKcal: 300 });
      expect(await prisma.mealItem.count({ where: { mealId: meal.id } })).toBe(2);
    });

    it('returns null when replacing items of a meal that does not exist', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);

      expect(await meals.replaceItems(user.id, randomUUID(), [chai], sumItems([chai]))).toBeNull();
    });

    it('deletes for the owner only and cascades to the items', async () => {
      const owner = await users.findOrCreateByDeviceId(DEVICE_A);
      const intruder = await users.findOrCreateByDeviceId(DEVICE_B);
      const meal = await log(owner.id, '2026-03-10T07:30:00.000Z', 'lunch', [roti, dal]);

      expect(await meals.delete(intruder.id, meal.id)).toBe(false);
      expect(await prisma.meal.count()).toBe(1);
      expect(await meals.delete(owner.id, meal.id)).toBe(true);
      expect(await meals.delete(owner.id, meal.id)).toBe(false);
      expect(await prisma.mealItem.count()).toBe(0);
    });

    it('lists a half-open range, oldest first, for one user', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);
      const other = await users.findOrCreateByDeviceId(DEVICE_B);
      const range = {
        start: new Date('2026-03-09T18:30:00Z'),
        end: new Date('2026-03-10T18:30:00Z'),
      };
      await log(user.id, '2026-03-10T08:00:00.000Z', 'lunch', [dal]);
      await log(user.id, '2026-03-09T18:30:00.000Z', 'dinner', [roti]); // exactly at start: in
      await log(user.id, '2026-03-10T18:30:00.000Z', 'dinner', [chai]); // exactly at end: out
      await log(user.id, '2026-03-09T18:29:59.999Z', 'dinner', [chai]); // just before: out
      await log(other.id, '2026-03-10T08:00:00.000Z', 'lunch', [chai]);

      const listed = await meals.listEatenBetween(user.id, range);
      const instants = await meals.listEatenAtBetween(user.id, range);

      expect(listed.map((meal) => meal.items[0]?.name)).toEqual(['Roti', 'Dal tadka']);
      expect(instants.map((d) => d.toISOString()).sort()).toEqual([
        '2026-03-09T18:30:00.000Z',
        '2026-03-10T08:00:00.000Z',
      ]);
    });

    it('finds the latest meal in a slot strictly before an instant', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);
      const other = await users.findOrCreateByDeviceId(DEVICE_B);
      await log(user.id, '2026-03-07T03:00:00.000Z', 'breakfast', [chai]);
      await log(user.id, '2026-03-09T03:00:00.000Z', 'breakfast', [roti]);
      await log(user.id, '2026-03-09T08:00:00.000Z', 'lunch', [dal]);
      await log(user.id, '2026-03-10T03:00:00.000Z', 'breakfast', [dal]);
      await log(other.id, '2026-03-09T04:00:00.000Z', 'breakfast', [dal]);
      const before = new Date('2026-03-09T18:30:00Z');

      const latest = await meals.findLatestInSlotBefore(user.id, 'breakfast', before);

      expect(latest?.items).toEqual([roti]);
      expect(await meals.findLatestInSlotBefore(user.id, 'snack', before)).toBeNull();
    });

    it('removes meals and profile when the user is deleted', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);
      await profiles.save(user.id, { profile: ashaProfile, plan: calculatePlan(ashaProfile) });
      await log(user.id, '2026-03-10T07:30:00.000Z', 'lunch', [roti]);

      await prisma.user.delete({ where: { id: user.id } });

      expect(await prisma.meal.count()).toBe(0);
      expect(await prisma.mealItem.count()).toBe(0);
      expect(await prisma.profile.count()).toBe(0);
    });
  });

  describe('AI request log', () => {
    it('records attempts and keeps them, unlinked, after the user is deleted', async () => {
      const user = await users.findOrCreateByDeviceId(DEVICE_A);
      const aiLog = new PrismaAiRequestLog(prisma);

      await aiLog.record({
        userId: user.id,
        provider: 'gemini',
        model: 'gemini-test',
        source: 'photo',
        durationMs: 812,
        outcome: 'failure',
        errorCode: 'UPSTREAM_ERROR',
      });
      await prisma.user.delete({ where: { id: user.id } });

      const rows = await prisma.aiRequest.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: null,
        model: 'gemini-test',
        errorCode: 'UPSTREAM_ERROR',
      });
      expect(Object.keys(rows[0] ?? {})).not.toEqual(
        expect.arrayContaining(['image', 'text', 'prompt']),
      );
    });
  });

  describe('the app on real repositories', () => {
    it('runs bootstrap -> profile -> log -> day end to end', async () => {
      const app = await buildApp({
        users,
        profiles,
        meals,
        estimator: new FakeMealEstimator(),
        clock: { now: () => new Date('2026-03-10T07:30:00.000Z') },
      });
      const headers = { 'x-device-id': DEVICE_A };

      await app.inject({ method: 'POST', url: '/v1/users/bootstrap', headers });
      await app.inject({ method: 'PUT', url: '/v1/profile', headers, payload: ashaProfile });
      await app.inject({
        method: 'POST',
        url: '/v1/meals',
        headers,
        payload: {
          slot: 'lunch',
          eatenAt: '2026-03-09T13:00:00+05:30',
          source: 'text',
          items: [dal],
        },
      });
      const logged = await app.inject({
        method: 'POST',
        url: '/v1/meals',
        headers,
        payload: {
          slot: 'breakfast',
          eatenAt: '2026-03-10T08:00:00+05:30',
          source: 'photo',
          items: [roti, chai],
        },
      });
      const day = await app.inject({
        method: 'GET',
        url: '/v1/days/2026-03-10?tzOffsetMinutes=-330',
        headers,
      });
      await app.close();

      expect(logged.statusCode).toBe(201);
      expect(day.json()).toMatchObject({
        eatenKcal: 300,
        leftKcal: 950,
        proteinG: 8.7,
        streakDays: 2,
        suggestion: { slot: 'lunch', items: [dal], basedOn: 'yesterday' },
      });
    });
  });
});
