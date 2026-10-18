"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { PasswordField } from "@/components/forms/password-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { signUpAction } from "@/features/auth/actions";
import { IDLE } from "@/features/auth/form-state";

export function SignUpForm({
  redirectTo,
  submitLabel,
}: {
  redirectTo?: string;
  submitLabel?: string;
}) {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors.field");
  const [state, action] = useActionState(signUpAction, IDLE);

  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="redirectTo" value={redirectTo ?? "/"} />
      <TextField
        name="pseudo"
        label={t("pseudo")}
        autoComplete="username"
        required
        minLength={3}
        maxLength={30}
        defaultValue={state.values?.pseudo}
        hint={t("pseudoHint")}
        error={state.fields?.pseudo}
      />
      <TextField
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        placeholder={t("emailPlaceholder")}
        required
        maxLength={254}
        defaultValue={state.values?.email}
        error={state.fields?.email}
      />
      <PasswordField
        name="password"
        label={t("password")}
        autoComplete="new-password"
        withStrength
        error={state.fields?.password}
      />
      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-start gap-3 text-[15px] text-text-secondary">
          <input
            type="checkbox"
            name="acceptTos"
            required
            aria-invalid={state.fields?.acceptTos ? true : undefined}
            aria-describedby={state.fields?.acceptTos ? "tos-error" : undefined}
            className="mt-px size-[22px] shrink-0 accent-primary"
          />
          <span>
            {t.rich("acceptTos", {
              terms: (chunks) => (
                <Link href="/legal/terms" className="font-semibold text-foreground underline">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/legal/privacy" className="font-semibold text-foreground underline">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {state.fields?.acceptTos && (
          <p id="tos-error" className="m-0 text-sm font-semibold text-destructive">
            {tErrors(state.fields.acceptTos)}
          </p>
        )}
      </div>
      <SubmitButton>{submitLabel ?? t("signUpSubmit")}</SubmitButton>
    </form>
  );
}
