export const createSessionBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "Optional display title for the session",
    },
  },
} as const;

export const sessionParamsSchema = {
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

export const sessionResponseSchema = {
  type: "object",
  required: ["id", "title", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string" },
    title: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;
