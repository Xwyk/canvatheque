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

const globalForS3 = globalThis as unknown as {
  canvathequeS3?: S3Client;
  canvathequePublicS3?: S3Client;
};

/**
 * Client signant pour l'origine publique (S3_PUBLIC_URL) : les formulaires d'envoi
 * présignés visent l'adresse vue par le navigateur. Aucune requête n'en part.
 */
export function publicS3(): S3Client {
  const e = env();
  globalForS3.canvathequePublicS3 ??= createS3Client({
    endpoint: e.S3_PUBLIC_URL,
    region: e.S3_REGION,
    accessKeyId: e.S3_ACCESS_KEY,
    secretAccessKey: e.S3_SECRET_KEY,
  });
  return globalForS3.canvathequePublicS3;
}

/** URL publique d'un objet du bucket des aperçus (lecture anonyme autorisée). */
export function publicObjectUrl(bucket: string, key: string): string {
  let base = env().S3_PUBLIC_URL;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

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
  globalForS3.canvathequePublicS3 = undefined;
}

export function buckets() {
  const e = env();
  return { models: e.S3_BUCKET_MODELS, previews: e.S3_BUCKET_PREVIEWS };
}

/** Vérifie que chaque bucket répond. */
export async function checkBuckets(client: S3Client, names: string[]): Promise<void> {
  await Promise.all(names.map((Bucket) => client.send(new HeadBucketCommand({ Bucket }))));
}
