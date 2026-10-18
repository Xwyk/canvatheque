import { describe, expect, it } from "vitest";
import { can, type Action, type Actor, type Resource } from "@/lib/permissions";

const NOW = new Date("2026-10-18T10:00:00Z");
const member: Actor = { id: "m1", role: "MEMBER", bannedAt: null, emailVerifiedAt: NOW };
const unverified: Actor = { id: "m2", role: "MEMBER", bannedAt: null, emailVerifiedAt: null };
const banned: Actor = { id: "m3", role: "MEMBER", bannedAt: NOW, emailVerifiedAt: NOW };
const admin: Actor = { id: "a1", role: "ADMIN", bannedAt: null, emailVerifiedAt: NOW };
const bannedAdmin: Actor = { id: "a2", role: "ADMIN", bannedAt: NOW, emailVerifiedAt: NOW };

const ACTORS = { visitor: null, member, unverified, banned, admin, bannedAdmin } as const;
type ActorName = keyof typeof ACTORS;

const ALL_ACTIONS: Action[] = [
  "model:view",
  "model:download",
  "model:create",
  "model:publish",
  "model:update",
  "model:delete",
  "model:hide",
  "favorite:toggle",
  "comment:create",
  "comment:delete",
  "report:create",
  "user:ban",
  "user:promote",
  "report:resolve",
  "admin:access",
  "account:update",
];

/**
 * Matrice attendue sans ressource particulière (ressource « étrangère » : ni propriétaire,
 * ni auteur du modèle). Chaque cellule est testée.
 */
const EXPECTED: Record<Action, ActorName[]> = {
  "model:view": ["visitor", "member", "unverified", "banned", "admin", "bannedAdmin"],
  "model:download": ["member", "unverified", "admin"],
  "model:create": ["member", "unverified", "admin"],
  "model:publish": ["admin"],
  "model:update": ["admin"],
  "model:delete": ["admin"],
  "model:hide": ["admin"],
  "favorite:toggle": ["member", "unverified", "admin"],
  "comment:create": ["member", "unverified", "admin"],
  "comment:delete": ["admin"],
  "report:create": ["member", "unverified", "admin"],
  "user:ban": ["admin"],
  "user:promote": ["admin"],
  "report:resolve": ["admin"],
  "admin:access": ["admin"],
  "account:update": ["member", "unverified", "admin"],
};

const FOREIGN: Resource = {
  ownerId: "someone-else",
  modelOwnerId: "someone-else",
  targetUserId: "x",
};

describe("can : matrice rôle × action", () => {
  for (const action of ALL_ACTIONS) {
    for (const [name, actor] of Object.entries(ACTORS) as [ActorName, Actor][]) {
      const allowed = EXPECTED[action].includes(name);
      it(`${name} ${allowed ? "peut" : "ne peut pas"} ${action}`, () => {
        expect(can(actor, action, FOREIGN)).toBe(allowed);
      });
    }
  }
});

describe("can : règles dépendant de la ressource", () => {
  it("le propriétaire modifie et supprime son modèle", () => {
    expect(can(member, "model:update", { ownerId: "m1" })).toBe(true);
    expect(can(member, "model:delete", { ownerId: "m1" })).toBe(true);
    expect(can(banned, "model:update", { ownerId: "m3" })).toBe(false);
  });

  it("publier exige d'être propriétaire et d'avoir confirmé son adresse", () => {
    expect(can(member, "model:publish", { ownerId: "m1" })).toBe(true);
    expect(can(unverified, "model:publish", { ownerId: "m2" })).toBe(false);
    expect(can(admin, "model:publish", { ownerId: "m1" })).toBe(true);
  });

  it("applique le quota de modèles, dont l'administrateur est exempté", () => {
    expect(can(member, "model:create", { modelCount: 199, maxModels: 200 })).toBe(true);
    expect(can(member, "model:create", { modelCount: 200, maxModels: 200 })).toBe(false);
    expect(can(admin, "model:create", { modelCount: 500, maxModels: 200 })).toBe(true);
  });

  it("brouillons et modèles masqués : visibles du propriétaire et des administrateurs", () => {
    for (const status of ["DRAFT", "HIDDEN"] as const) {
      expect(can(null, "model:view", { status, ownerId: "m1" })).toBe(false);
      expect(can(member, "model:view", { status, ownerId: "m1" })).toBe(true);
      expect(can(unverified, "model:view", { status, ownerId: "m1" })).toBe(false);
      expect(can(admin, "model:view", { status, ownerId: "m1" })).toBe(true);
    }
    expect(can(null, "model:view", { status: "PUBLISHED" })).toBe(true);
  });

  it("un commentaire est supprimable par son auteur, l'auteur du modèle ou un administrateur", () => {
    expect(can(member, "comment:delete", { ownerId: "m1" })).toBe(true);
    expect(can(member, "comment:delete", { ownerId: "x", modelOwnerId: "m1" })).toBe(true);
    expect(can(unverified, "comment:delete", { ownerId: "x", modelOwnerId: "y" })).toBe(false);
  });

  it("un administrateur n'agit pas sur son propre compte", () => {
    expect(can(admin, "user:ban", { targetUserId: "a1" })).toBe(false);
    expect(can(admin, "user:promote", { targetUserId: "a1" })).toBe(false);
    expect(can(admin, "user:ban", { targetUserId: "m1" })).toBe(true);
  });
});
