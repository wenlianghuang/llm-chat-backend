import type { Message, Session } from "@prisma/client";

export function serializeSession(session: Session) {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function serializeMessage(message: Message) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}
