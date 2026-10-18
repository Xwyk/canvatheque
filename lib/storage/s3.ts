import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

export type StorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function createS3Client(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

const globalForS3 = globalThis as unknown as { canvathequeS3?: S3Client };

/** Client interne (réseau Docker) pour les opérations serveur. */
export function s3(): S3Client {
  const e = env();
  globalForS3.canvathequeS3 ??= createS3Client({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    accessKeyId: e.S3_ACCESS_KEY,
    secretAccessKey: e.S3_SECRET_KEY,
  });
  return globalForS3.canvathequeS3;
}

export function setS3ForTests(client: S3Client | undefined): void {
  globalForS3.canvathequeS3 = client;
}

export function buckets() {
  const e = env();
  return { models: e.S3_BUCKET_MODELS, previews: e.S3_BUCKET_PREVIEWS };
}

/** Vérifie que chaque bucket répond. */
export async function checkBuckets(client: S3Client, names: string[]): Promise<void> {
  await Promise.all(names.map((Bucket) => client.send(new HeadBucketCommand({ Bucket }))));
}
