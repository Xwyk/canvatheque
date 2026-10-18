/**
 * Modèles de démonstration : SVG générés ici (aucun fichier tiers, aucun droit à céder),
 * passés par le même pipeline que les envois des membres (nettoyage, rasterisation,
 * aperçus WebP). Quelques `.cwprj` fictifs (contenu opaque) ont un aperçu fourni.
 */
import { createHash } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";
import { SHAPES } from "@/components/shapes";
import { buildSearchText } from "@/features/models/service";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { License } from "@/lib/generated/prisma/enums";
import { buildPreviewSet, rasterizeSvg } from "@/lib/images/preview";
import { sha256 } from "@/lib/security/file-validation";
import { sanitizeSvg } from "@/lib/security/svg-sanitizer";
import { slugify } from "@/lib/slug";
import { writeObject } from "@/lib/storage/objects";
import { previewObjectKey } from "@/lib/storage/previews";
import { normalizeTags } from "@/lib/tags";

export type SeedStorage = { s3: S3Client; buckets: { models: string; previews: string } };

type Motif = "mandala" | "flower" | "snowflake" | "box" | "border" | keyof typeof SHAPES;

type DemoModel = {
  title: string;
  category: number;
  author: number;
  motif: Motif;
  color: string;
  tags: string[];
  license: License;
  format: "SVG" | "CWPRJ";
  description: string;
};

const PALETTE = ["#C81E4B", "#0F7C7E", "#5B3FA6", "#F5B82E", "#221F3A"];

const D = (
  title: string,
  category: number,
  author: number,
  motif: Motif,
  tags: string[],
  license: License,
  format: "SVG" | "CWPRJ" = "SVG",
  description = "",
): DemoModel => ({
  title,
  category,
  author,
  motif,
  color: PALETTE[(title.length + category) % PALETTE.length]!,
  tags,
  license,
  format,
  description:
    description ||
    `Modèle **${title.toLowerCase()}** prêt à découper.\n\n- Papier 160 à 250 g/m²\n- Lame réglée sur 4 ou 5\n- Testé sur ScanNCut SDX`,
});

/** 30 modèles répartis sur les 9 catégories et les 5 membres de démonstration. */
export const DEMO_MODELS: DemoModel[] = [
  D("Carte cœur ajourée", 0, 1, "heart", ["coeur", "carte de voeux"], "CC_BY"),
  D("Faire-part papillon", 0, 0, "butterfly", ["papillon", "mariage"], "CC_BY_NC"),
  D("Carte étoile de Noël", 0, 2, "star", ["noel", "etoile", "carte de voeux"], "CC0"),
  D("Marque-page feuille", 0, 4, "leaf", ["feuille", "marque page"], "CC_BY_SA"),
  D("Mandala floral", 1, 1, "mandala", ["mandala", "fleur"], "CC_BY"),
  D("Guirlande d'étoiles", 1, 2, "star", ["etoile", "guirlande", "noel"], "CC0"),
  D("Flocon géant", 1, 0, "snowflake", ["noel", "flocon", "hiver"], "CC_BY_NC_SA"),
  D("Rosace de fenêtre", 1, 3, "mandala", ["mandala", "vitrail"], "PERSONAL_USE", "CWPRJ"),
  D("Fleur pour t-shirt", 2, 4, "flower", ["fleur", "flex", "textile"], "CC_BY"),
  D("Cœur thermocollant", 2, 1, "heart", ["coeur", "flex", "textile"], "CC_BY_NC"),
  D("Écusson étoile", 2, 3, "star", ["etoile", "textile"], "CC0", "CWPRJ"),
  D("Bordure festonnée", 3, 0, "border", ["anniversaire", "bordure"], "CC_BY"),
  D("Papillons de table", 3, 1, "butterfly", ["papillon", "mariage", "deco de table"], "CC_BY_SA"),
  D("Étoiles d'anniversaire", 3, 2, "star", ["anniversaire", "etoile"], "CC0"),
  D("Couronne de fleurs", 3, 4, "flower", ["fleur", "mariage"], "CC_BY_NC"),
  D("Mobile papillons", 4, 4, "butterfly", ["papillon", "chambre d enfant"], "CC_BY"),
  D("Étoiles phosphorescentes", 4, 2, "star", ["etoile", "chambre d enfant"], "PERSONAL_USE"),
  D("Cœurs à colorier", 4, 0, "heart", ["coeur", "coloriage"], "CC0"),
  D("Feuilles d'automne", 5, 4, "leaf", ["feuille", "automne"], "CC_BY"),
  D("Papillon monarque", 5, 4, "butterfly", ["papillon", "nature"], "CC_BY_NC_SA"),
  D("Bouquet des champs", 5, 1, "flower", ["fleur", "nature"], "CC_BY_SA"),
  D("Herbier de feuilles", 5, 2, "leaf", ["feuille", "herbier"], "CC0", "CWPRJ"),
  D("Cadre mandala", 6, 1, "mandala", ["mandala", "cadre"], "CC_BY"),
  D("Ornement d'étoiles", 6, 3, "star", ["etoile", "ornement"], "CC_BY_NC"),
  D("Boîte à dragées", 7, 3, "box", ["boite", "mariage"], "CC_BY"),
  D("Boîte cadeau étoilée", 7, 3, "box", ["boite", "noel", "cadeau"], "CC_BY_NC"),
  D("Pochette cœur", 7, 1, "heart", ["coeur", "emballage"], "CC_BY_SA", "CWPRJ"),
  D("Flocons en série", 8, 0, "snowflake", ["flocon", "hiver"], "CC0"),
  D("Feuilles en frise", 8, 4, "leaf", ["feuille", "frise"], "PERSONAL_USE"),
  D("Fleurs à superposer", 8, 2, "flower", ["fleur", "3d"], "CC_BY"),
];

function rotated(count: number, element: (angle: number) => string): string {
  return Array.from({ length: count }, (_, i) => element((360 / count) * i)).join("");
}

/** SVG de démonstration (formes pleines sur 200 × 200, sans texte). */
export function demoSvg(motif: Motif, color: string): string {
  let body: string;
  switch (motif) {
    case "mandala":
      body =
        rotated(
          12,
          (a) => `<ellipse cx="100" cy="45" rx="12" ry="34" transform="rotate(${a} 100 100)"/>`,
        ) + `<circle cx="100" cy="100" r="22" fill="#FFFFFF"/><circle cx="100" cy="100" r="12"/>`;
      break;
    case "flower":
      body =
        rotated(8, (a) => `<circle cx="100" cy="52" r="30" transform="rotate(${a} 100 100)"/>`) +
        `<circle cx="100" cy="100" r="26" fill="#F5B82E"/>`;
      break;
    case "snowflake":
      body = `<g stroke="${color}" stroke-width="10" stroke-linecap="round" fill="none">${rotated(
        6,
        (a) =>
          `<path d="M100 100 V22 M100 50 L80 34 M100 50 L120 34" transform="rotate(${a} 100 100)"/>`,
      )}</g>`;
      break;
    case "box":
      body =
        `<rect x="60" y="60" width="80" height="80"/><g opacity="0.55"><rect x="60" y="20" width="80" height="40" rx="6"/>` +
        `<rect x="60" y="140" width="80" height="40" rx="6"/><rect x="20" y="60" width="40" height="80" rx="6"/>` +
        `<rect x="140" y="60" width="40" height="80" rx="6"/></g>`;
      break;
    case "border":
      body =
        Array.from({ length: 6 }, (_, i) => `<circle cx="${25 + i * 30}" cy="100" r="22"/>`).join(
          "",
        ) + `<rect x="3" y="100" width="194" height="40"/>`;
      break;
    default:
      body = `<path d="${SHAPES[motif]}" transform="scale(2)"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><g fill="${color}">${body}</g></svg>`;
}

/** Contenu opaque déterministe pour les `.cwprj` fictifs (multiple de 16 octets, comme un vrai). */
export function demoCwprj(seed: string): Buffer {
  const blocks: Buffer[] = [];
  for (let i = 0; i < 256; i += 1) {
    blocks.push(createHash("sha256").update(`${seed}:${i}`).digest().subarray(0, 16));
  }
  return Buffer.concat(blocks);
}

/** Crée les modèles absents (idempotent : un modèle existant n'est pas regénéré). */
export async function seedModels(
  prisma: PrismaClient,
  storage: SeedStorage,
  authors: { id: string; pseudo: string }[],
  now: Date = new Date(),
): Promise<number> {
  const categories = await prisma.category.findMany({ orderBy: { order: "asc" } });
  let created = 0;
  for (const [index, demo] of DEMO_MODELS.entries()) {
    const slug = slugify(demo.title);
    if (await prisma.model.findUnique({ where: { slug }, select: { id: true } })) continue;
    const author = authors[demo.author % authors.length]!;
    const category = categories[demo.category]!;
    const tags = normalizeTags(demo.tags);

    const clean = sanitizeSvg(Buffer.from(demoSvg(demo.motif, demo.color)), 1024 * 1024);
    if (!clean.ok) throw new Error(`SVG de démonstration invalide : ${demo.title}`);
    const previews = await buildPreviewSet(await rasterizeSvg(clean.svg));
    const body = demo.format === "SVG" ? Buffer.from(clean.svg) : demoCwprj(slug);
    const extension = demo.format === "SVG" ? "svg" : "cwprj";
    const publishedAt = new Date(now.getTime() - (DEMO_MODELS.length - index) * 36 * 3600 * 1000);

    const model = await prisma.model.create({
      data: {
        slug,
        title: demo.title,
        description: demo.description,
        format: demo.format,
        status: "DRAFT",
        license: demo.license,
        categoryId: category.id,
        authorId: author.id,
        searchText: buildSearchText(demo.title, demo.description, tags, author.pseudo),
        createdAt: publishedAt,
        tags: {
          create: await Promise.all(
            tags.map(async (name) => ({
              tag: {
                connect: {
                  id: (await prisma.tag.upsert({ where: { name }, update: {}, create: { name } }))
                    .id,
                },
              },
            })),
          ),
        },
      },
    });

    const fileKey = `models/seed-${slug}.${extension}`;
    await writeObject(
      storage.s3,
      storage.buckets.models,
      fileKey,
      body,
      demo.format === "SVG" ? "image/svg+xml" : "application/octet-stream",
    );
    const previewKey = `${model.id}/seed`;
    for (const variant of previews.variants) {
      await writeObject(
        storage.s3,
        storage.buckets.previews,
        previewObjectKey(previewKey, variant.suffix),
        variant.buffer,
        "image/webp",
        "public, max-age=31536000, immutable",
      );
    }
    await prisma.model.update({
      where: { id: model.id },
      data: {
        status: "PUBLISHED",
        publishedAt,
        fileKey,
        fileName: `${slug}.${extension}`,
        fileSize: body.length,
        fileChecksum: sha256(body),
        previewKey,
        previewWidth: previews.width,
        previewHeight: previews.height,
        previewCustom: demo.format === "CWPRJ",
      },
    });
    created += 1;
  }
  return created;
}
