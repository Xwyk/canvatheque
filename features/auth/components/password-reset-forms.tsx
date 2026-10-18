"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { PasswordField } from "@/components/forms/password-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/forms/text-field";
import { requestPasswordResetAction, resetPasswordAction } from "@/features/auth/actions";
import { IDLE } from "@/features/auth/form-state";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(requestPasswordResetAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      {state.status !== "success" && (
        <>
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
          <SubmitButton>{t("forgotSubmit")}</SubmitButton>
        </>
      )}
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(resetPasswordAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordField
        name="password"
        label={t("newPassword")}
        autoComplete="new-password"
        withStrength
        error={state.fields?.password}
      />
      <SubmitButton>{t("resetSubmit")}</SubmitButton>
    </form>
  );
}
