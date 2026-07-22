import { describe, expect, it } from "vitest";

import { OpenAICompatibleClient } from "./openai-compatible.client.js";
import { StubLlmClient, createLlmClient } from "./llm.client.js";

describe("createLlmClient", () => {
  it("returns StubLlmClient for stub provider", () => {
    const client = createLlmClient({ provider: "stub" });
    expect(client).toBeInstanceOf(StubLlmClient);
  });

  it("returns OpenAICompatibleClient for groq when api key is set", () => {
    const client = createLlmClient({
      provider: "groq",
      apiKey: "gsk_test",
    });
    expect(client).toBeInstanceOf(OpenAICompatibleClient);
  });

  it("requires an API key for non-stub providers", () => {
    expect(() => createLlmClient({ provider: "groq" })).toThrow(/LLM_API_KEY/);
  });
});

describe("StubLlmClient", () => {
  it("echoes the last user message", async () => {
    const client = new StubLlmClient();
    const reply = await client.chat([
      { role: "user", content: "ping" },
      { role: "assistant", content: "pong" },
      { role: "user", content: "hello" },
    ]);
    expect(reply).toContain("hello");
  });
});
