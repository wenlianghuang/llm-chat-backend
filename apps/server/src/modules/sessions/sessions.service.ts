import type { PrismaClient, Session } from "@prisma/client";

import { NotFoundError } from "../../lib/errors.js";

export type CreateSessionInput = {
  title?: string;
};

export class SessionsService {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: CreateSessionInput = {}): Promise<Session> {
    return this.prisma.session.create({
      data: {
        title: input.title?.trim() || null,
      },
    });
  }

  list(): Promise<Session[]> {
    return this.prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  async getById(id: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundError(`Session not found: ${id}`);
    }
    return session;
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.session.delete({ where: { id } });
  }
}
