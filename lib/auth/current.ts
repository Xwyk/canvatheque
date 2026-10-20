import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import {
  createSession,
  deleteSession,
  resolveSession,
  sessionCookieName,
  sessionCookieOptions,
  type ResolvedSession,
  type SessionUser,
} from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";

export function secureCookies(): boolean {
  return env().APP_URL.startsWith("https://");
}

/** Session de la requête courante (résolue une seule fois par rendu). */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  const token = (await cookies()).get(sessionCookieName(secureCookies()))?.value;
  return resolveSession(db(), token);
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

/** Page réservée aux membres : sinon redirection vers la connexion, retour prévu. */
export async function requireUserPage(returnTo: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(returnTo)}`);
  return user;
}

/** Page d'administration : visiteur → connexion ; membre non administrateur → 404 (rien à voir). */
export async function requireAdminPage(returnTo: string): Promise<SessionUser> {
  const user = await requireUserPage(returnTo);
  if (!can(user, "admin:access")) notFound();
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const secure = secureCookies();
  const { token, expires } = await createSession(db(), userId);
  (await cookies()).set(sessionCookieName(secure), token, sessionCookieOptions(secure, expires));
}

export async function endSession(): Promise<void> {
  const secure = secureCookies();
  const store = await cookies();
  const token = store.get(sessionCookieName(secure))?.value;
  if (token) await deleteSession(db(), token);
  store.delete(sessionCookieName(secure));
}
