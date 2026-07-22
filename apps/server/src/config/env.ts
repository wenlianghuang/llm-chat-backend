import { config } from "dotenv";

config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required("DATABASE_URL"),
  /**
   * Recommended default for real replies: groq (generous free request quota).
   * Use stub for offline work / tests without an API key.
   */
  llmProvider: process.env.LLM_PROVIDER ?? "stub",
  llmApiKey: process.env.LLM_API_KEY,
  llmBaseUrl: process.env.LLM_BASE_URL,
  llmModel: process.env.LLM_MODEL,
};
