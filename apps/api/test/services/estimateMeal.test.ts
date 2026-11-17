import { MAX_IMAGE_BYTES } from '@sage/shared';
import { describe, expect, it } from 'vitest';
import { FakeMealEstimator } from '../../src/ai/FakeMealEstimator';
import { decodedByteLength, EstimateMeal } from '../../src/services/EstimateMeal';
import {
  EstimateInputMissingError,
  ImageTooLargeError,
  InvalidInputError,
} from '../../src/services/errors';
import { chai, dal, roti, TINY_IMAGE_BASE64 } from '../support/fixtures';

function setup() {
  const estimator = new FakeMealEstimator();
  return { estimator, estimateMeal: new EstimateMeal(estimator) };
}

describe('EstimateMeal', () => {
  it('recomputes totals from the items', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({ items: [roti, dal, chai], question: 'Was the dal made with ghee?' });

    const estimate = await estimateMeal.execute('u1', { source: 'text', text: 'roti dal chai' });

    expect(estimate).toEqual({
      isMeal: true,
      readable: true,
      reasonIfNot: null,
      items: [roti, dal, chai],
      totalKcal: 480,
      totalProteinG: 17.8,
      question: 'Was the dal made with ghee?',
      provider: 'fake',
      model: 'fake-model',
    });
  });

  it('passes a photo, its mime type, the note and the slot to the estimator', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({ items: [roti] });

    await estimateMeal.execute('u1', {
      source: 'photo',
      imageBase64: TINY_IMAGE_BASE64,
      mimeType: 'image/png',
      text: 'cooked in ghee',
      slot: 'dinner',
    });

    expect(estimator.calls).toEqual([
      {
        requesterId: 'u1',
        source: 'photo',
        image: { base64: TINY_IMAGE_BASE64, mimeType: 'image/png' },
        text: 'cooked in ghee',
        slot: 'dinner',
      },
    ]);
  });

  it('assumes JPEG when a photo has no mime type', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({ items: [roti] });

    await estimateMeal.execute('u1', { source: 'photo', imageBase64: TINY_IMAGE_BASE64 });

    expect(estimator.calls[0]?.image?.mimeType).toBe('image/jpeg');
  });

  it('does not send a stray image along with a text estimate', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({ items: [roti] });

    await estimateMeal.execute('u1', {
      source: 'text',
      text: '2 rotis',
      imageBase64: TINY_IMAGE_BASE64,
    });

    expect(estimator.calls[0]).not.toHaveProperty('image');
  });

  it.each([
    ['nothing at all', { source: 'photo' }],
    ['a photo source with only text', { source: 'photo', text: '2 rotis' }],
    ['an empty image', { source: 'photo', imageBase64: '' }],
    ['a text source with no text', { source: 'text' }],
    ['a text source with empty text', { source: 'text', text: '' }],
    ['a text source with only an image', { source: 'text', imageBase64: TINY_IMAGE_BASE64 }],
  ] as const)('rejects %s without calling the estimator', async (_label, request) => {
    const { estimator, estimateMeal } = setup();

    await expect(estimateMeal.execute('u1', request)).rejects.toBeInstanceOf(
      EstimateInputMissingError,
    );
    expect(estimator.calls).toHaveLength(0);
  });

  it('accepts an image of exactly the limit and rejects one byte more', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({ items: [roti] });
    const atLimit = Buffer.alloc(MAX_IMAGE_BYTES).toString('base64');
    const overLimit = Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64');

    await expect(
      estimateMeal.execute('u1', { source: 'photo', imageBase64: atLimit }),
    ).resolves.toMatchObject({ isMeal: true });
    await expect(
      estimateMeal.execute('u1', { source: 'photo', imageBase64: overLimit }),
    ).rejects.toMatchObject({
      constructor: ImageTooLargeError,
      actualBytes: MAX_IMAGE_BYTES + 1,
      limitBytes: MAX_IMAGE_BYTES,
    });
    expect(estimator.calls).toHaveLength(1);
  });

  it('rejects base64 whose length is impossible', async () => {
    const { estimateMeal } = setup();

    await expect(
      estimateMeal.execute('u1', { source: 'photo', imageBase64: 'QUJDR' }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('strips items and question when the input is not a meal', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({
      isMeal: false,
      reasonIfNot: 'This looks like a street stall, not a plate of food.',
      items: [roti],
      question: 'Any oil?',
    });

    const estimate = await estimateMeal.execute('u1', {
      source: 'photo',
      imageBase64: TINY_IMAGE_BASE64,
    });

    expect(estimate).toMatchObject({
      isMeal: false,
      reasonIfNot: 'This looks like a street stall, not a plate of food.',
      items: [],
      totalKcal: 0,
      totalProteinG: 0,
      question: null,
    });
  });

  it('supplies a reason when the model gives none for an unreadable photo', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({ readable: false, reasonIfNot: null });

    const estimate = await estimateMeal.execute('u1', {
      source: 'photo',
      imageBase64: TINY_IMAGE_BASE64,
    });

    expect(estimate.readable).toBe(false);
    expect(estimate.reasonIfNot).toEqual(expect.any(String));
    expect(estimate.items).toEqual([]);
  });

  it('treats a "meal" with no items as unreadable rather than a 0 kcal meal', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({ isMeal: true, readable: true, items: [] });

    const estimate = await estimateMeal.execute('u1', { source: 'text', text: 'something' });

    expect(estimate).toMatchObject({ isMeal: true, readable: false, items: [] });
    expect(estimate.reasonIfNot).not.toBeNull();
  });

  it('drops a stray reason from a usable estimate', async () => {
    const { estimator, estimateMeal } = setup();
    estimator.willReturn({ items: [roti], reasonIfNot: 'n/a' });

    const estimate = await estimateMeal.execute('u1', { source: 'text', text: '2 rotis' });

    expect(estimate.reasonIfNot).toBeNull();
  });
});

describe('decodedByteLength', () => {
  it.each([0, 1, 2, 3, 4, 5, 1024])('matches the real decoded size for %i bytes', (size) => {
    expect(decodedByteLength(Buffer.alloc(size).toString('base64'))).toBe(size);
  });
});
