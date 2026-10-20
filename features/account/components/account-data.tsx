"use client";

import { Download, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormMessage } from "@/components/forms/form-message";
import { PasswordField } from "@/components/forms/password-field";
import { pillButton } from "@/components/ui/pill-button";
import { deleteAccountAction } from "@/features/account/actions";
import { DELETE_MODES } from "@/features/account/modes";
import { IDLE } from "@/features/auth/form-state";
import { cn } from "@/lib/utils";

/** Export JSON des données (lien direct : le navigateur enregistre le fichier). */
export function ExportData() {
  const t = useTranslations("accountData");
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="m-0 text-text-secondary">{t("exportText")}</p>
      <a
        href="/api/me/export"
        download
        rel="nofollow"
        className={pillButton({ variant: "outline", size: "md" })}
      >
        <Download aria-hidden="true" className="size-5" />
        {t("exportButton")}
      </a>
    </div>
  );
}

const danger =
  "border-destructive bg-destructive text-white hover:border-destructive hover:bg-destructive/90 hover:text-white dark:text-background dark:hover:text-background";

/**
 * Suppression du compte : sort des modèles (transfert à « Auteur supprimé » ou suppression),
 * mot de passe, puis confirmation dans une modale avant l'envoi.
 */
export function DeleteAccountForm({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("accountData");
  const tAuth = useTranslations("auth");
  const tField = useTranslations("errors.field");
  const [state, action, pending] = useActionState(deleteAccountAction, IDLE);
  const [mode, setMode] = useState(state.values?.mode ?? "TRANSFER");
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  if (isAdmin) return <p className="m-0 text-text-secondary">{t("adminText")}</p>;

  return (
    <form ref={form} action={action} className="flex flex-col gap-[18px]" noValidate>
      <p className="m-0 text-text-secondary">{t("deleteText")}</p>
      <FormMessage state={state} />
      <fieldset
        className="m-0 flex flex-col gap-2 border-0 p-0"
        aria-describedby={state.fields?.mode ? "delete-mode-error" : undefined}
      >
        <legend className="mb-2 text-[15px] font-bold">{t("modeLegend")}</legend>
        {DELETE_MODES.map((value) => (
          <label
            key={value}
            className={cn(
              "grid min-h-11 cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-[14px] border-2 px-4 py-3",
              mode === value ? "border-ink bg-muted" : "border-border hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="row-span-2 mt-1 size-5 shrink-0 accent-primary"
            />
            <span className="font-bold">{t(`modes.${value}.label`)}</span>
            <span className="text-sm text-text-secondary">{t(`modes.${value}.hint`)}</span>
          </label>
        ))}
        {state.fields?.mode && (
          <p id="delete-mode-error" className="m-0 text-sm font-semibold text-destructive">
            {tField(state.fields.mode)}
          </p>
        )}
      </fieldset>
      <PasswordField
        name="password"
        label={tAuth("currentPassword")}
        autoComplete="current-password"
        error={state.fields?.password}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(true)}
        className={pillButton({ size: "md", className: cn("self-start", danger) })}
      >
        <Trash2 aria-hidden="true" className="size-5" />
        {t("deleteButton")}
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t(`confirm.${mode === "DELETE_ALL" ? "DELETE_ALL" : "TRANSFER"}`)}
        confirmLabel={t("confirmButton")}
        cancelLabel={t("cancel")}
        pending={pending}
        onConfirm={() => {
          setConfirming(false);
          form.current?.requestSubmit();
        }}
      />
    </form>
  );
}
