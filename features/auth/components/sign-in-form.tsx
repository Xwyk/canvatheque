"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { PasswordField } from "@/components/forms/password-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { signInAction } from "@/features/auth/actions";
import { IDLE } from "@/features/auth/form-state";

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(signInAction, IDLE);

  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="redirectTo" value={redirectTo ?? "/"} />
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
        autoComplete="current-password"
        error={state.fields?.password}
      />
      <Link
        href="/forgot-password"
        className="-mt-2 self-start text-[15px] font-bold text-foreground underline"
      >
        {t("forgotLink")}
      </Link>
      <SubmitButton>{t("signInSubmit")}</SubmitButton>
    </form>
  );
}
