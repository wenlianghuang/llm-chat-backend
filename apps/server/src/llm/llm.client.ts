import { OpenAICompatibleClient } from "./openai-compatible.client.js";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export interface LlmClient {
  chat(messages: ChatMessage[]): Promise<string>;
}

/**
 * Local stub for offline development and automated tests.
 */
export class StubLlmClient implements LlmClient {
  async chat(messages: ChatMessage[]): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const prompt = lastUser?.content?.trim() || "(empty)";
    return `Stub reply: I received your message — "${prompt}"`;
  }
}

export type LlmClientOptions = {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

const PROVIDER_DEFAULTS: Record<
  string,
  { baseUrl: string; model: string }
> = {
  /**
   * Groq free tier is request-generous (on the order of thousands/day),
   * which is safer for homework-style iterative testing than credit-capped hosts.
   * Get a key: https://console.groq.com/keys
   */
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    // Smaller/faster model → lower token burn on free tier
    model: "llama-3.1-8b-instant",
  },
  /**
   * NVIDIA NIM (assignment suggestion). Free / rate-limited prototyping tier.
   * Get a key: https://build.nvidia.com/settings/api-keys
   */
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "meta/llama-3.1-8b-instruct",
  },
};

export function createLlmClient(options: LlmClientOptions): LlmClient {
  const provider = options.provider.toLowerCase();

  if (provider === "stub") {
    return new StubLlmClient();
  }

  const defaults = PROVIDER_DEFAULTS[provider];
  if (!defaults && !options.baseUrl) {
    throw new Error(
      `Unsupported LLM provider: ${options.provider}. Use stub | groq | nvidia, or set LLM_BASE_URL.`,
    );
  }

  if (!options.apiKey) {
    throw new Error(
      `LLM_API_KEY is required when LLM_PROVIDER=${options.provider}`,
    );
  }

  return new OpenAICompatibleClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl ?? defaults!.baseUrl,
    model: options.model ?? defaults!.model,
  });
}
