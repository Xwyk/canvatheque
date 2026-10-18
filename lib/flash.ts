import { cookies } from "next/headers";
import { FLASH_COOKIE, type Flash } from "@/lib/flash-shared";

/**
 * Message affiché une fois après une redirection (toast). Cookie lisible par le client,
 * qui l'efface aussitôt (components/flash-toast.tsx) ; il ne contient qu'une clé de
 * traduction et ses paramètres.
 */
export async function setFlash(flash: Flash): Promise<void> {
  // Next encode lui-même la valeur du cookie (encodeURIComponent).
  (await cookies()).set(FLASH_COOKIE, JSON.stringify(flash), {
    path: "/",
    sameSite: "lax",
    maxAge: 60,
  });
}
