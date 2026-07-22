import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import type { ChatMessage, LlmClient } from "../src/llm/llm.client.js";
import { prepareTestDatabase, resetDatabase } from "./helpers.js";

class FakeLlmClient implements LlmClient {
  calls: ChatMessage[][] = [];

  constructor(private readonly reply: string) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    return this.reply;
  }
}

describe("messages API", () => {
  let app: FastifyInstance;
  let llm: FakeLlmClient;

  beforeAll(async () => {
    await prepareTestDatabase(process.env.DATABASE_URL!);
    llm = new FakeLlmClient("fake-assistant-reply");
    app = await buildApp({ llm });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    llm.calls = [];
  });

  async function createSession(): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: {},
    });
    return res.json().id as string;
  }

  it("posts a message, returns stubbed LLM reply, and lists history", async () => {
    const sessionId = await createSession();

    const posted = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/messages`,
      payload: { content: "Hello LLM" },
    });

    expect(posted.statusCode).toBe(201);
    const body = posted.json();
    expect(body.userMessage).toMatchObject({
      sessionId,
      role: "USER",
      content: "Hello LLM",
    });
    expect(body.assistantMessage).toMatchObject({
      sessionId,
      role: "ASSISTANT",
      content: "fake-assistant-reply",
    });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toEqual([{ role: "user", content: "Hello LLM" }]);

    const history = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/messages`,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toHaveLength(2);

    const session = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}`,
    });
    // First user message becomes the title when title was empty
    expect(session.json().title).toBe("Hello LLM");
  });

  it("passes prior messages as LLM context on the next turn", async () => {
    const sessionId = await createSession();

    await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/messages`,
      payload: { content: "first" },
    });
    await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/messages`,
      payload: { content: "second" },
    });

    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "fake-assistant-reply" },
      { role: "user", content: "second" },
    ]);
  });

  it("returns 404 when session does not exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions/does-not-exist/messages",
      payload: { content: "hi" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when content is missing", async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/messages`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("cascades message delete when session is deleted", async () => {
    const sessionId = await createSession();
    await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/messages`,
      payload: { content: "bye" },
    });

    await app.inject({ method: "DELETE", url: `/sessions/${sessionId}` });

    const count = await prisma.message.count();
    expect(count).toBe(0);
  });
});
