import type { FastifyInstance } from "fastify";

import { serializeMessage } from "../../lib/serialize.js";
import { errorResponseSchema } from "../../plugins/swagger.js";
import {
  createMessageBodySchema,
  createMessageResponseSchema,
  messageParamsSchema,
  messageResponseSchema,
} from "./messages.schema.js";
import type { MessagesService } from "./messages.service.js";

type SessionParams = {
  id: string;
};

type CreateMessageBody = {
  content: string;
};

export async function messagesRoutes(
  app: FastifyInstance,
  messagesService: MessagesService,
) {
  app.get<{ Params: SessionParams }>(
    "/sessions/:id/messages",
    {
      schema: {
        tags: ["Messages"],
        summary: "List messages for a session",
        description: "Returns messages ordered by `createdAt` ascending.",
        params: messageParamsSchema,
        response: {
          200: {
            type: "array",
            items: messageResponseSchema,
          },
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const messages = await messagesService.listBySession(request.params.id);
      return messages.map(serializeMessage);
    },
  );

  app.post<{ Params: SessionParams; Body: CreateMessageBody }>(
    "/sessions/:id/messages",
    {
      schema: {
        tags: ["Messages"],
        summary: "Send a message and get an LLM reply",
        description:
          "Persists the user message, calls the configured LLM with session history as context, persists the assistant reply, and returns both messages.",
        params: messageParamsSchema,
        body: createMessageBodySchema,
        response: {
          201: createMessageResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await messagesService.createAndReply(
        request.params.id,
        request.body,
      );
      return reply.code(201).send({
        userMessage: serializeMessage(result.userMessage),
        assistantMessage: serializeMessage(result.assistantMessage),
      });
    },
  );
}
