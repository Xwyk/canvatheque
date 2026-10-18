import argon2 from "argon2";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { generateToken, hashToken } from "@/lib/tokens";

export const SYSTEM_USER = {
  pseudo: "Auteur supprimé",
  pseudoSlug: "auteur-supprime",
  email: "auteur-supprime@system.invalid",
} as const;

export const ADMIN_PSEUDO = "admin";
export const ADMIN_RESET_TTL_MS = 24 * 60 * 60 * 1000;

export type BootstrapOptions = {
  adminEmail: string;
  adminPassword?: string;
  appUrl: string;
  now?: Date;
};

export type BootstrapResult = {
  adminId: string;
  systemUserId: string;
  /** Lien de définition du mot de passe, émis tant que l'admin n'en a pas. */
  resetUrl?: string;
};

export function hashPassword(password: string): Promise<string> {
  // Paramètres OWASP pour argon2id : 19 Mio, 2 itérations, 1 fil.
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Garantit l'existence du compte administrateur et du compte système.
 * Idempotent : peut être appelé à chaque démarrage.
 */
export async function ensureCoreAccounts(
  prisma: PrismaClient,
  { adminEmail, adminPassword, appUrl, now = new Date() }: BootstrapOptions,
): Promise<BootstrapResult> {
  const email = adminEmail.trim().toLowerCase();

  const systemUser = await prisma.user.upsert({
    where: { pseudoSlug: SYSTEM_USER.pseudoSlug },
    update: {},
    create: { ...SYSTEM_USER, isSystem: true, tosAcceptedAt: now, emailVerifiedAt: now },
  });

  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    const pseudoTaken = await prisma.user.findUnique({ where: { pseudoSlug: ADMIN_PSEUDO } });
    const pseudo = pseudoTaken ? `${ADMIN_PSEUDO}-${now.getTime().toString(36)}` : ADMIN_PSEUDO;
    admin = await prisma.user.create({
      data: {
        email,
        pseudo,
        pseudoSlug: pseudo,
        role: "ADMIN",
        emailVerifiedAt: now,
        tosAcceptedAt: now,
      },
    });
  } else if (admin.role !== "ADMIN") {
    admin = await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  }

  if (!admin.passwordHash && adminPassword) {
    admin = await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(adminPassword) },
    });
  }

  let resetUrl: string | undefined;
  if (!admin.passwordHash) {
    const token = generateToken();
    await prisma.$transaction([
      prisma.emailToken.deleteMany({
        where: { userId: admin.id, type: "RESET_PASSWORD", usedAt: null },
      }),
      prisma.emailToken.create({
        data: {
          userId: admin.id,
          type: "RESET_PASSWORD",
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + ADMIN_RESET_TTL_MS),
        },
      }),
    ]);
    resetUrl = new URL(`/reset/${token}`, appUrl).toString();
  }

  return { adminId: admin.id, systemUserId: systemUser.id, resetUrl };
}
