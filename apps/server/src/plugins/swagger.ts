import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "LLM Chat Backend API",
        description:
          "Multi-session chat API. Create sessions, list history, and send messages that receive an LLM reply. Authentication is not required for this assignment.",
        version: "0.4.3",
      },
      tags: [
        { name: "Health", description: "Liveness checks" },
        { name: "Sessions", description: "Conversation session CRUD" },
        { name: "Messages", description: "Session message history and chat" },
      ],
      servers: [
        {
          url: "http://localhost:3000",
          description: "Local development / Docker Compose",
        },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}

/** Shared OpenAPI error body used across routes. */
export const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;
