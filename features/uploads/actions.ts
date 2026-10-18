"use server";

import { currentActor, publicationDeps, rateLimited } from "@/features/models/deps";
import { confirmUploadSchema, createUploadSchema } from "@/features/uploads/schemas";
import * as service from "@/features/uploads/service";
import { fieldErrors } from "@/features/auth/schemas";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { HOUR, rateLimitKey } from "@/lib/rate-limit";
import { fail, type Result } from "@/lib/result";

/** Étape 1 de l'envoi : formulaire présigné vers MinIO (limite horaire par membre). */
export async function createUploadAction(input: unknown): Promise<Result<service.UploadTicket>> {
  const actor = await currentActor();
  if (!actor.ok) return actor;
  const parsed = createUploadSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "errors.validation", { fields: fieldErrors(parsed.error) });
  }
  const blocked = await rateLimited(rateLimitKey("upload", actor.data.id), {
    limit: env().RATE_LIMIT_UPLOAD_PER_HOUR,
    windowMs: HOUR,
  });
  if (blocked) return blocked;
  return service.createUpload(publicationDeps(), actor.data, parsed.data);
}

/** Étape 2 : vérification et traitement de l'objet reçu. */
export async function confirmUploadAction(
  input: unknown,
): Promise<Result<service.ConfirmedFile | service.ConfirmedPreview>> {
  const actor = await currentActor();
  if (!actor.ok) return actor;
  const parsed = confirmUploadSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "errors.validation", { fields: fieldErrors(parsed.error) });
  }
  try {
    return await service.confirmUpload(publicationDeps(), actor.data, parsed.data);
  } catch (error) {
    logger.error({ event: "upload_confirm_failed", err: error }, "Échec du traitement d'un envoi");
    return fail("INTERNAL", "errors.generic");
  }
}
