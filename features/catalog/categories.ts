import type { PrismaClient } from "@/lib/generated/prisma/client";
import { slugify } from "@/lib/slug";

/** Catégories de référence (ordre et couleurs des maquettes ; icônes Lucide). */
export const CATEGORIES = [
  { name: "Cartes et papeterie", icon: "mail", color: "#C81E4B" },
  { name: "Décoration", icon: "flower-2", color: "#F5B82E" },
  { name: "Vêtements et textile", icon: "shirt", color: "#0F7C7E" },
  { name: "Fêtes et événements", icon: "party-popper", color: "#5B3FA6" },
  { name: "Enfants", icon: "baby", color: "#C81E4B" },
  { name: "Nature et animaux", icon: "leaf", color: "#0F7C7E" },
  { name: "Lettrages et typographie", icon: "type", color: "#F5B82E" },
  { name: "Boîtes et emballages", icon: "package", color: "#5B3FA6" },
  { name: "Autres", icon: "shapes", color: "#221F3A" },
] as const;

/** Crée ou met à jour les catégories de référence (idempotent, exécuté au démarrage). */
export async function ensureCategories(prisma: PrismaClient): Promise<void> {
  for (const [order, category] of CATEGORIES.entries()) {
    const slug = slugify(category.name);
    const data = { name: category.name, icon: category.icon, color: category.color, order };
    await prisma.category.upsert({ where: { slug }, update: data, create: { slug, ...data } });
  }
}
