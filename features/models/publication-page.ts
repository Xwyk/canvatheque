import type { WizardCategory } from "@/features/models/components/publish-wizard";
import { countActiveModels } from "@/features/models/service";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/** Données communes des pages « Publier » et « Modifier ». */
export async function wizardContext(user: SessionUser) {
  const config = env();
  const prisma = db();
  const [categories, modelCount] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    countActiveModels(prisma, user.id),
  ]);
  return {
    categories: categories satisfies WizardCategory[],
    authorPseudo: user.pseudo,
    emailVerified: user.emailVerifiedAt !== null || user.role === "ADMIN",
    maxFileMb: config.MAX_FILE_SIZE_MB,
    maxModels: config.MAX_MODELS_PER_USER,
    quotaReached: user.role !== "ADMIN" && modelCount >= config.MAX_MODELS_PER_USER,
  };
}
