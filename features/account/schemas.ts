import { DELETE_MODES } from "@/features/account/modes";
import { z } from "@/lib/validation";

export { DELETE_MODES };

/** Suppression du compte : mot de passe actuel et sort des modèles. Messages = `errors.field.*`. */
export const deleteAccountSchema = z.object({
  password: z.string({ error: "required" }).min(1, "required").max(128, "passwordLong"),
  mode: z.enum(DELETE_MODES, { error: "deleteMode" }),
});
