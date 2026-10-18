"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { PasswordField } from "@/components/forms/password-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { FieldShell, TextField, inputClass } from "@/components/forms/text-field";
import {
  changePasswordAction,
  requestEmailChangeAction,
  updateProfileAction,
} from "@/features/auth/actions";
import { IDLE } from "@/features/auth/form-state";
import { cn } from "@/lib/utils";

export function ProfileForm({ bio, website }: { bio: string; website: string }) {
  const t = useTranslations("settings");
  const [state, action] = useActionState(updateProfileAction, IDLE);
  const values = state.values ?? { bio, website };
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <FieldShell id="settings-bio" label={t("bio")} hint={t("bioHint")} error={state.fields?.bio}>
        {(describedBy) => (
          <textarea
            id="settings-bio"
            name="bio"
            rows={4}
            maxLength={300}
            defaultValue={values.bio}
            aria-invalid={state.fields?.bio ? true : undefined}
            aria-describedby={describedBy}
            className={cn(inputClass, "h-auto min-h-28 py-3")}
          />
        )}
      </FieldShell>
      <TextField
        name="website"
        type="url"
        inputMode="url"
        label={t("website")}
        placeholder={t("websitePlaceholder")}
        maxLength={200}
        defaultValue={values.website}
        error={state.fields?.website}
      />
      <SubmitButton variant="outline" className="self-start text-base">
        {t("profileSubmit")}
      </SubmitButton>
    </form>
  );
}

export function EmailForm() {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const [state, action] = useActionState(requestEmailChangeAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <TextField
        name="newEmail"
        type="email"
        label={t("newEmail")}
        autoComplete="email"
        required
        maxLength={254}
        defaultValue={state.status === "success" ? "" : state.values?.newEmail}
        error={state.fields?.newEmail}
      />
      <PasswordField
        name="password"
        label={tAuth("currentPassword")}
        autoComplete="current-password"
        error={state.fields?.password}
      />
      <SubmitButton variant="outline" className="self-start text-base">
        {t("emailSubmit")}
      </SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const [state, action] = useActionState(changePasswordAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-[18px]" noValidate>
      <FormMessage state={state} />
      <PasswordField
        name="currentPassword"
        label={tAuth("currentPassword")}
        autoComplete="current-password"
        error={state.fields?.currentPassword}
      />
      <PasswordField
        name="newPassword"
        label={tAuth("newPassword")}
        autoComplete="new-password"
        withStrength
        error={state.fields?.newPassword}
      />
      <SubmitButton variant="outline" className="self-start text-base">
        {t("passwordSubmit")}
      </SubmitButton>
    </form>
  );
}
