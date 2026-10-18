"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { PasswordStrength } from "@/components/forms/password-strength";
import { FieldShell, inputClass } from "@/components/forms/text-field";

type PasswordFieldProps = {
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  /** Affiche la jauge de robustesse (création de mot de passe). */
  withStrength?: boolean;
  required?: boolean;
};

export function PasswordField({
  name,
  label,
  autoComplete,
  error,
  withStrength = false,
  required = true,
}: PasswordFieldProps) {
  const t = useTranslations("auth");
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");

  return (
    <FieldShell
      id={id}
      label={label}
      error={error}
      after={withStrength ? <PasswordStrength password={value} /> : undefined}
    >
      {(describedBy) => (
        <div className="relative">
          <input
            id={id}
            name={name}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            required={required}
            maxLength={128}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${inputClass} pr-14`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t("hidePassword") : t("showPassword")}
            aria-pressed={visible}
            className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-xl text-text-secondary hover:bg-muted"
          >
            {visible ? (
              <EyeOff aria-hidden="true" className="size-5" />
            ) : (
              <Eye aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
      )}
    </FieldShell>
  );
}
