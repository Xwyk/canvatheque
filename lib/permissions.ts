import type { ModelStatus, Role } from "@/lib/generated/prisma/enums";

export type Actor = {
  id: string;
  role: Role;
  bannedAt: Date | null;
  emailVerifiedAt: Date | null;
} | null;

export type Action =
  | "model:view"
  | "model:download"
  | "model:create"
  | "model:publish"
  | "model:update"
  | "model:delete"
  | "model:hide"
  | "favorite:toggle"
  | "comment:create"
  | "comment:delete"
  | "report:create"
  | "user:ban"
  | "user:promote"
  | "report:resolve"
  | "admin:access"
  | "account:update";

export type Resource = {
  /** Auteur de la ressource (modèle ou commentaire). */
  ownerId?: string;
  /** Auteur du modèle portant un commentaire. */
  modelOwnerId?: string;
  status?: ModelStatus;
  /** Nombre de modèles déjà publiés ou en brouillon par l'acteur (quota). */
  modelCount?: number;
  maxModels?: number;
  /** Cible d'une action sur un utilisateur. */
  targetUserId?: string;
};

const ADMIN_ACTIONS: ReadonlySet<Action> = new Set([
  "model:hide",
  "user:ban",
  "user:promote",
  "report:resolve",
  "admin:access",
]);

const MEMBER_ACTIONS: ReadonlySet<Action> = new Set([
  "model:download",
  "favorite:toggle",
  "comment:create",
  "report:create",
  "account:update",
]);

/** Contrôle d'accès central, fonction pure (testée sur toutes les combinaisons). */
export function can(actor: Actor, action: Action, resource: Resource = {}): boolean {
  if (action === "model:view") return canView(actor, resource);

  if (!actor || actor.bannedAt) return false;
  const isAdmin = actor.role === "ADMIN";
  const isOwner = resource.ownerId !== undefined && resource.ownerId === actor.id;

  if (ADMIN_ACTIONS.has(action)) {
    // Un administrateur n'agit pas sur son propre compte (bannissement, promotion).
    return isAdmin && resource.targetUserId !== actor.id;
  }
  if (MEMBER_ACTIONS.has(action)) return true;

  switch (action) {
    case "model:create":
      return isAdmin || withinQuota(resource);
    case "model:publish":
      if (!isOwner && !isAdmin) return false;
      return isAdmin || actor.emailVerifiedAt !== null;
    case "model:update":
    case "model:delete":
      return isOwner || isAdmin;
    case "comment:delete":
      return isOwner || isAdmin || resource.modelOwnerId === actor.id;
    default:
      return false;
  }
}

function canView(actor: Actor, resource: Resource): boolean {
  if (resource.status === undefined || resource.status === "PUBLISHED") return true;
  if (!actor) return false;
  return actor.role === "ADMIN" || resource.ownerId === actor.id;
}

function withinQuota({ modelCount, maxModels }: Resource): boolean {
  if (modelCount === undefined || maxModels === undefined) return true;
  return modelCount < maxModels;
}
