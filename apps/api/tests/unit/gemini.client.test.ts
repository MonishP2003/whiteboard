import { beforeEach, describe, expect, test, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const { ApiError, Type } = await import("@google/genai");
const { createGeminiClient } = await import("../../src/integrations/gemini.client.js");
const { AppError } = await import("../../src/utils/AppError.js");

const input = { system: "s", prompt: "p", responseSchema: { type: Type.OBJECT } };
const apiError = (status: number) => new ApiError({ message: `HTTP ${status}`, status });
const client = () => createGeminiClient("key", "model", [0, 0]);

beforeEach(() => {
  generateContent.mockReset();
});

describe("geminiClient.generateJson", () => {
  test("returns parsed JSON", async () => {
    generateContent.mockResolvedValue({ text: '{"a":1}' });
    await expect(client().generateJson(input)).resolves.toEqual({ a: 1 });
  });

  test("retries an overloaded model (503) and returns the later success", async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce({ text: '{"a":1}' });
    await expect(client().generateJson(input)).resolves.toEqual({ a: 1 });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  test("overload that outlasts the retries is AI_RATE_LIMITED", async () => {
    generateContent.mockRejectedValue(apiError(503));
    const err = await client()
      .generateJson(input)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 429, code: "AI_RATE_LIMITED" });
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  test("Google's rate limit (429) is AI_RATE_LIMITED without retrying", async () => {
    generateContent.mockRejectedValue(apiError(429));
    await expect(client().generateJson(input)).rejects.toMatchObject({
      status: 429,
      code: "AI_RATE_LIMITED",
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  test("other upstream errors are AI_UPSTREAM_ERROR without retrying", async () => {
    generateContent.mockRejectedValue(apiError(500));
    await expect(client().generateJson(input)).rejects.toMatchObject({
      status: 502,
      code: "AI_UPSTREAM_ERROR",
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  test("without a key it's AI_NOT_CONFIGURED", async () => {
    await expect(createGeminiClient(undefined, "model").generateJson(input)).rejects.toMatchObject({
      status: 503,
      code: "AI_NOT_CONFIGURED",
    });
  });
});
