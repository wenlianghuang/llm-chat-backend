export const messageParamsSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Session id (cuid)",
    },
  },
} as const;

export const createMessageBodySchema = {
  type: "object",
  required: ["content"],
  additionalProperties: false,
  properties: {
    content: {
      type: "string",
      minLength: 1,
      maxLength: 8000,
      description: "User message text sent to the LLM",
    },
  },
} as const;

export const messageResponseSchema = {
  type: "object",
  required: ["id", "sessionId", "role", "content", "createdAt"],
  properties: {
    id: { type: "string" },
    sessionId: { type: "string" },
    role: {
      type: "string",
      enum: ["USER", "ASSISTANT", "SYSTEM"],
    },
    content: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

export const createMessageResponseSchema = {
  type: "object",
  required: ["userMessage", "assistantMessage"],
  properties: {
    userMessage: messageResponseSchema,
    assistantMessage: messageResponseSchema,
  },
} as const;
