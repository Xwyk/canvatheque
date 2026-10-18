"use server";

import { redirect } from "next/navigation";
import { fieldErrors } from "@/features/auth/schemas";
import { currentActor, publicationDeps } from "@/features/models/deps";
import {
  modelDetailsSchema,
  modelIdSchema,
  publishSchema,
  tagQuerySchema,
} from "@/features/models/schemas";
import * as service from "@/features/models/service";
import { db } from "@/lib/db";
import { setFlash } from "@/lib/flash";
import { fail, ok, type Result } from "@/lib/result";
import { normalizeTag } from "@/lib/tags";

const invalid = (error: Parameters<typeof fieldErrors>[0]) =>
  fail("VALIDATION", "errors.validation", { fields: fieldErrors(error) });

/** Enregistre les informations d'un brouillon (ou d'un modèle publié). */
export async function saveModelAction(
  input: unknown,
): Promise<Result<{ updatedAt: string; tags: string[] }>> {
  const actor = await currentActor();
  if (!actor.ok) return actor;
  const parsed = modelDetailsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return service.saveModelDetails(publicationDeps(), actor.data, parsed.data);
}

/** Publie le modèle puis renvoie vers « Mes modèles » avec un message. */
export async function publishModelAction(input: unknown): Promise<Result<{ slug: string }>> {
  const actor = await currentActor();
  if (!actor.ok) return actor;
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await service.publishModel(publicationDeps(), actor.data, parsed.data.modelId);
  if (!result.ok) return result;
  await setFlash({ key: "auth.flash.modelPublished" });
  redirect("/me");
}

export async function unpublishModelAction(input: unknown): Promise<Result<{ slug: string }>> {
  const actor = await currentActor();
  if (!actor.ok) return actor;
  const parsed = modelIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return service.unpublishModel(publicationDeps(), actor.data, parsed.data.modelId);
}

export async function deleteModelAction(input: unknown): Promise<Result<{ title: string }>> {
  const actor = await currentActor();
  if (!actor.ok) return actor;
  const parsed = modelIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return service.deleteModel(publicationDeps(), actor.data, parsed.data.modelId);
}

export async function suggestTagsAction(query: unknown): Promise<Result<string[]>> {
  const actor = await currentActor();
  if (!actor.ok) return actor;
  const parsed = tagQuerySchema.safeParse(query);
  if (!parsed.success) return ok([]);
  return ok(await service.suggestTags(db(), normalizeTag(parsed.data)));
}
