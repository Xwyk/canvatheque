import { readFileSync } from "node:fs";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteModel,
  getEditableModel,
  listMyModels,
  publishModel,
  saveModelDetails,
  suggestTags,
  unpublishModel,
  type ModelActor,
} from "@/features/models/service";
import {
  cleanupExpiredUploads,
  confirmUpload,
  createUpload,
  type ConfirmedFile,
  type ConfirmedPreview,
  type UploadDeps,
} from "@/features/uploads/service";
import { buckets } from "@/lib/storage/s3";
import { previewObjectKeys } from "@/lib/storage/previews";
import { demoCwprj } from "@/prisma/seed-models";
import { bmpImage, cwprjFile, testCwprjKey, thumbnailImage } from "@/tests/support/cwprj";
import { prisma } from "@/tests/setup/backend";
import {
  createCategory,
  createMember,
  objectExists,
  objectText,
  PNG_1PX,
  postFile,
  SIMPLE_SVG,
  testDeps,
} from "@/tests/support/publication";

let deps: UploadDeps;
let member: ModelActor;

beforeEach(async () => {
  deps = testDeps(prisma);
  member = await createMember(prisma);
});

/** Demande, envoi direct vers MinIO puis confirmation. */
async function upload(
  actor: ModelActor,
  fileName: string,
  body: Buffer | string,
  options: { kind?: "MODEL" | "PREVIEW"; modelId?: string; mime?: string; crop?: never } = {},
) {
  const ticket = await createUpload(deps, actor, {
    kind: options.kind ?? "MODEL",
    fileName,
    size: Buffer.byteLength(body),
    mime: options.mime ?? "",
    modelId: options.modelId,
  });
  if (!ticket.ok) return ticket;
  const response = await postFile(ticket.data, body, fileName);
  expect(response.status).toBe(204);
  return confirmUpload(deps, actor, { uploadId: ticket.data.uploadId });
}

async function uploadSvg(actor = member, svg = SIMPLE_SVG, name = "papillon-ajoure.svg") {
  const result = await upload(actor, name, svg);
  if (!result.ok) throw new Error(result.error.message);
  return result.data as ConfirmedFile;
}

async function readyToPublish(actor = member) {
  const file = await uploadSvg(actor);
  const category = await createCategory(prisma);
  const saved = await saveModelDetails(deps, actor, {
    modelId: file.modelId,
    title: "Papillon ajouré",
    description: "Un **papillon** léger",
    categoryId: category.id,
    license: "CC_BY",
    tags: ["Papillon", "Été"],
  });
  expect(saved.ok).toBe(true);
  return file;
}

describe("envoi d'un SVG", () => {
  it("nettoie le fichier, génère les aperçus et crée le brouillon", async () => {
    const file = await uploadSvg();
    expect(file).toMatchObject({
      created: true,
      slug: "papillon-ajoure",
      title: "Papillon ajoure",
      format: "SVG",
      fileName: "papillon-ajoure.svg",
      previewCustom: false,
      titleUpdated: false,
      duplicateOf: null,
    });
    const model = await prisma.model.findUniqueOrThrow({ where: { id: file.modelId } });
    expect(model).toMatchObject({ status: "DRAFT", authorId: member.id, previewWidth: 1600 });
    expect(model.fileChecksum).toMatch(/^[0-9a-f]{64}$/);

    const stored = await objectText(buckets().models, model.fileKey!);
    expect(stored).toContain("<circle");
    expect(stored).not.toContain("script");
    expect(stored).not.toContain("onload");
    for (const key of previewObjectKeys(model.previewKey!)) {
      expect(await objectExists(buckets().previews, key)).toBe(true);
    }
    expect(file.preview!.lg).toContain(`${model.previewKey}-lg.webp`);

    // L'objet temporaire est supprimé, l'envoi confirmé.
    const record = await prisma.upload.findFirstOrThrow({ where: { modelId: model.id } });
    expect(record.status).toBe("CONFIRMED");
    expect(await objectExists(buckets().models, record.key)).toBe(false);
  });

  it("signale un doublon publié (non bloquant)", async () => {
    const first = await readyToPublish();
    await publishModel(deps, member, first.modelId);
    const other = await createMember(prisma);
    const second = await uploadSvg(other);
    expect(second.duplicateOf).toEqual({ slug: "papillon-ajoure", title: "Papillon ajouré" });
    expect(second.slug).toBe("papillon-ajoure-2");
  });

  it("refuse un SVG malveillant ou invalide et abandonne l'envoi", async () => {
    const xxe = readFileSync("tests/fixtures/svg/entity-xxe.svg");
    const result = await upload(member, "xxe.svg", xxe);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", message: "errors.upload.svgEntities" },
    });
    const record = await prisma.upload.findFirstOrThrow();
    expect(record.status).toBe("ABANDONED");
    expect(await objectExists(buckets().models, record.key)).toBe(false);
    expect(await prisma.model.count()).toBe(0);
  });
});

describe("envoi d'un CWPRJ", () => {
  it("accepte un contenu opaque, refuse un exécutable renommé", async () => {
    const ok = await upload(member, "boite houx.cwprj", demoCwprj("x"));
    expect(ok).toMatchObject({ ok: true, data: { format: "CWPRJ", preview: null } });

    const exe = Buffer.alloc(256);
    exe.write("MZ", 0, "latin1");
    exe.writeUInt32LE(0x80, 0x3c);
    exe.write("PE\0\0", 0x80, "latin1");
    expect(await upload(member, "setup.cwprj", exe)).toMatchObject({
      ok: false,
      error: { message: "errors.upload.signature" },
    });
  });
});

describe("aperçu extrait d'un CWPRJ (ADR-013)", () => {
  const key = testCwprjKey();
  const withKey = () => ({ ...deps, cwprjKeys: key.keys });

  async function uploadCwprj(name: string, body: Buffer, modelId?: string) {
    const result = await upload(member, name, body, { modelId });
    if (!result.ok) throw new Error(result.error.message);
    return result.data as ConfirmedFile;
  }

  it("miniature → trois aperçus WebP, titre tiré du motif, publication sans image", async () => {
    deps = withKey();
    const png = await thumbnailImage("png", 120, 90);
    const body = cwprjFile(key, { designName: "Boîte &amp; houx", thumbnail: png });
    const file = await uploadCwprj("boite-houx.cwprj", body);
    expect(file).toMatchObject({
      format: "CWPRJ",
      title: "Boîte & houx",
      previewCustom: false,
      titleUpdated: false,
      preview: { width: 120, height: 90 },
    });
    const model = await prisma.model.findUniqueOrThrow({ where: { id: file.modelId } });
    expect(model.previewKey).toMatch(new RegExp(`^${model.id}/`));
    for (const objectKey of previewObjectKeys(model.previewKey!)) {
      expect(await objectExists(buckets().previews, objectKey)).toBe(true);
    }
    // Le fichier stocké reste le projet chiffré d'origine.
    expect(model.fileSize).toBe(body.length);

    const category = await createCategory(prisma);
    await saveModelDetails(deps, member, {
      modelId: file.modelId,
      title: file.title,
      description: "",
      categoryId: category.id,
      license: "CC0",
      tags: [],
    });
    expect(await publishModel(deps, member, file.modelId)).toMatchObject({ ok: true });
  });

  it("BMP converti ; nom de motif trop court ignoré", async () => {
    deps = withKey();
    const file = await uploadCwprj(
      "sapin-de-noel.cwprj",
      cwprjFile(key, { designName: "ab", thumbnail: bmpImage({ width: 8, height: 6 }) }),
    );
    expect(file).toMatchObject({ title: "Sapin de noel", preview: { width: 8, height: 6 } });
  });

  it("sans clé, ou fichier illisible : envoi accepté sans aperçu, comme avant", async () => {
    const body = cwprjFile(key, { designName: "Couronne", thumbnail: await thumbnailImage() });
    expect(await uploadCwprj("couronne.cwprj", body)).toMatchObject({
      title: "Couronne",
      preview: null,
    });
    deps = { ...deps, cwprjKeys: testCwprjKey().keys };
    expect(await uploadCwprj("autre-cle.cwprj", body)).toMatchObject({
      title: "Autre cle",
      preview: null,
    });
    deps = withKey();
    expect(await uploadCwprj("sans-miniature.cwprj", cwprjFile(key))).toMatchObject({
      preview: null,
    });
    expect(await uploadCwprj("ancien.cwprj", Buffer.from("#FCM0123456789ab"))).toMatchObject({
      preview: null,
    });
  });

  it("nouvel envoi : titre automatique remplacé, titre saisi conservé, image du membre gardée", async () => {
    deps = withKey();
    const first = await uploadCwprj("premier-jet.cwprj", cwprjFile(key));
    expect(first.title).toBe("Premier jet");
    const second = await uploadCwprj(
      "v2.cwprj",
      cwprjFile(key, { designName: "Couronne de houx", thumbnail: await thumbnailImage() }),
      first.modelId,
    );
    expect(second).toMatchObject({ title: "Couronne de houx", titleUpdated: true });
    expect(
      (await prisma.model.findUniqueOrThrow({ where: { id: first.modelId } })).searchText,
    ).toContain("Couronne de houx");

    // Titre saisi par le membre, puis image personnelle : ni l'un ni l'autre remplacés.
    await saveModelDetails(deps, member, {
      modelId: first.modelId,
      title: "Ma couronne",
      description: "",
      categoryId: null,
      license: null,
      tags: [],
    });
    const photo = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#D9F0EF" },
    })
      .png()
      .toBuffer();
    const custom = await upload(member, "photo.png", photo, {
      kind: "PREVIEW",
      modelId: first.modelId,
      mime: "image/png",
    });
    expect(custom).toMatchObject({ ok: true, data: { previewCustom: true } });
    const third = await uploadCwprj(
      "v3.cwprj",
      cwprjFile(key, { designName: "Autre motif", thumbnail: await thumbnailImage() }),
      first.modelId,
    );
    expect(third).toMatchObject({
      title: "Ma couronne",
      titleUpdated: false,
      previewCustom: true,
      preview: { width: 300 },
    });
  });
});

describe("contrôles de la demande d'envoi", () => {
  it("refuse extension, double extension, taille et aperçu sans modèle", async () => {
    const ask = (fileName: string, size = 10, kind: "MODEL" | "PREVIEW" = "MODEL", mime = "") =>
      createUpload(deps, member, { kind, fileName, size, mime });
    expect(await ask("a.png")).toMatchObject({ error: { message: "errors.upload.extension" } });
    expect(await ask("a.exe.svg")).toMatchObject({
      error: { message: "errors.upload.doubleExtension", fields: { file: "doubleExtension" } },
    });
    expect(await ask("a.svg", 2 * 1024 * 1024)).toMatchObject({
      error: { message: "errors.upload.tooLarge" },
    });
    expect(await ask("a.png", 10, "PREVIEW", "image/png")).toMatchObject({
      error: { code: "VALIDATION" },
    });
  });

  it("la politique présignée borne la taille réelle", async () => {
    const ticket = await createUpload(deps, member, {
      kind: "MODEL",
      fileName: "a.svg",
      size: 10,
      mime: "",
    });
    if (!ticket.ok) throw new Error("ticket");
    const response = await postFile(ticket.data, Buffer.alloc(2 * 1024 * 1024, 32));
    expect(response.status).toBe(400);
    expect(await confirmUpload(deps, member, { uploadId: ticket.data.uploadId })).toMatchObject({
      ok: false,
      error: { message: "errors.upload.missing" },
    });
  });

  it("applique le quota (sauf administrateur) et refuse un compte banni", async () => {
    const limited = testDeps(prisma, { maxModels: 1 });
    deps = limited;
    await uploadSvg();
    expect(
      await createUpload(limited, member, { kind: "MODEL", fileName: "b.svg", size: 10, mime: "" }),
    ).toMatchObject({ error: { code: "FORBIDDEN", message: "errors.upload.quota" } });
    const admin = await createMember(prisma, { role: "ADMIN" });
    expect(
      (await createUpload(limited, admin, { kind: "MODEL", fileName: "b.svg", size: 10, mime: "" }))
        .ok,
    ).toBe(true);
    const banned = await createMember(prisma, { banned: true });
    expect(
      await createUpload(limited, banned, { kind: "MODEL", fileName: "b.svg", size: 10, mime: "" }),
    ).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await confirmUpload(limited, banned, { uploadId: "x" })).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("un envoi expiré, inconnu ou d'un autre membre est introuvable", async () => {
    const now = new Date();
    const ticket = await createUpload(deps, member, {
      kind: "MODEL",
      fileName: "a.svg",
      size: 10,
      mime: "",
    });
    if (!ticket.ok) throw new Error("ticket");
    const other = await createMember(prisma);
    expect(await confirmUpload(deps, other, { uploadId: ticket.data.uploadId })).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    const late = { ...deps, now: () => new Date(now.getTime() + 16 * 60 * 1000) };
    expect(await confirmUpload(late, member, { uploadId: ticket.data.uploadId })).toMatchObject({
      error: { message: "errors.upload.expired" },
    });
    expect((await prisma.upload.findFirstOrThrow()).status).toBe("ABANDONED");
  });
});

describe("remplacement du fichier et de l'aperçu", () => {
  it("remplace le fichier d'un brouillon et supprime l'ancien objet", async () => {
    const first = await uploadSvg();
    const before = await prisma.model.findUniqueOrThrow({ where: { id: first.modelId } });
    const second = await upload(member, "v2.svg", SIMPLE_SVG.replace("#C81E4B", "#0F7C7E"), {
      modelId: first.modelId,
    });
    expect(second).toMatchObject({ ok: true, data: { created: false, slug: "papillon-ajoure" } });
    const after = await prisma.model.findUniqueOrThrow({ where: { id: first.modelId } });
    expect(after.fileKey).not.toBe(before.fileKey);
    expect(after.fileName).toBe("v2.svg");
    expect(await objectExists(buckets().models, before.fileKey!)).toBe(false);
    expect(await objectExists(buckets().previews, `${before.previewKey}-lg.webp`)).toBe(false);

    // Brouillon SVG → CWPRJ : l'aperçu généré disparaît.
    const cwprj = await upload(member, "v3.cwprj", demoCwprj("v3"), { modelId: first.modelId });
    expect(cwprj).toMatchObject({ ok: true, data: { format: "CWPRJ", preview: null } });
  });

  it("image d'aperçu recadrée : prioritaire sur le rendu du SVG", async () => {
    const file = await uploadSvg();
    const photo = await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#FDE3E8" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const ticket = await createUpload(deps, member, {
      kind: "PREVIEW",
      fileName: "photo.jpg",
      size: photo.length,
      mime: "image/jpeg",
      modelId: file.modelId,
    });
    if (!ticket.ok) throw new Error("ticket");
    await postFile(ticket.data, photo);
    const result = await confirmUpload(deps, member, {
      uploadId: ticket.data.uploadId,
      crop: { x: 0, y: 0, width: 1, height: 0.5 },
    });
    // Orientation appliquée (600×900) puis recadrage de la moitié haute : 600×450.
    expect(result).toMatchObject({ ok: true, data: { previewCustom: true } });
    const preview = (result as { data: ConfirmedPreview }).data.preview;
    expect([preview.width, preview.height]).toEqual([600, 450]);

    // Un nouveau SVG ne remplace pas l'image choisie par le membre.
    const replaced = await upload(member, "v2.svg", SIMPLE_SVG, { modelId: file.modelId });
    expect(replaced).toMatchObject({
      ok: true,
      data: { previewCustom: true, preview: { width: 600 } },
    });
  });

  it("refuse une image dont la signature n'est pas PNG/JPEG/WebP", async () => {
    const file = await uploadSvg();
    const result = await upload(member, "faux.png", "GIF89a....", {
      kind: "PREVIEW",
      modelId: file.modelId,
      mime: "image/png",
    });
    expect(result).toMatchObject({ ok: false, error: { message: "errors.upload.imageType" } });
    const broken = await upload(member, "casse.png", Buffer.concat([PNG_1PX.subarray(0, 40)]), {
      kind: "PREVIEW",
      modelId: file.modelId,
      mime: "image/png",
    });
    expect(broken).toMatchObject({ ok: false, error: { message: "errors.upload.imageInvalid" } });
  });

  it("un modèle publié garde son format", async () => {
    const file = await readyToPublish();
    await publishModel(deps, member, file.modelId);
    expect(
      await createUpload(deps, member, {
        kind: "MODEL",
        fileName: "a.cwprj",
        size: 10,
        mime: "",
        modelId: file.modelId,
      }),
    ).toMatchObject({ error: { message: "errors.upload.formatChange" } });
  });
});

describe("informations, publication, dépublication", () => {
  it("enregistre informations, mots-clés et texte de recherche", async () => {
    const file = await readyToPublish();
    const model = await prisma.model.findUniqueOrThrow({
      where: { id: file.modelId },
      include: { tags: { include: { tag: true } } },
    });
    expect(model.tags.map((t) => t.tag.name).sort()).toEqual(["ete", "papillon"]);
    expect(model.searchText).toBe(
      `Papillon ajouré Un papillon léger papillon ete ${member.pseudo}`,
    );
    expect(await suggestTags(prisma, "pa")).toEqual(["papillon"]);
    expect(await suggestTags(prisma, "")).toEqual([]);
  });

  it("refuse une catégorie inconnue et un modèle publié incomplet", async () => {
    const file = await uploadSvg();
    const base = { modelId: file.modelId, title: "Titre", description: "", tags: [] };
    expect(
      await saveModelDetails(deps, member, { ...base, categoryId: "inconnue", license: null }),
    ).toMatchObject({ error: { fields: { categoryId: "category" } } });
    await prisma.model.update({ where: { id: file.modelId }, data: { status: "HIDDEN" } });
    expect(
      await saveModelDetails(deps, member, { ...base, categoryId: null, license: null }),
    ).toMatchObject({ error: { fields: { categoryId: "category", license: "license" } } });
  });

  it("publie (slug définitif), exige une adresse confirmée et un modèle complet", async () => {
    const file = await readyToPublish();
    const published = await publishModel(deps, member, file.modelId);
    expect(published).toEqual({ ok: true, data: { slug: "papillon-ajoure" } });
    const model = await prisma.model.findUniqueOrThrow({ where: { id: file.modelId } });
    expect(model.status).toBe("PUBLISHED");
    expect(model.publishedAt).not.toBeNull();
    // Idempotent
    expect(await publishModel(deps, member, file.modelId)).toEqual(published);

    // Dépublier puis republier garde le slug et la date de première publication.
    expect(await unpublishModel(deps, member, file.modelId)).toMatchObject({ ok: true });
    await saveModelDetails(deps, member, {
      modelId: file.modelId,
      title: "Nouveau titre",
      description: "",
      categoryId: model.categoryId,
      license: "CC0",
      tags: [],
    });
    expect(await publishModel(deps, member, file.modelId)).toEqual(published);
    expect(
      (await prisma.model.findUniqueOrThrow({ where: { id: file.modelId } })).publishedAt,
    ).toEqual(model.publishedAt);
    expect(await unpublishModel(deps, member, file.modelId)).toMatchObject({ ok: true });
    expect(await unpublishModel(deps, member, file.modelId)).toMatchObject({ ok: true });

    const unverified = await createMember(prisma, { verified: false });
    const draft = await uploadSvg(unverified, SIMPLE_SVG, "autre.svg");
    expect(await publishModel(deps, unverified, draft.modelId)).toMatchObject({
      error: { code: "FORBIDDEN", message: "errors.publish.unverified" },
    });

    const incomplete = await uploadSvg(member, SIMPLE_SVG, "incomplet.svg");
    expect(await publishModel(deps, member, incomplete.modelId)).toMatchObject({
      error: {
        message: "errors.publish.incomplete",
        fields: { categoryId: "category", license: "license" },
      },
    });

    await prisma.model.update({ where: { id: incomplete.modelId }, data: { status: "HIDDEN" } });
    expect(await publishModel(deps, member, incomplete.modelId)).toMatchObject({
      error: { message: "errors.publish.hidden" },
    });
  });

  it("un autre membre ne peut ni voir ni modifier le brouillon ; l'admin le peut", async () => {
    const file = await uploadSvg();
    const other = await createMember(prisma);
    expect(await getEditableModel(prisma, other, file.slug)).toBeNull();
    expect(await getEditableModel(prisma, null, file.slug)).toBeNull();
    expect(await publishModel(deps, other, file.modelId)).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(await deleteModel(deps, other, file.modelId)).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
    expect(await unpublishModel(deps, other, "inconnu")).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    const admin = await createMember(prisma, { role: "ADMIN" });
    expect(await getEditableModel(prisma, admin, file.slug)).toMatchObject({
      id: file.modelId,
      authorPseudo: member.pseudo,
      fileName: "papillon-ajoure.svg",
    });
  });
});

describe("suppression et purge", () => {
  it("supprime logiquement le modèle et efface ses objets", async () => {
    const file = await readyToPublish();
    const pending = await createUpload(deps, member, {
      kind: "PREVIEW",
      fileName: "p.png",
      size: PNG_1PX.length,
      mime: "image/png",
      modelId: file.modelId,
    });
    if (!pending.ok) throw new Error("ticket");
    await postFile(pending.data, PNG_1PX);
    const model = await prisma.model.findUniqueOrThrow({ where: { id: file.modelId } });

    expect(await deleteModel(deps, member, file.modelId)).toEqual({
      ok: true,
      data: { title: "Papillon ajouré" },
    });
    const deleted = await prisma.model.findUniqueOrThrow({ where: { id: file.modelId } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(await objectExists(buckets().models, model.fileKey!)).toBe(false);
    expect(await objectExists(buckets().previews, `${model.previewKey}-sm.webp`)).toBe(false);
    const upload = await prisma.upload.findFirstOrThrow({ where: { status: "ABANDONED" } });
    expect(await objectExists(buckets().previews, upload.key)).toBe(false);
    expect(await listMyModels(prisma, member.id)).toEqual([]);
    expect(await deleteModel(deps, member, file.modelId)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("liste « Mes modèles » du plus récent au plus ancien", async () => {
    await uploadSvg(member, SIMPLE_SVG, "premier.svg");
    await uploadSvg(member, SIMPLE_SVG, "second.svg");
    const mine = await listMyModels(prisma, member.id);
    expect(mine.map((m) => m.title)).toEqual(["Second", "Premier"]);
    expect(mine[0]).toMatchObject({ status: "DRAFT", format: "SVG", downloadCount: 0 });
    expect(mine[0]!.preview?.sm).toMatch(/-sm\.webp$/);
  });

  it("purge les envois expirés", async () => {
    const ticket = await createUpload(deps, member, {
      kind: "MODEL",
      fileName: "a.svg",
      size: 10,
      mime: "",
    });
    if (!ticket.ok) throw new Error("ticket");
    await postFile(ticket.data, "<svg/>");
    const preview = await uploadSvg();
    await createUpload(deps, member, {
      kind: "PREVIEW",
      fileName: "b.png",
      size: 10,
      mime: "image/png",
      modelId: preview.modelId,
    });
    expect(await cleanupExpiredUploads(deps)).toBe(0);
    const later = { ...deps, now: () => new Date(Date.now() + 60 * 60 * 1000) };
    expect(await cleanupExpiredUploads(later)).toBe(2);
    const record = await prisma.upload.findUniqueOrThrow({ where: { id: ticket.data.uploadId } });
    expect(record.status).toBe("ABANDONED");
    expect(await objectExists(buckets().models, record.key)).toBe(false);
  });
});
