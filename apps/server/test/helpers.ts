import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(root, "..");

function adminDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = "/postgres";
  return url.toString();
}

function databaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return url.pathname.replace(/^\//, "") || "llm_chat_test";
}

/** Create the test database if missing, then apply migrations. */
export async function prepareTestDatabase(databaseUrl: string): Promise<void> {
  const dbName = databaseName(databaseUrl);
  const admin = new PrismaClient({
    datasources: { db: { url: adminDatabaseUrl(databaseUrl) } },
  });

  try {
    const rows = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1 FROM pg_database WHERE datname = ${dbName}
      ) AS exists
    `;
    if (!rows[0]?.exists) {
      // CREATE DATABASE cannot run inside a Prisma interactive transaction;
      // unsafe is intentional here for test bootstrap only.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync("pnpm exec prisma migrate deploy", {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.message.deleteMany();
  await prisma.session.deleteMany();
}
