import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);

import { POST as cwprjPreviewRoute } from "@/app/api/local/cwprj-preview/route";
import { POST as lookupRoute } from "@/app/api/local/lookup/route";
import { LOOKUP_MAX_CHECKSUMS, lookupChecksums } from "@/features/local/server";
import { createSession } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";
import { listKeys } from "@/lib/storage/objects";
import { buckets, s3 } from "@/lib/storage/s3";
import { prisma } from "@/tests/setup/backend";
import { cwprjFile, testCwprjKey, thumbnailImage } from "@/tests/support/cwprj";
import { requestContext } from "@/tests/support/next-request";
import { createCategory, createMember } from "@/tests/support/publication";

const hex = (text: string) => createHash("sha256").update(text).digest("hex");
let counter = 0;

async function model(
  checksum: string,
  status: "PUBLISHED" | "DRAFT" = "PUBLISHED",
  deleted = false,
) {
  counter += 1;
  const author = await createMember(prisma);
  const category = await createCategory(prisma);
  return prisma.model.create({
    data: {
      slug: `local-${counter}`,
      title: `Modèle ${counter}`,
      format: "SVG",
      status,
      license: "CC0",
      categoryId: category.id,
      authorId: author.id,
      fileKey: `models/l-${counter}.svg`,
      fileChecksum: checksum,
      previewKey: `l${counter}/v`,
      previewWidth: 1,
      previewHeight: 1,
      publishedAt: new Date(Date.now() + counter),
      deletedAt: deleted ? new Date() : null,
    },
  });
}

const lookup = (body: unknown) =>
  lookupRoute(
    new Request("http://localhost/api/local/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => requestContext.reset());

describe("POST /api/local/lookup", () => {
  it("renvoie les seuls modèles publiés, un par empreinte (le plus ancien)", async () => {
    const shared = hex("partagé");
    const first = await model(shared);
    await model(shared);
    await model(hex("brouillon"), "DRAFT");
    await model(hex("supprimé"), "PUBLISHED", true);
    const response = await lookup({
      checksums: [shared, shared, hex("brouillon"), hex("supprimé"), hex("inconnu")],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      matches: [{ checksum: shared, slug: first.slug, title: first.title }],
    });
  });

  it("valide l'entrée : empreintes hexadécimales, 1 à 500, JSON", async () => {
    expect((await lookup({ checksums: [] })).status).toBe(400);
    expect((await lookup({ checksums: ["pas-une-empreinte"] })).status).toBe(400);
    expect(
      (await lookup({ checksums: Array(LOOKUP_MAX_CHECKSUMS + 1).fill(hex("x")) })).status,
    ).toBe(400);
    expect((await lookup("pas du json")).status).toBe(400);
    expect(await lookupChecksums(prisma, Array(LOOKUP_MAX_CHECKSUMS).fill(hex("x")))).toEqual([]);
  });

  it("limite les vérifications par adresse IP", async () => {
    for (let i = 0; i < 20; i += 1)
      expect((await lookup({ checksums: [hex("a")] })).status).toBe(200);
    const blocked = await lookup({ checksums: [hex("a")] });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // Autre adresse : non limitée.
    requestContext.headers = new Headers({ "x-forwarded-for": "198.51.100.7" });
    expect((await lookup({ checksums: [hex("a")] })).status).toBe(200);
  });
});

describe("POST /api/local/cwprj-preview", () => {
  const key = testCwprjKey();
  const preview = (body: Buffer | null, headers: Record<string, string> = {}) =>
    cwprjPreviewRoute(
      new Request("http://localhost/api/local/cwprj-preview", {
        method: "POST",
        headers: { "content-type": "application/octet-stream", ...headers },
        body: body === null ? undefined : new Uint8Array(body),
      }),
    );
  async function signIn() {
    const member = await createMember(prisma);
    const { token } = await createSession(prisma, member.id);
    requestContext.cookies.set("canvatheque.session", { value: token });
  }

  beforeEach(() => {
    process.env.CWPRJ_KEY = key.hexKey;
    process.env.CWPRJ_IV = key.hexIv;
    resetEnvCache();
  });
  afterEach(() => {
    delete process.env.CWPRJ_KEY;
    delete process.env.CWPRJ_IV;
    delete process.env.MAX_FILE_SIZE_MB;
    resetEnvCache();
  });

  it("sans clé configurée : 404 ; visiteur : 401", async () => {
    const body = cwprjFile(key, { thumbnail: await thumbnailImage() });
    expect((await preview(body)).status).toBe(401);
    delete process.env.CWPRJ_KEY;
    delete process.env.CWPRJ_IV;
    resetEnvCache();
    await signIn();
    expect((await preview(body)).status).toBe(404);
  });

  it("membre : miniature WebP ré-encodée, rien d'écrit dans le stockage", async () => {
    await signIn();
    const before = await listKeys(s3(), buckets().previews, "");
    const response = await preview(
      cwprjFile(key, { thumbnail: await thumbnailImage("png", 120, 90) }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 120, 90]);
    expect(await listKeys(s3(), buckets().previews, "")).toEqual(before);
  });

  it("projet sans miniature, illisible ou suspect : 422 avec la raison", async () => {
    await signIn();
    const reasonOf = async (body: Buffer) => {
      const response = await preview(body);
      expect(response.status).toBe(422);
      return (await response.json()).reason;
    };
    expect(await reasonOf(cwprjFile(key, { designName: "Seul" }))).toBe("noThumbnail");
    expect(await reasonOf(cwprjFile(testCwprjKey()))).toBe("decryptFailed");
    expect(await reasonOf(Buffer.from("<html><script>x</script></html>"))).toBe("signature");
  });

  it("vide ou trop lourd : refusé avant traitement ; limite par membre", async () => {
    await signIn();
    expect((await preview(Buffer.alloc(0))).status).toBe(400);
    process.env.MAX_FILE_SIZE_MB = "1";
    resetEnvCache();
    expect((await preview(Buffer.alloc(2 * 1024 * 1024))).status).toBe(413);
    // Taille annoncée inférieure à la réalité : la lecture s'arrête à la limite.
    expect((await preview(Buffer.alloc(2 * 1024 * 1024), { "content-length": "10" })).status).toBe(
      413,
    );
    delete process.env.MAX_FILE_SIZE_MB;
    resetEnvCache();
    const body = cwprjFile(key, { designName: "x" });
    // 3 appels ci-dessus + 27 = 30 (limite horaire), le suivant est refusé.
    for (let i = 0; i < 27; i += 1) await preview(body);
    expect((await preview(body)).status).toBe(429);
  });
});
