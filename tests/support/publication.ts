import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { ModelActor } from "@/features/models/service";
import type { UploadDeps, UploadTicket } from "@/features/uploads/service";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { buckets, publicS3, s3 } from "@/lib/storage/s3";

export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const SIMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)"><script>alert(2)</script><circle cx="50" cy="50" r="40" fill="#C81E4B"/></svg>`;

export function testDeps(prisma: PrismaClient, overrides: Partial<UploadDeps> = {}): UploadDeps {
  return {
    prisma,
    s3: s3(),
    publicS3: publicS3(),
    buckets: buckets(),
    maxFileBytes: 1024 * 1024,
    maxModels: 200,
    ...overrides,
  };
}

let counter = 0;

export async function createMember(
  prisma: PrismaClient,
  { verified = true, role = "MEMBER" as "MEMBER" | "ADMIN", banned = false } = {},
): Promise<ModelActor & { email: string; pseudoSlug: string }> {
  counter += 1;
  const pseudo = `membre${counter}`;
  return prisma.user.create({
    data: {
      pseudo,
      pseudoSlug: pseudo,
      email: `${pseudo}@exemple.fr`,
      role,
      tosAcceptedAt: new Date(),
      emailVerifiedAt: verified ? new Date() : null,
      bannedAt: banned ? new Date() : null,
    },
    select: {
      id: true,
      pseudo: true,
      pseudoSlug: true,
      email: true,
      role: true,
      bannedAt: true,
      emailVerifiedAt: true,
    },
  });
}

/** Catégorie minimale (la base vidée entre les tests n'a pas les catégories de référence). */
export async function createCategory(prisma: PrismaClient, name = "Décoration") {
  const slug = slugify(name);
  return prisma.category.upsert({
    where: { slug },
    update: {},
    create: { slug, name, icon: "shapes", color: "#C81E4B", order: 0 },
  });
}

/** Envoi navigateur simulé : POST multipart vers le formulaire présigné. */
export async function postFile(ticket: UploadTicket, body: Buffer | string, name = "fichier") {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
  form.append("file", new Blob([typeof body === "string" ? body : new Uint8Array(body)]), name);
  return fetch(ticket.url, { method: "POST", body: form });
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function objectText(bucket: string, key: string): Promise<string> {
  const object = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return object.Body!.transformToString();
}
