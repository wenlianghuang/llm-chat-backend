import { LlmError } from "../lib/errors.js";
import type { ChatMessage, LlmClient } from "./llm.client.js";

export type OpenAICompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Soft cap on completion length to conserve free-tier tokens */
  maxTokens?: number;
  temperature?: number;
};

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
};

/**
 * Thin OpenAI Chat Completions client (fetch-based).
 * Works with Groq, NVIDIA NIM, and other OpenAI-compatible hosts.
 */
export class OpenAICompatibleClient implements LlmClient {
  constructor(private readonly config: OpenAICompatibleConfig) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: this.config.temperature ?? 0.7,
          max_tokens: this.config.maxTokens ?? 1024,
        }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      throw new LlmError(`LLM request failed: ${detail}`);
    }

    const payload = (await response.json().catch(() => null)) as
      | ChatCompletionsResponse
      | null;

    if (!response.ok) {
      const detail =
        payload?.error?.message ??
        `HTTP ${response.status} ${response.statusText}`;
      const statusCode = response.status === 429 ? 429 : 502;
      throw new LlmError(`LLM provider error: ${detail}`, statusCode);
    }

    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new LlmError("LLM provider returned an empty response");
    }

    return content;
  }
}
