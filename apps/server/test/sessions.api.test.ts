import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { StubLlmClient } from "../src/llm/llm.client.js";
import { prepareTestDatabase, resetDatabase } from "./helpers.js";

describe("sessions API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await prepareTestDatabase(process.env.DATABASE_URL!);
    app = await buildApp({ llm: new StubLlmClient() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });


  it("creates, lists, gets, and deletes a session", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { title: "Test chat" },
    });
    expect(created.statusCode).toBe(201);
    const session = created.json();
    expect(session).toMatchObject({ title: "Test chat" });
    expect(session.id).toBeTruthy();

    const listed = await app.inject({ method: "GET", url: "/sessions" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0].id).toBe(session.id);

    const got = await app.inject({
      method: "GET",
      url: `/sessions/${session.id}`,
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().id).toBe(session.id);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/sessions/${session.id}`,
    });
    expect(deleted.statusCode).toBe(204);

    const missing = await app.inject({
      method: "GET",
      url: `/sessions/${session.id}`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe("NotFoundError");
  });
});
