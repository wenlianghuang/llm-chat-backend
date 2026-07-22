import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";

import { env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { prisma as defaultPrisma } from "./lib/prisma.js";
import { createLlmClient, type LlmClient } from "./llm/llm.client.js";
import { messagesRoutes } from "./modules/messages/messages.routes.js";
import { MessagesService } from "./modules/messages/messages.service.js";
import { sessionsRoutes } from "./modules/sessions/sessions.routes.js";
import { SessionsService } from "./modules/sessions/sessions.service.js";
import { registerSwagger } from "./plugins/swagger.js";

export type BuildAppOptions = {
  llm?: LlmClient;
  prisma?: PrismaClient;
  /** Defaults to true outside tests */
  registerDocs?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: env.nodeEnv !== "test",
  });

  const registerDocs = options.registerDocs ?? env.nodeEnv !== "test";
  if (registerDocs) {
    await registerSwagger(app);
  }

  const db = options.prisma ?? defaultPrisma;
  const llm =
    options.llm ??
    createLlmClient({
      provider: env.llmProvider,
      apiKey: env.llmApiKey,
      baseUrl: env.llmBaseUrl,
      model: env.llmModel,
    });

  const sessionsService = new SessionsService(db);
  const messagesService = new MessagesService(db, llm);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
    }

    if (error.validation) {
      return reply.code(400).send({
        error: "ValidationError",
        message: error.message,
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: "InternalServerError",
      message: "Unexpected error",
    });
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Liveness check",
        response: {
          200: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string", example: "ok" },
            },
          },
        },
      },
    },
    async () => ({ status: "ok" }),
  );

  await sessionsRoutes(app, sessionsService);
  await messagesRoutes(app, messagesService);

  return app;
}
