import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

/**
 * Runs before any test file imports app code.
 * Load .env first, then force test-safe overrides (dotenv will not replace them later).
 */
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(serverRoot, ".env") });

process.env.NODE_ENV = "test";
process.env.LLM_PROVIDER = "stub";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5434/llm_chat_test?schema=public";
} else {
  try {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = "/llm_chat_test";
    process.env.DATABASE_URL = url.toString();
  } catch {
    // leave as-is if URL parsing fails
  }
}
