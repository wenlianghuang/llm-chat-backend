import { afterEach, describe, expect, it, vi } from "vitest";

import { LlmError } from "../lib/errors.js";
import { OpenAICompatibleClient } from "./openai-compatible.client.js";

describe("OpenAICompatibleClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls chat completions and returns assistant content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  hello from model  " } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAICompatibleClient({
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      model: "test-model",
    });

    const reply = await client.chat([{ role: "user", content: "Hi" }]);
    expect(reply).toBe("hello from model");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
    });
  });

  it("maps HTTP 429 to LlmError with status 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ error: { message: "rate limited" } }),
      }),
    );

    const client = new OpenAICompatibleClient({
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      model: "test-model",
    });

    await expect(
      client.chat([{ role: "user", content: "Hi" }]),
    ).rejects.toMatchObject({
      name: "LlmError",
      statusCode: 429,
    });
  });

  it("throws when the provider returns empty content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "   " } }] }),
      }),
    );

    const client = new OpenAICompatibleClient({
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      model: "test-model",
    });

    await expect(
      client.chat([{ role: "user", content: "Hi" }]),
    ).rejects.toBeInstanceOf(LlmError);
  });
});
