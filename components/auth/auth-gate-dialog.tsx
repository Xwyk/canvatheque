"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GateState } from "@/components/auth/auth-gate";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { cn } from "@/lib/utils";

/** Contenu de la modale visiteur, chargé à la première ouverture (components/auth/auth-gate). */
export default function AuthGateDialog({
  state,
  onTab,
  onClose,
}: {
  state: GateState | null;
  onTab: (tab: "signUp" | "signIn") => void;
  onClose: () => void;
}) {
  const t = useTranslations("authGate");
  const reason = state?.reason ?? "download";
  const download = reason === "download";
  const tabs = [
    { key: "signIn" as const, label: t("tabSignIn") },
    { key: "signUp" as const, label: t("tabSignUp") },
  ];
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-6 overflow-y-auto rounded-[28px] p-6 shadow-dialog sm:max-w-[500px] md:px-10 md:pt-10 md:pb-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        <div className="flex flex-col gap-2 pr-9">
          <DialogTitle className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.01em] md:text-[30px]">
            {t(`${reason}Title`)}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground">
            {t(`${reason}Subtitle`)}
          </DialogDescription>
        </div>

        <div
          role="tablist"
          aria-label={t("tabsLabel")}
          className="flex gap-1 rounded-full bg-muted p-1"
        >
          {tabs.map((tab) => {
            const selected = state?.tab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`gate-tab-${tab.key}`}
                aria-selected={selected}
                aria-controls="gate-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => onTab(tab.key)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    const next = tab.key === "signIn" ? "signUp" : "signIn";
                    onTab(next);
                    document.getElementById(`gate-tab-${next}`)?.focus();
                  }
                }}
                className={cn(
                  "min-h-11 flex-1 rounded-full text-base",
                  selected
                    ? "bg-card font-extrabold text-foreground shadow-[0_1px_4px_rgb(34_31_58/0.18)]"
                    : "font-bold text-text-secondary hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {state && (
          <div role="tabpanel" id="gate-panel" aria-labelledby={`gate-tab-${state.tab}`}>
            {state.tab === "signUp" ? (
              <SignUpForm
                redirectTo={state.redirectTo}
                submitLabel={download ? t("signUpAndDownload") : undefined}
              />
            ) : (
              <SignInForm
                redirectTo={state.redirectTo}
                submitLabel={download ? t("signInAndDownload") : undefined}
              />
            )}
          </div>
        )}

        <p className="m-0 text-center text-[15px] text-muted-foreground">
          {state?.tab === "signIn" ? t("noAccount") : t("haveAccount")}{" "}
          <button
            type="button"
            onClick={() => onTab(state?.tab === "signIn" ? "signUp" : "signIn")}
            className="min-h-11 font-bold text-foreground underline"
          >
            {state?.tab === "signIn" ? t("switchToSignUp") : t("switchToSignIn")}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
