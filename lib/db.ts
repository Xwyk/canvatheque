import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForDb = globalThis as unknown as { canvathequeDb?: PrismaClient };

/** Client Prisma partagé (un seul pool par processus, y compris en rechargement à chaud). */
export function db(): PrismaClient {
  globalForDb.canvathequeDb ??= createPrismaClient(env().DATABASE_URL);
  return globalForDb.canvathequeDb;
}

/** Réservé aux tests : remplace le client partagé. */
export function setDbForTests(client: PrismaClient | undefined): void {
  globalForDb.canvathequeDb = client;
}
