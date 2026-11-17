import { MAX_IMAGE_BYTES, type DayResponse, type ErrorResponse, type Meal } from '@sage/shared';
import type { LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EstimatorError, EstimatorUnavailableError } from '../../src/ai/errors';
import {
  ashaProfile,
  profileWithoutSex,
  chai,
  dal,
  DEVICE_A,
  DEVICE_B,
  roti,
  TINY_IMAGE_BASE64,
} from '../support/fixtures';
import { bootstrap, createTestApp, type TestApp } from '../support/testApp';

const IST = -330;
const errorCode = (response: LightMyRequestResponse) => response.json<ErrorResponse>().error.code;

let t: TestApp;

beforeEach(async () => {
  // 13:00 on 10 March in India: lunch time.
  t = await createTestApp({ now: '2026-03-10T07:30:00.000Z' });
});

afterEach(async () => {
  await t.app.close();
});

async function logMeal(deviceId: string, overrides: Record<string, unknown> = {}): Promise<Meal> {
  const response = await t.request(deviceId, {
    method: 'POST',
    url: '/v1/meals',
    payload: {
      slot: 'lunch',
      eatenAt: '2026-03-10T13:00:00+05:30',
      source: 'photo',
      items: [roti, dal],
      ...overrides,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<Meal>();
}

describe('GET /health', () => {
  it('answers without a device id', async () => {
    const response = await t.request(null, { method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('sends security headers', async () => {
    const response = await t.request(null, { method: 'GET', url: '/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['strict-transport-security']).toBeDefined();
  });
});

describe('device identity', () => {
  const protectedRoutes = [
    ['POST', '/v1/users/bootstrap'],
    ['PUT', '/v1/profile'],
    ['POST', '/v1/meals/estimate'],
    ['POST', '/v1/meals'],
    ['PATCH', '/v1/meals/3f0c2a52-58a1-4c44-9d0e-7a8f6b1c2d3e'],
    ['DELETE', '/v1/meals/3f0c2a52-58a1-4c44-9d0e-7a8f6b1c2d3e'],
    ['GET', '/v1/days/2026-03-10'],
  ] as const;

  it.each(protectedRoutes)('%s %s is 401 without a device id', async (method, url) => {
    const response = await t.request(null, { method, url });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('DEVICE_ID_REQUIRED');
  });

  it.each(['not-a-uuid', '7b0e5c7e-9d55-1b0a-8f0e-2d6c1e0a9f11', '', ' '])(
    'rejects the malformed device id "%s"',
    async (deviceId) => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/v1/users/bootstrap',
        headers: { 'x-device-id': deviceId },
      });

      expect(response.statusCode).toBe(401);
      expect(['DEVICE_ID_INVALID', 'DEVICE_ID_REQUIRED']).toContain(errorCode(response));
    },
  );

  it('is 401 DEVICE_NOT_REGISTERED for a valid id that never bootstrapped', async () => {
    const response = await t.request(DEVICE_A, { method: 'GET', url: '/v1/days/2026-03-10' });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe('DEVICE_NOT_REGISTERED');
    expect(t.users.count).toBe(0);
  });

  it('treats device ids case-insensitively', async () => {
    const userId = await bootstrap(t, DEVICE_A);

    expect(await bootstrap(t, DEVICE_A.toUpperCase())).toBe(userId);
  });
});

describe('POST /v1/users/bootstrap', () => {
  it('creates the user once and returns the same user afterwards', async () => {
    const first = await t.request(DEVICE_A, { method: 'POST', url: '/v1/users/bootstrap' });
    const second = await t.request(DEVICE_A, { method: 'POST', url: '/v1/users/bootstrap' });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      userId: expect.any(String) as string,
      profile: null,
      plan: null,
    });
    expect(second.json()).toEqual(first.json());
  });
});

describe('PUT /v1/profile', () => {
  beforeEach(() => bootstrap(t, DEVICE_A));

  it('saves the profile and returns the computed plan, which bootstrap then returns', async () => {
    const response = await t.request(DEVICE_A, {
      method: 'PUT',
      url: '/v1/profile',
      payload: ashaProfile,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: ashaProfile,
      plan: {
        maintenanceKcal: 1800,
        targetKcal: 1250,
        dailyDeficitKcal: 550,
        proteinTargetG: 115,
        weeksToGoal: 12,
        floorApplied: false,
      },
    });
    const again = await t.request(DEVICE_A, { method: 'POST', url: '/v1/users/bootstrap' });
    expect(again.json()).toMatchObject(response.json<object>());
  });

  it('accepts a profile without sex and uses the neutral floor', async () => {
    const withoutSex = profileWithoutSex();
    const response = await t.request(DEVICE_A, {
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...withoutSex, weightKg: 50, goalWeightKg: 45, heightCm: 150 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ plan: { targetKcal: number } }>().plan.targetKcal).toBe(1350);
  });

  it.each([
    ['a missing field', { ...ashaProfile, age: undefined }, 'age'],
    ['a string where a number belongs', { ...ashaProfile, weightKg: '82' }, 'weightKg'],
    ['an unknown activity', { ...ashaProfile, activity: 'couch' }, 'activity'],
    ['an unknown sex', { ...ashaProfile, sex: 'other' }, 'sex'],
    ['an empty name', { ...ashaProfile, name: '   ' }, 'name'],
    ['an impossible height', { ...ashaProfile, heightCm: 1.65 }, 'heightCm'],
  ])('is 400 for %s and names the field', async (_label, payload, field) => {
    const response = await t.request(DEVICE_A, { method: 'PUT', url: '/v1/profile', payload });

    expect(response.statusCode).toBe(400);
    const { error } = response.json<ErrorResponse>();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ in: 'body', path: field })]),
    );
  });

  it('is 400 for a body that is not JSON', async () => {
    const response = await t.request(DEVICE_A, {
      method: 'PUT',
      url: '/v1/profile',
      payload: '{"name": ',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });

  it('is 413 for a body far beyond what a profile needs', async () => {
    const response = await t.request(DEVICE_A, {
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...ashaProfile, name: 'x'.repeat(100_000) },
    });

    expect(response.statusCode).toBe(413);
    expect(errorCode(response)).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('POST /v1/meals/estimate', () => {
  beforeEach(() => bootstrap(t, DEVICE_A));

  const estimate = (payload: Record<string, unknown>) =>
    t.request(DEVICE_A, { method: 'POST', url: '/v1/meals/estimate', payload });

  it('returns the estimate with server-computed totals and saves nothing', async () => {
    t.estimator.willReturn({ items: [roti, dal], question: 'Was ghee added to the rotis?' });

    const response = await estimate({
      source: 'photo',
      imageBase64: TINY_IMAGE_BASE64,
      slot: 'lunch',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      isMeal: true,
      readable: true,
      reasonIfNot: null,
      items: [roti, dal],
      totalKcal: 390,
      totalProteinG: 15.3,
      question: 'Was ghee added to the rotis?',
      provider: 'fake',
      model: 'fake-model',
    });
    expect(t.meals.all).toHaveLength(0);
  });

  it('estimates from text', async () => {
    t.estimator.willReturn({ items: [chai] });

    const response = await estimate({ source: 'text', text: 'a cup of chai' });

    expect(response.statusCode).toBe(200);
    expect(t.estimator.calls[0]).toMatchObject({ source: 'text', text: 'a cup of chai' });
  });

  it('is 422 when both the image and the text are missing', async () => {
    const response = await estimate({ source: 'photo' });

    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe('ESTIMATE_INPUT_MISSING');
    expect(t.estimator.calls).toHaveLength(0);
  });

  it('is 422 when text is only whitespace', async () => {
    const response = await estimate({ source: 'text', text: '   ' });

    expect(response.statusCode).toBe(422);
  });

  it.each([
    ['an unknown source', { source: 'voice', text: 'dal' }],
    [
      'an unsupported mime type',
      { source: 'photo', imageBase64: TINY_IMAGE_BASE64, mimeType: 'image/gif' },
    ],
    [
      'a data: URL instead of base64',
      { source: 'photo', imageBase64: 'data:image/png;base64,AAAA' },
    ],
    ['an unknown slot', { source: 'text', text: 'dal', slot: 'brunch' }],
    ['text that is too long', { source: 'text', text: 'x'.repeat(1001) }],
    ['a missing body', undefined],
  ])('is 400 for %s', async (_label, payload) => {
    const response = await t.request(DEVICE_A, {
      method: 'POST',
      url: '/v1/meals/estimate',
      ...(payload ? { payload } : {}),
    });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });

  it('is 413 IMAGE_TOO_LARGE for an image one byte over 6 MB, before any AI call', async () => {
    const response = await estimate({
      source: 'photo',
      imageBase64: Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64'),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json<ErrorResponse>().error).toMatchObject({
      code: 'IMAGE_TOO_LARGE',
      details: { limitBytes: MAX_IMAGE_BYTES, actualBytes: MAX_IMAGE_BYTES + 1 },
    });
    expect(t.estimator.calls).toHaveLength(0);
  });

  it('accepts an image of exactly 6 MB', async () => {
    t.estimator.willReturn({ items: [roti] });

    const response = await estimate({
      source: 'photo',
      imageBase64: Buffer.alloc(MAX_IMAGE_BYTES).toString('base64'),
    });

    expect(response.statusCode).toBe(200);
  });

  it('is 413 IMAGE_TOO_LARGE when the body exceeds the transport cap', async () => {
    const response = await estimate({
      source: 'photo',
      imageBase64: Buffer.alloc(10 * 1024 * 1024).toString('base64'),
    });

    expect(response.statusCode).toBe(413);
    expect(errorCode(response)).toBe('IMAGE_TOO_LARGE');
  });

  it('is 503 ESTIMATOR_UNAVAILABLE when every model fails, without leaking error text', async () => {
    t.estimator.willFail(
      new EstimatorUnavailableError([
        {
          provider: 'gemini',
          model: 'a',
          code: 'UPSTREAM_ERROR',
          message: 'secret upstream text',
          durationMs: 5,
        },
        { provider: 'gemini', model: 'b', code: 'TIMEOUT', message: 'slow', durationMs: 12000 },
      ]),
    );

    const response = await estimate({ source: 'text', text: 'dal' });

    expect(response.statusCode).toBe(503);
    expect(response.json<ErrorResponse>().error).toMatchObject({
      code: 'ESTIMATOR_UNAVAILABLE',
      details: {
        attempts: [
          { provider: 'gemini', model: 'a', code: 'UPSTREAM_ERROR' },
          { provider: 'gemini', model: 'b', code: 'TIMEOUT' },
        ],
      },
    });
    expect(response.body).not.toContain('secret upstream text');
  });

  it('is 502 ESTIMATOR_REJECTED when the provider rejects our request', async () => {
    t.estimator.willFail(EstimatorError.fromHttpStatus(400, 'invalid argument: internal detail'));

    const response = await estimate({ source: 'text', text: 'dal' });

    expect(response.statusCode).toBe(502);
    expect(errorCode(response)).toBe('ESTIMATOR_REJECTED');
    expect(response.body).not.toContain('internal detail');
  });

  it('is 500 with a generic message for an unexpected failure', async () => {
    t.estimator.willFail(new Error('database password is hunter2'));

    const response = await estimate({ source: 'text', text: 'dal' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    });
  });

  it('rate-limits per device, leaving other devices unaffected', async () => {
    await t.app.close();
    t = await createTestApp({ estimateRateLimitPerMinute: 2 });
    await bootstrap(t, DEVICE_A);
    await bootstrap(t, DEVICE_B);
    t.estimator.willReturn({ items: [roti] });
    const ask = (deviceId: string) =>
      t.request(deviceId, {
        method: 'POST',
        url: '/v1/meals/estimate',
        payload: { source: 'text', text: 'roti' },
      });

    const statuses = [await ask(DEVICE_A), await ask(DEVICE_A), await ask(DEVICE_A)];
    const otherDevice = await ask(DEVICE_B);

    expect(statuses.map((r) => r.statusCode)).toEqual([200, 200, 429]);
    expect(statuses[2]?.json<ErrorResponse>().error.code).toBe('RATE_LIMITED');
    expect(statuses[2]?.headers['retry-after']).toBeDefined();
    expect(otherDevice.statusCode).toBe(200);
  });
});

describe('meals', () => {
  beforeEach(async () => {
    await bootstrap(t, DEVICE_A);
    await bootstrap(t, DEVICE_B);
  });

  it('POST saves a meal with id and server-computed totals', async () => {
    const meal = await logMeal(DEVICE_A);

    expect(meal).toEqual({
      id: expect.any(String) as string,
      slot: 'lunch',
      eatenAt: '2026-03-10T07:30:00.000Z',
      source: 'photo',
      items: [roti, dal],
      totalKcal: 390,
      totalProteinG: 15.3,
      createdAt: expect.any(String) as string,
    });
  });

  it('POST ignores client-supplied totals', async () => {
    const meal = await logMeal(DEVICE_A, { totalKcal: 5, totalProteinG: 500 });

    expect(meal).toMatchObject({ totalKcal: 390, totalProteinG: 15.3 });
  });

  it.each([
    ['no items', { items: [] }],
    ['an item without a name', { items: [{ ...roti, name: '' }] }],
    ['negative calories', { items: [{ ...roti, kcal: -10 }] }],
    ['fractional calories', { items: [{ ...roti, kcal: 10.5 }] }],
    ['an unknown confidence', { items: [{ ...roti, confidence: 'sure' }] }],
    ['too many items', { items: Array.from({ length: 31 }, () => roti) }],
    ['an unknown slot', { slot: 'brunch' }],
    ['an unknown source', { source: 'barcode' }],
    ['a date without a time', { eatenAt: '2026-03-10' }],
    ['a timestamp without an offset', { eatenAt: '2026-03-10T13:00:00' }],
    ['a timestamp far in the future', { eatenAt: '2027-01-01T00:00:00Z' }],
  ])('POST is 400 for %s', async (_label, overrides) => {
    const response = await t.request(DEVICE_A, {
      method: 'POST',
      url: '/v1/meals',
      payload: {
        slot: 'lunch',
        eatenAt: '2026-03-10T13:00:00+05:30',
        source: 'photo',
        items: [roti],
        ...overrides,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
    expect(t.meals.all).toHaveLength(0);
  });

  it('PATCH replaces items and recomputes totals', async () => {
    const meal = await logMeal(DEVICE_A);

    const response = await t.request(DEVICE_A, {
      method: 'PATCH',
      url: `/v1/meals/${meal.id}`,
      payload: { items: [{ ...roti, portion: '1 roti', kcal: 105, proteinG: 3.1 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: meal.id, totalKcal: 105, totalProteinG: 3.1 });
  });

  it('PATCH is 400 for an id that is not a UUID and for an empty item list', async () => {
    const meal = await logMeal(DEVICE_A);

    const badId = await t.request(DEVICE_A, {
      method: 'PATCH',
      url: '/v1/meals/123',
      payload: { items: [roti] },
    });
    const noItems = await t.request(DEVICE_A, {
      method: 'PATCH',
      url: `/v1/meals/${meal.id}`,
      payload: { items: [] },
    });

    expect(badId.statusCode).toBe(400);
    expect(noItems.statusCode).toBe(400);
  });

  it('DELETE removes the meal and a second DELETE is 404', async () => {
    const meal = await logMeal(DEVICE_A);

    const first = await t.request(DEVICE_A, { method: 'DELETE', url: `/v1/meals/${meal.id}` });
    const second = await t.request(DEVICE_A, { method: 'DELETE', url: `/v1/meals/${meal.id}` });

    expect(first.statusCode).toBe(204);
    expect(first.body).toBe('');
    expect(second.statusCode).toBe(404);
    expect(errorCode(second)).toBe('NOT_FOUND');
  });

  describe('ownership', () => {
    it('user B cannot edit user A`s meal: 404 and the meal is unchanged', async () => {
      const meal = await logMeal(DEVICE_A);

      const response = await t.request(DEVICE_B, {
        method: 'PATCH',
        url: `/v1/meals/${meal.id}`,
        payload: { items: [chai] },
      });

      expect(response.statusCode).toBe(404);
      expect(errorCode(response)).toBe('NOT_FOUND');
      expect(t.meals.all[0]).toMatchObject({ items: [roti, dal], totalKcal: 390 });
    });

    it('user B cannot delete user A`s meal: 404 and the meal survives', async () => {
      const meal = await logMeal(DEVICE_A);

      const response = await t.request(DEVICE_B, { method: 'DELETE', url: `/v1/meals/${meal.id}` });

      expect(response.statusCode).toBe(404);
      expect(t.meals.all).toHaveLength(1);
    });

    it('user B cannot read user A`s meals through the day view', async () => {
      await logMeal(DEVICE_A);

      const response = await t.request(DEVICE_B, {
        method: 'GET',
        url: `/v1/days/2026-03-10?tzOffsetMinutes=${IST}`,
      });

      expect(response.json<DayResponse>()).toMatchObject({
        meals: [],
        eatenKcal: 0,
        streakDays: 0,
      });
    });

    it('answers a foreign meal exactly like a meal that does not exist', async () => {
      const meal = await logMeal(DEVICE_A);
      const patch = (id: string) =>
        t.request(DEVICE_B, {
          method: 'PATCH',
          url: `/v1/meals/${id}`,
          payload: { items: [chai] },
        });

      const foreign = await patch(meal.id);
      const missing = await patch('3f0c2a52-58a1-4c44-9d0e-7a8f6b1c2d3e');

      expect(foreign.statusCode).toBe(missing.statusCode);
      expect(foreign.json()).toEqual(missing.json());
    });
  });
});

describe('GET /v1/days/:date', () => {
  beforeEach(async () => {
    await bootstrap(t, DEVICE_A);
    await t.request(DEVICE_A, { method: 'PUT', url: '/v1/profile', payload: ashaProfile });
  });

  const getDay = (date: string, query = `?tzOffsetMinutes=${IST}`) =>
    t.request(DEVICE_A, { method: 'GET', url: `/v1/days/${date}${query}` });

  it('returns target, eaten, left and protein for the day', async () => {
    await logMeal(DEVICE_A, {
      slot: 'breakfast',
      eatenAt: '2026-03-10T08:15:00+05:30',
      items: [chai],
    });
    await logMeal(DEVICE_A);

    const response = await getDay('2026-03-10');

    expect(response.statusCode).toBe(200);
    const day = response.json<DayResponse>();
    expect(day).toMatchObject({
      date: '2026-03-10',
      plan: { targetKcal: 1250, proteinTargetG: 115 },
      eatenKcal: 480,
      leftKcal: 770,
      proteinG: 17.8,
      streakDays: 1,
      suggestion: null,
    });
    expect(day.meals.map((meal) => [meal.slot, meal.totalKcal])).toEqual([
      ['breakfast', 90],
      ['lunch', 390],
    ]);
  });

  it('reflects edits and deletions in the totals', async () => {
    const lunch = await logMeal(DEVICE_A);
    const snack = await logMeal(DEVICE_A, { slot: 'snack', items: [chai] });
    await t.request(DEVICE_A, {
      method: 'PATCH',
      url: `/v1/meals/${lunch.id}`,
      payload: { items: [roti] },
    });
    await t.request(DEVICE_A, { method: 'DELETE', url: `/v1/meals/${snack.id}` });

    const day = (await getDay('2026-03-10')).json<DayResponse>();

    expect(day).toMatchObject({ eatenKcal: 210, leftKcal: 1040, proteinG: 6.2 });
    expect(day.meals).toHaveLength(1);
  });

  it('places a late-night meal on the device`s local day', async () => {
    // 23:30 on the 10th in India is 18:00 UTC; 00:30 on the 11th in India is 19:00 UTC on the 10th.
    await logMeal(DEVICE_A, { slot: 'dinner', eatenAt: '2026-03-10T23:30:00+05:30', items: [dal] });
    await logMeal(DEVICE_A, {
      slot: 'dinner',
      eatenAt: '2026-03-11T00:30:00+05:30',
      items: [roti],
    });

    const india10 = (await getDay('2026-03-10')).json<DayResponse>();
    const india11 = (await getDay('2026-03-11')).json<DayResponse>();
    const utc10 = (await getDay('2026-03-10', '?tzOffsetMinutes=0')).json<DayResponse>();

    expect(india10.meals.map((m) => m.items[0]?.name)).toEqual(['Dal tadka']);
    expect(india11.meals.map((m) => m.items[0]?.name)).toEqual(['Roti']);
    expect(utc10.meals).toHaveLength(2);
  });

  it('counts the streak across local days and suggests yesterday`s lunch', async () => {
    await logMeal(DEVICE_A, { eatenAt: '2026-03-08T13:00:00+05:30', items: [chai] });
    await logMeal(DEVICE_A, { eatenAt: '2026-03-09T13:10:00+05:30', items: [roti, dal] });
    await logMeal(DEVICE_A, {
      slot: 'breakfast',
      eatenAt: '2026-03-10T08:00:00+05:30',
      items: [chai],
    });

    const day = (await getDay('2026-03-10')).json<DayResponse>();

    expect(day.streakDays).toBe(3);
    expect(day.suggestion).toEqual({
      slot: 'lunch',
      items: [roti, dal],
      totalKcal: 390,
      basedOn: 'yesterday',
    });
  });

  it('stops suggesting once the slot is logged today', async () => {
    await logMeal(DEVICE_A, { eatenAt: '2026-03-09T13:10:00+05:30' });
    await logMeal(DEVICE_A);

    expect((await getDay('2026-03-10')).json<DayResponse>().suggestion).toBeNull();
  });

  it('uses the device`s offset to decide the current slot', async () => {
    // Server clock is 07:30 UTC: lunch in India, but 02:30 (dinner slot) in New York.
    await logMeal(DEVICE_A, { slot: 'lunch', eatenAt: '2026-03-09T13:00:00+05:30', items: [dal] });
    await logMeal(DEVICE_A, {
      slot: 'dinner',
      eatenAt: '2026-03-09T21:00:00-05:00',
      items: [roti],
    });

    const india = (await getDay('2026-03-10')).json<DayResponse>();
    const newYork = (await getDay('2026-03-10', '?tzOffsetMinutes=300')).json<DayResponse>();

    expect(india.suggestion).toMatchObject({ slot: 'lunch', items: [dal] });
    expect(newYork.suggestion).toMatchObject({ slot: 'dinner', items: [roti] });
  });

  it('defaults to UTC when no offset is given', async () => {
    await logMeal(DEVICE_A, { eatenAt: '2026-03-10T23:59:59Z', items: [chai] });

    expect((await getDay('2026-03-10', '')).json<DayResponse>().meals).toHaveLength(1);
    expect((await getDay('2026-03-11', '')).json<DayResponse>().meals).toHaveLength(0);
  });

  it.each([
    ['a malformed date', '/v1/days/10-03-2026'],
    ['a date that does not exist', '/v1/days/2026-02-30'],
    ['a non-numeric offset', '/v1/days/2026-03-10?tzOffsetMinutes=IST'],
    ['an offset out of range', '/v1/days/2026-03-10?tzOffsetMinutes=1000'],
    ['a fractional offset', '/v1/days/2026-03-10?tzOffsetMinutes=5.5'],
  ])('is 400 for %s', async (_label, url) => {
    const response = await t.request(DEVICE_A, { method: 'GET', url });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });
});

describe('unknown routes and CORS', () => {
  it('is 404 in the standard error shape', async () => {
    const response = await t.request(DEVICE_A, { method: 'GET', url: '/v1/nope' });

    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('NOT_FOUND');
  });

  it('sends no CORS headers unless origins are configured', async () => {
    const response = await t.request(null, {
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows only the configured origins', async () => {
    await t.app.close();
    t = await createTestApp({ corsOrigins: ['https://app.example'] });
    const from = (origin: string) =>
      t.request(null, { method: 'GET', url: '/health', headers: { origin } });

    expect((await from('https://app.example')).headers['access-control-allow-origin']).toBe(
      'https://app.example',
    );
    expect(
      (await from('https://evil.example')).headers['access-control-allow-origin'],
    ).toBeUndefined();
  });
});
