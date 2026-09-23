import { ApiError, GoogleGenAI, type Schema } from "@google/genai";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

/** Gemini's OpenAPI-subset schema for structured output. */
export type ResponseSchema = Schema;
export { Type as SchemaType } from "@google/genai";

export interface GenerateJsonInput {
  system: string;
  prompt: string;
  responseSchema: ResponseSchema;
}

export interface GeminiClient {
  /**
   * Asks for JSON matching `responseSchema` and returns it parsed, unvalidated. Output that
   * isn't JSON at all comes back as the raw string, so the caller's validation reports it.
   */
  generateJson(input: GenerateJsonInput): Promise<unknown>;
}

/** Covers every attempt of one call, retries included. */
const TIMEOUT_MS = 20_000;
/**
 * Waits before each retry of a 503 ("model is experiencing high demand"), which the free
 * tier returns often and briefly.
 */
const OVERLOAD_RETRY_DELAYS_MS = [1_000, 2_500];

const isOverloaded = (err: unknown) => err instanceof ApiError && err.status === 503;

export function createGeminiClient(
  apiKey: string | undefined,
  model: string,
  retryDelaysMs: readonly number[] = OVERLOAD_RETRY_DELAYS_MS,
): GeminiClient {
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  return {
    async generateJson({ system, prompt, responseSchema }) {
      if (!ai) throw new AppError(503, "AI_NOT_CONFIGURED");
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
      let text: string | undefined;
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const res = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                systemInstruction: system,
                responseMimeType: "application/json",
                responseSchema,
                abortSignal: abort.signal,
              },
            });
            text = res.text;
            break;
          } catch (err) {
            const delay = retryDelaysMs[attempt];
            if (!isOverloaded(err) || delay === undefined || abort.signal.aborted) throw err;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      } catch (err) {
        // Google's own rate limit, or overload that outlasted the retries: both mean "busy".
        if (err instanceof ApiError && (err.status === 429 || err.status === 503)) {
          throw new AppError(429, "AI_RATE_LIMITED", undefined, { cause: err });
        }
        throw new AppError(502, "AI_UPSTREAM_ERROR", undefined, { cause: err });
      } finally {
        clearTimeout(timer);
      }
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
  };
}

export const geminiClient = createGeminiClient(env.GEMINI_API_KEY, env.GEMINI_MODEL);
