import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Role } from "@/lib/generated/prisma/enums";
import { generateToken, hashToken } from "@/lib/tokens";

/**
 * Sessions en base (ADR-002, repli « module maison » prévu par le plan) :
 * jeton aléatoire de 256 bits dans un cookie httpOnly ; seul son SHA-256 est stocké
 * (colonne Session.sessionToken). Révocation immédiate en supprimant les lignes.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Une session utilisée à moins de 15 jours de son expiration est prolongée. */
export const SESSION_RENEW_BEFORE_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  pseudo: string;
  pseudoSlug: string;
  email: string;
  role: Role;
  emailVerifiedAt: Date | null;
  bannedAt: Date | null;
};

export type ResolvedSession = {
  sessionId: string;
  expires: Date;
  user: SessionUser;
  /** Vrai si l'expiration vient d'être repoussée (le cookie doit être réémis). */
  renewed: boolean;
};

export function sessionCookieName(secure: boolean): string {
  // Le préfixe __Host- impose Secure, Path=/ et l'absence de Domain.
  return secure ? "__Host-canvatheque.session" : "canvatheque.session";
}

export function sessionCookieOptions(secure: boolean, expires: Date) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ token: string; expires: Date }> {
  const token = generateToken();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  await prisma.session.create({ data: { sessionToken: hashToken(token), userId, expires } });
  return { token, expires };
}

const USER_SELECT = {
  id: true,
  pseudo: true,
  pseudoSlug: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  bannedAt: true,
} as const;

/** Résout un jeton de cookie ; supprime la session si elle est expirée ou si le compte est banni. */
export async function resolveSession(
  prisma: PrismaClient,
  token: string | undefined,
  now: Date = new Date(),
): Promise<ResolvedSession | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: hashToken(token) },
    select: { id: true, expires: true, user: { select: USER_SELECT } },
  });
  if (!session) return null;
  if (session.expires <= now || session.user.bannedAt) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  let expires = session.expires;
  let renewed = false;
  if (expires.getTime() - now.getTime() < SESSION_RENEW_BEFORE_MS) {
    expires = new Date(now.getTime() + SESSION_TTL_MS);
    await prisma.session.update({ where: { id: session.id }, data: { expires } });
    renewed = true;
  }
  return { sessionId: session.id, expires, user: session.user, renewed };
}

export async function deleteSession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { sessionToken: hashToken(token) } });
}

/** Révoque toutes les sessions d'un utilisateur, sauf éventuellement la session courante. */
export async function revokeUserSessions(
  prisma: PrismaClient,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
  return count;
}
