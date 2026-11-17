import { z } from 'zod';
import { EstimatorError } from './errors';
import {
  buildUserPrompt,
  MEAL_ESTIMATION_RESPONSE_SCHEMA,
  MEAL_ESTIMATION_SYSTEM_PROMPT,
} from './geminiPrompt';
import {
  modelEstimateSchema,
  type EstimateInput,
  type EstimateOptions,
  type ModelMealEstimator,
  type RawEstimate,
} from './mealEstimator';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TEMPERATURE = 0.2;

export interface GeminiMealEstimatorOptions {
  apiKey: string;
  model: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  baseUrl?: string;
}

/** The parts of a `generateContent` response this adapter reads. */
const generateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

const googleErrorSchema = z.object({ error: z.object({ message: z.string() }) });

/** Adapter for one Gemini model through the `generateContent` REST endpoint. */
export class GeminiMealEstimator implements ModelMealEstimator {
  readonly provider = 'gemini';
  readonly model: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(options: GeminiMealEstimatorOptions) {
    this.model = options.model;
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? fetch;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async estimate(input: EstimateInput, options: EstimateOptions = {}): Promise<RawEstimate> {
    const response = await this.#send(input, options.signal);
    if (!response.ok) {
      throw EstimatorError.fromHttpStatus(response.status, await describeFailure(response));
    }
    const estimate = parseEstimate(await readJson(response));
    return { ...estimate, provider: this.provider, model: this.model };
  }

  async #send(input: EstimateInput, signal: AbortSignal | undefined): Promise<Response> {
    const url = `${this.#baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;
    try {
      return await this.#fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.#apiKey },
        body: JSON.stringify(buildRequestBody(input)),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw new EstimatorError('TIMEOUT', 'request aborted before completion');
      const reason = error instanceof Error ? error.message : 'unknown network failure';
      throw new EstimatorError('NETWORK_ERROR', `could not reach Gemini: ${reason}`);
    }
  }
}

export function buildRequestBody(input: EstimateInput): unknown {
  const parts: unknown[] = [];
  if (input.source === 'photo' && input.image) {
    parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.base64 } });
  }
  parts.push({ text: buildUserPrompt(input) });
  return {
    systemInstruction: { parts: [{ text: MEAL_ESTIMATION_SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: TEMPERATURE,
      responseMimeType: 'application/json',
      responseSchema: MEAL_ESTIMATION_RESPONSE_SCHEMA,
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    throw new EstimatorError('MALFORMED_OUTPUT', 'response body was not JSON');
  }
}

/** Extracts and validates the model's answer. Anything unexpected is an error, never a guess. */
function parseEstimate(body: unknown): z.infer<typeof modelEstimateSchema> {
  const envelope = generateContentResponseSchema.safeParse(body);
  if (!envelope.success) {
    throw new EstimatorError('MALFORMED_OUTPUT', 'unexpected generateContent response shape');
  }
  const candidate = envelope.data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (text === '') {
    const why = envelope.data.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'no text';
    throw new EstimatorError('MALFORMED_OUTPUT', `model returned no answer (${why})`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new EstimatorError('MALFORMED_OUTPUT', 'model answer was not valid JSON');
  }
  const estimate = modelEstimateSchema.safeParse(json);
  if (!estimate.success) {
    const where = estimate.error.issues
      .slice(0, 3)
      .map((issue) => issue.path.join('.') || '(root)')
      .join(', ');
    throw new EstimatorError('MALFORMED_OUTPUT', `model answer failed validation at: ${where}`);
  }
  return estimate.data;
}

/** A short description of a non-2xx response. Google's error text never contains the key. */
async function describeFailure(response: Response): Promise<string> {
  let detail = '';
  try {
    const parsed = googleErrorSchema.safeParse(await response.json());
    if (parsed.success) detail = `: ${parsed.data.error.message.slice(0, 200)}`;
  } catch {
    // Body was not JSON; the status code alone is enough.
  }
  return `Gemini responded with HTTP ${response.status}${detail}`;
}
