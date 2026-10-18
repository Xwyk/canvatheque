import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

/** Opérations objet utilisées par l'application (fines, testées contre MinIO). */

export type PresignedUpload = { url: string; fields: Record<string, string> };

/**
 * Formulaire POST présigné : la politique fixe la clé exacte et borne la taille
 * (`content-length-range`), ce qu'une URL PUT présignée ne permet pas (ADR-006).
 */
export async function presignUpload(
  client: S3Client,
  bucket: string,
  key: string,
  { maxBytes, expiresSeconds }: { maxBytes: number; expiresSeconds: number },
): Promise<PresignedUpload> {
  return createPresignedPost(client, {
    Bucket: bucket,
    Key: key,
    Conditions: [["content-length-range", 1, maxBytes]],
    Expires: expiresSeconds,
  });
}

/** Taille d'un objet, ou null s'il n'existe pas. */
export async function objectSize(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<number | null> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength ?? 0;
  } catch (error) {
    if ((error as { name?: string }).name === "NotFound") return null;
    throw error;
  }
}

export async function readObject(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await object.Body!.transformToByteArray());
}

export async function writeObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer | string,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

/** Supprime des objets (sans erreur si absents) ; ignore une liste vide. */
export async function deleteObjects(
  client: S3Client,
  bucket: string,
  keys: readonly string[],
): Promise<void> {
  const unique = [...new Set(keys)];
  for (let start = 0; start < unique.length; start += 1000) {
    const batch = unique.slice(start, start + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

export async function listKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    keys.push(...(page.Contents ?? []).flatMap((item) => (item.Key ? [item.Key] : [])));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
