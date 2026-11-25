import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
const adapter = new PrismaBetterSqlite3(
  { url: process.env.DATABASE_URL || "file:./prisma/demo.db" },
  { timestampFormat: "unixepoch-ms" },
);
const cache = globalThis as unknown as { paypilot?: PrismaClient };
export const db = (cache.paypilot ??= new PrismaClient({ adapter }));
export const merchant = "studio-bangkok";
export const day = 86400000;
