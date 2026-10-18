"use client";

import { MailWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { resendVerificationAction } from "@/features/auth/actions";
import { IDLE } from "@/features/auth/form-state";

/** Bandeau pour un membre dont l'adresse n'est pas confirmée (publication bloquée). */
export function UnverifiedBanner({ email }: { email: string }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(resendVerificationAction, IDLE);
  return (
    <div className="bg-highlight-soft">
      <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-[15px] text-foreground">
        <MailWarning aria-hidden="true" className="size-5 shrink-0" />
        <p className="m-0 min-w-0 flex-[1_1_320px]">{t("auth.unverified.text", { email })}</p>
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center rounded-full px-3 font-bold underline disabled:opacity-60"
          >
            {t("auth.unverified.resend")}
          </button>
        </form>
        <p role="status" className="m-0 basis-full text-sm font-semibold empty:hidden">
          {state.message ? t(state.message, state.messageValues) : ""}
        </p>
      </div>
    </div>
  );
}
