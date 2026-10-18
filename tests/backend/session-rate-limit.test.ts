import { describe, expect, it } from "vitest";
import {
  SESSION_RENEW_BEFORE_MS,
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  resolveSession,
  revokeUserSessions,
} from "@/lib/auth/session";
import { MINUTE, consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";
import { prisma } from "@/tests/setup/backend";

const T0 = new Date("2026-10-18T10:00:00Z");

async function createUser(pseudo = "lucie") {
  return prisma.user.create({
    data: { pseudo, pseudoSlug: pseudo, email: `${pseudo}@exemple.fr`, tosAcceptedAt: T0 },
  });
}

describe("sessions en base", () => {
  it("stocke le hachage du jeton et résout l'utilisateur", async () => {
    const user = await createUser();
    const { token, expires } = await createSession(prisma, user.id, T0);
    expect(expires).toEqual(new Date(T0.getTime() + SESSION_TTL_MS));
    const row = await prisma.session.findFirstOrThrow();
    expect(row.sessionToken).toBe(hashToken(token));

    const session = await resolveSession(prisma, token, T0);
    expect(session).toMatchObject({
      renewed: false,
      user: { id: user.id, pseudo: "lucie", role: "MEMBER" },
    });
    expect(await resolveSession(prisma, undefined, T0)).toBeNull();
    expect(await resolveSession(prisma, "inconnu", T0)).toBeNull();
  });

  it("prolonge une session proche de l'expiration", async () => {
    const user = await createUser();
    const { token } = await createSession(prisma, user.id, T0);
    const later = new Date(T0.getTime() + SESSION_TTL_MS - SESSION_RENEW_BEFORE_MS + 1000);
    const session = await resolveSession(prisma, token, later);
    expect(session?.renewed).toBe(true);
    expect(session?.expires).toEqual(new Date(later.getTime() + SESSION_TTL_MS));
  });

  it("supprime une session expirée ou celle d'un compte banni", async () => {
    const user = await createUser();
    const expired = await createSession(prisma, user.id, T0);
    expect(
      await resolveSession(prisma, expired.token, new Date(T0.getTime() + SESSION_TTL_MS)),
    ).toBeNull();
    expect(await prisma.session.count()).toBe(0);

    const active = await createSession(prisma, user.id, T0);
    await prisma.user.update({ where: { id: user.id }, data: { bannedAt: T0 } });
    expect(await resolveSession(prisma, active.token, T0)).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it("supprime une session ou toutes celles d'un utilisateur", async () => {
    const user = await createUser();
    const other = await createUser("autre");
    const a = await createSession(prisma, user.id, T0);
    const b = await createSession(prisma, user.id, T0);
    await createSession(prisma, other.id, T0);

    await deleteSession(prisma, a.token);
    expect(await resolveSession(prisma, a.token, T0)).toBeNull();
    expect(await revokeUserSessions(prisma, user.id)).toBe(1);
    expect(await resolveSession(prisma, b.token, T0)).toBeNull();
    expect(await prisma.session.count()).toBe(1);
  });
});

describe("limitation de débit (PostgreSQL)", () => {
  const rule = { limit: 3, windowMs: 15 * MINUTE };

  it("autorise jusqu'à la limite puis bloque avec un délai", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(prisma, "test:a", rule, T0));
    expect(results.slice(0, 3).map((r) => r.ok)).toEqual([true, true, true]);
    expect(results[0]).toEqual({ ok: true, remaining: 2 });
    expect(results[3]).toEqual({ ok: false, retryAfter: 900 });
  });

  it("fenêtre glissante : le seau précédent pèse selon le temps écoulé", async () => {
    for (let i = 0; i < 3; i++) await consumeRateLimit(prisma, "test:b", rule, T0);
    // Début du seau suivant : le précédent compte encore presque entièrement.
    const early = new Date(T0.getTime() + 15 * MINUTE + 1000);
    const blocked = await consumeRateLimit(prisma, "test:b", rule, early);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfter).toBeGreaterThan(200);

    // Fin du seau suivant : le précédent ne pèse presque plus.
    const late = new Date(T0.getTime() + 29 * MINUTE);
    expect((await consumeRateLimit(prisma, "test:b", rule, late)).ok).toBe(true);
  });

  it("les clés sont indépendantes et réinitialisables", async () => {
    for (let i = 0; i < 4; i++) await consumeRateLimit(prisma, "test:c", rule, T0);
    expect((await consumeRateLimit(prisma, "test:d", rule, T0)).ok).toBe(true);
    await resetRateLimit(prisma, "test:c");
    expect((await consumeRateLimit(prisma, "test:c", rule, T0)).ok).toBe(true);
  });

  it("purge les seaux de plus d'un jour à l'ouverture d'un nouveau seau", async () => {
    await consumeRateLimit(prisma, "test:old", rule, new Date(T0.getTime() - 3 * 24 * 60 * MINUTE));
    await consumeRateLimit(prisma, "test:new", rule, T0);
    expect(await prisma.rateLimit.count({ where: { key: "test:old" } })).toBe(0);
    expect(await prisma.rateLimit.count({ where: { key: "test:new" } })).toBe(1);
  });

  it("reste atomique sous concurrence", async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit(prisma, "test:race", rule, T0)),
    );
    const row = await prisma.rateLimit.findFirstOrThrow({ where: { key: "test:race" } });
    expect(row.count).toBe(10);
  });
});
