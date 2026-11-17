import { sumItems, type Estimate } from '@sage/shared';
import type { RawEstimate } from '../ai/mealEstimator';

const NOT_A_MEAL = "That doesn't look like a meal.";
const NOT_READABLE = "I couldn't make out the food. Try a brighter, closer photo.";
const NOTHING_RECOGNISED = "I couldn't pick out any food. Try again, or type what you ate.";

/**
 * Turns a model answer into the estimate the client receives, enforcing the contract's
 * invariants no matter what the model said:
 *
 * - totals are always computed here from the items;
 * - an answer that is not a readable meal has no items, no question, zero totals and a reason;
 * - a "meal" with no items is reported as unreadable rather than as an empty 0 kcal meal;
 * - a usable answer never carries a reason.
 */
export function normaliseEstimate(raw: RawEstimate): Estimate {
  const origin = { provider: raw.provider, model: raw.model };

  if (!raw.isMeal) return rejected(false, raw.readable, raw.reasonIfNot ?? NOT_A_MEAL, origin);
  if (!raw.readable) return rejected(true, false, raw.reasonIfNot ?? NOT_READABLE, origin);
  if (raw.items.length === 0) return rejected(true, false, NOTHING_RECOGNISED, origin);

  return {
    isMeal: true,
    readable: true,
    reasonIfNot: null,
    items: raw.items,
    ...sumItems(raw.items),
    question: raw.question,
    ...origin,
  };
}

function rejected(
  isMeal: boolean,
  readable: boolean,
  reasonIfNot: string,
  origin: Pick<Estimate, 'provider' | 'model'>,
): Estimate {
  return {
    isMeal,
    readable,
    reasonIfNot,
    items: [],
    totalKcal: 0,
    totalProteinG: 0,
    question: null,
    ...origin,
  };
}
