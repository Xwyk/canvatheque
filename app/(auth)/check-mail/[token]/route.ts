import { NextResponse } from "next/server";
import { verifyEmail } from "@/features/auth/service";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { mailer } from "@/lib/mail/mailer";
import { withRouteMetrics } from "@/lib/metrics";

export type CheckMailResult = "verified" | "alreadyVerified" | "emailChanged" | "invalid";

/**
 * Lien reçu par e-mail (confirmation d'adresse ou de nouvelle adresse). La mutation a lieu
 * ici, puis redirection vers une page sans jeton : l'en-tête de la page suivante reflète
 * déjà l'état confirmé et le jeton ne fuit pas via l'historique ou le Referer.
 */
export const GET = withRouteMetrics(
  "/check-mail/[token]",
  async (_request: Request, context: RouteContext<"/check-mail/[token]">) => {
    const { token } = await context.params;
    const appUrl = env().APP_URL;
    const result = await verifyEmail({ prisma: db(), mailer: mailer(), appUrl }, token);
    const status: CheckMailResult = result.ok ? result.data.kind : "invalid";
    const response = NextResponse.redirect(new URL(`/check-mail?result=${status}`, appUrl), 303);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  },
);
