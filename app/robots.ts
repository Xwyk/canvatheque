import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/features/catalog/seo";

// APP_URL lue à la requête, jamais au build.
export const dynamic = "force-dynamic";

/** Pages privées, formulaires et API exclus de l'indexation. */
const DISALLOWED_PATHS = [
  "/api/",
  // « /me » seul couvrirait aussi « /members/… ».
  "/me$",
  "/me/",
  "/publish",
  "/models/*/edit",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset/",
  "/check-mail",
  "/admin",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
