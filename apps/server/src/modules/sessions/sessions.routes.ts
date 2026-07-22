import type { FastifyInstance } from "fastify";

import { serializeSession } from "../../lib/serialize.js";
import { errorResponseSchema } from "../../plugins/swagger.js";
import {
  createSessionBodySchema,
  sessionParamsSchema,
  sessionResponseSchema,
} from "./sessions.schema.js";
import type { SessionsService } from "./sessions.service.js";

type CreateSessionBody = {
  title?: string;
};

type SessionParams = {
  id: string;
};

export async function sessionsRoutes(
  app: FastifyInstance,
  sessionsService: SessionsService,
) {
  app.post<{ Body: CreateSessionBody }>(
    "/sessions",
    {
      schema: {
        tags: ["Sessions"],
        summary: "Create a conversation session",
        description:
          "Creates an empty session. Title is optional; if omitted it may be set from the first user message later.",
        body: createSessionBodySchema,
        response: {
          201: sessionResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionsService.create(request.body ?? {});
      return reply.code(201).send(serializeSession(session));
    },
  );

  app.get(
    "/sessions",
    {
      schema: {
        tags: ["Sessions"],
        summary: "List sessions",
        description: "Returns sessions ordered by `updatedAt` descending.",
        response: {
          200: {
            type: "array",
            items: sessionResponseSchema,
          },
        },
      },
    },
    async () => {
      const sessions = await sessionsService.list();
      return sessions.map(serializeSession);
    },
  );

  app.get<{ Params: SessionParams }>(
    "/sessions/:id",
    {
      schema: {
        tags: ["Sessions"],
        summary: "Get a session by id",
        params: sessionParamsSchema,
        response: {
          200: sessionResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const session = await sessionsService.getById(request.params.id);
      return serializeSession(session);
    },
  );

  app.delete<{ Params: SessionParams }>(
    "/sessions/:id",
    {
      schema: {
        tags: ["Sessions"],
        summary: "Delete a session",
        description:
          "Deletes the session and all of its messages (database cascade).",
        params: sessionParamsSchema,
        response: {
          204: { type: "null", description: "Session deleted" },
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await sessionsService.delete(request.params.id);
      return reply.code(204).send();
    },
  );
}
