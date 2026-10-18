import { afterAll, beforeEach, inject } from "vitest";
import { createPrismaClient, setDbForTests } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { setS3ForTests } from "@/lib/storage/s3";
import { resetDatabase } from "@/tests/support/database";

const TEST_ENV = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: inject("databaseUrl"),
  AUTH_SECRET: "test-secret-test-secret-test-secret-test",
  S3_ENDPOINT: inject("s3Endpoint"),
  S3_PUBLIC_URL: inject("s3Endpoint"),
  S3_ACCESS_KEY: inject("s3AccessKey"),
  S3_SECRET_KEY: inject("s3SecretKey"),
  S3_BUCKET_MODELS: "test-models",
  S3_BUCKET_PREVIEWS: "test-previews",
  ADMIN_EMAIL: "admin@canvatheque.test",
  METRICS_TOKEN: "test-metrics-token",
};

Object.assign(process.env, TEST_ENV);
resetEnvCache();

export const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
setDbForTests(prisma);
setS3ForTests(undefined);

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  setDbForTests(undefined);
});
