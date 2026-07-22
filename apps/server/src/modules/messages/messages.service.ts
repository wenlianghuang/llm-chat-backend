import type { Message, PrismaClient } from "@prisma/client";

import { NotFoundError } from "../../lib/errors.js";
import type { ChatMessage, LlmClient } from "../../llm/llm.client.js";

export type CreateMessageInput = {
  content: string;
};

export type CreateMessageResult = {
  userMessage: Message;
  assistantMessage: Message;
};

function toChatRole(role: Message["role"]): ChatMessage["role"] {
  switch (role) {
    case "USER":
      return "user";
    case "ASSISTANT":
      return "assistant";
    case "SYSTEM":
      return "system";
  }
}

export class MessagesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly llm: LlmClient,
  ) {}

  private async assertSessionExists(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundError(`Session not found: ${sessionId}`);
    }
  }

  async listBySession(sessionId: string): Promise<Message[]> {
    await this.assertSessionExists(sessionId);
    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
  }

  async createAndReply(
    sessionId: string,
    input: CreateMessageInput,
  ): Promise<CreateMessageResult> {
    const content = input.content.trim();
    await this.assertSessionExists(sessionId);

    const history = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    const chatMessages: ChatMessage[] = [
      ...history.map((m) => ({
        role: toChatRole(m.role),
        content: m.content,
      })),
      { role: "user", content },
    ];

    const assistantContent = await this.llm.chat(chatMessages);

    const [userMessage, assistantMessage] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          sessionId,
          role: "USER",
          content,
        },
      }),
      this.prisma.message.create({
        data: {
          sessionId,
          role: "ASSISTANT",
          content: assistantContent,
        },
      }),
      this.prisma.session.update({
        where: { id: sessionId },
        data:
          history.length === 0
            ? { title: content.slice(0, 80) }
            : { updatedAt: new Date() },
      }),
    ]);

    return { userMessage, assistantMessage };
  }
}
