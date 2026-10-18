import { execFileSync } from "node:child_process";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { MinioContainer, type StartedMinioContainer } from "@testcontainers/minio";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { createS3Client } from "@/lib/storage/s3";

export const POSTGRES_IMAGE = "postgres:16-alpine";
export const MINIO_IMAGE = "pgsty/minio:RELEASE.2026-08-04T00-00-00Z";
export const TEST_BUCKETS = { models: "test-models", previews: "test-previews" };

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
    s3Endpoint: string;
    s3AccessKey: string;
    s3SecretKey: string;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let minio: StartedMinioContainer | undefined;

/** Démarre PostgreSQL et MinIO une fois pour tout le projet « backend ». */
export async function setup(project: TestProject) {
  [postgres, minio] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).start(),
    new MinioContainer(MINIO_IMAGE)
      .withUsername("canvatheque")
      .withPassword("canvatheque-secret")
      .start(),
  ]);

  const databaseUrl = postgres.getConnectionUri();
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const s3 = createS3Client({
    endpoint: minio.getConnectionUrl(),
    region: "us-east-1",
    accessKeyId: minio.getUsername(),
    secretAccessKey: minio.getPassword(),
  });
  for (const Bucket of Object.values(TEST_BUCKETS)) {
    await s3.send(new CreateBucketCommand({ Bucket }));
  }

  project.provide("databaseUrl", databaseUrl);
  project.provide("s3Endpoint", minio.getConnectionUrl());
  project.provide("s3AccessKey", minio.getUsername());
  project.provide("s3SecretKey", minio.getPassword());
}

export async function teardown() {
  await Promise.all([postgres?.stop(), minio?.stop()]);
}
