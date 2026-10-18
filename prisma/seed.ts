/**
 * Données de démonstration, idempotentes (upsert) : relancer le seed ne duplique rien.
 * Étape 0 : catégories de référence, comptes de base, membres et tags.
 * Les modèles (fichiers et aperçus dans MinIO) s'ajoutent avec l'étape Publication.
 */
import { fileURLToPath } from "node:url";
import { ensureCoreAccounts } from "@/features/account/bootstrap";
import { CATEGORIES, ensureCategories } from "@/features/catalog/categories";
import { hashPassword } from "@/lib/auth/password";
import { createPrismaClient } from "@/lib/db";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { slugify } from "@/lib/slug";
import { generateToken } from "@/lib/tokens";

export const DEMO_MEMBERS = [
  { pseudo: "lucie.m", bio: "Cartes et faire-part, surtout pour les fêtes de famille." },
  { pseudo: "atelier-noa", bio: "Papeterie florale et cœurs en tous genres." },
  { pseudo: "mamie-ciseaux", bio: "Trente ans de papier découpé, maintenant à la ScanNCut." },
  { pseudo: "julien.d", bio: "Boîtes, emballages et petits volumes." },
  { pseudo: "claire_cuts", bio: "Animaux, poissons et papillons." },
] as const;

export const DEMO_TAGS = [
  "mandala",
  "carte de voeux",
  "boite",
  "anniversaire",
  "papillon",
  "coeur",
  "etoile",
  "noel",
  "fleur",
  "lettrage",
] as const;

export type SeedOptions = {
  adminEmail: string;
  adminPassword?: string;
  memberPassword: string;
  appUrl: string;
};

export { CATEGORIES };

export async function seed(prisma: PrismaClient, options: SeedOptions) {
  await ensureCategories(prisma);

  const core = await ensureCoreAccounts(prisma, {
    adminEmail: options.adminEmail,
    adminPassword: options.adminPassword,
    appUrl: options.appUrl,
  });

  const passwordHash = await hashPassword(options.memberPassword);
  const now = new Date();
  for (const member of DEMO_MEMBERS) {
    const pseudoSlug = slugify(member.pseudo);
    await prisma.user.upsert({
      where: { pseudoSlug },
      update: { bio: member.bio },
      create: {
        pseudo: member.pseudo,
        pseudoSlug,
        email: `${pseudoSlug}@demo.canvatheque.test`,
        passwordHash,
        bio: member.bio,
        emailVerifiedAt: now,
        tosAcceptedAt: now,
      },
    });
  }

  for (const name of DEMO_TAGS) {
    await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
  }

  return core;
}

async function main() {
  const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, SEED_MEMBER_PASSWORD, APP_URL } = process.env;
  if (!DATABASE_URL || !ADMIN_EMAIL) {
    throw new Error("DATABASE_URL et ADMIN_EMAIL sont requis pour le seed");
  }
  // Sans SEED_MEMBER_PASSWORD, mot de passe aléatoire (affiché) : jamais de secret en dur.
  const memberPassword = SEED_MEMBER_PASSWORD || generateToken().slice(0, 20);
  const prisma = createPrismaClient(DATABASE_URL);
  try {
    const result = await seed(prisma, {
      adminEmail: ADMIN_EMAIL,
      adminPassword: ADMIN_PASSWORD || undefined,
      memberPassword,
      appUrl: APP_URL ?? "http://localhost:3000",
    });
    process.stdout.write(
      `Seed terminé : ${CATEGORIES.length} catégories, ${DEMO_MEMBERS.length} membres, ${DEMO_TAGS.length} tags.\n`,
    );
    if (!SEED_MEMBER_PASSWORD) {
      process.stdout.write(
        `Mot de passe des nouveaux membres de démonstration : ${memberPassword}\n`,
      );
    }
    if (result.resetUrl) {
      process.stdout.write(`Définir le mot de passe administrateur : ${result.resetUrl}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  });
}
