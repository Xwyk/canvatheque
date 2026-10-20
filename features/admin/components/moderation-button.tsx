"use client";

import {
  Ban,
  CircleCheck,
  CircleSlash,
  Eye,
  EyeOff,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { FieldShell, inputClass } from "@/components/forms/text-field";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { pillButton } from "@/components/ui/pill-button";
import {
  adminDeleteModelAction,
  banMemberAction,
  dismissReportAction,
  hideModelAction,
  promoteMemberAction,
  resolveReportAction,
  unbanMemberAction,
  unhideModelAction,
} from "@/features/admin/actions";
import { REASON_MAX_LENGTH } from "@/features/admin/limits";
import type { Result } from "@/lib/result";
import { cn } from "@/lib/utils";

type Run = (id: string, reason: string, option: boolean) => Promise<Result<unknown>>;

const KINDS = {
  hide: {
    icon: EyeOff,
    danger: false,
    run: (modelId, reason) => hideModelAction({ modelId, reason }),
  },
  unhide: {
    icon: Eye,
    danger: false,
    run: (modelId, reason) => unhideModelAction({ modelId, reason }),
  },
  deleteModel: {
    icon: Trash2,
    danger: true,
    run: (modelId, reason) => adminDeleteModelAction({ modelId, reason }),
  },
  resolveHide: {
    icon: EyeOff,
    danger: false,
    run: (reportId, reason) => resolveReportAction({ reportId, reason, modelAction: "HIDE" }),
  },
  resolveDelete: {
    icon: Trash2,
    danger: true,
    run: (reportId, reason) => resolveReportAction({ reportId, reason, modelAction: "DELETE" }),
  },
  resolveNone: {
    icon: CircleCheck,
    danger: false,
    run: (reportId, reason) => resolveReportAction({ reportId, reason, modelAction: "NONE" }),
  },
  dismiss: {
    icon: CircleSlash,
    danger: false,
    run: (reportId, reason) => dismissReportAction({ reportId, reason }),
  },
  ban: {
    icon: Ban,
    danger: true,
    option: true,
    run: (userId, reason, hideModels) => banMemberAction({ userId, reason, hideModels }),
  },
  unban: {
    icon: Undo2,
    danger: false,
    run: (userId, reason) => unbanMemberAction({ userId, reason }),
  },
  promote: {
    icon: ShieldCheck,
    danger: false,
    run: (userId, reason) => promoteMemberAction({ userId, reason }),
  },
} satisfies Record<string, { icon: LucideIcon; danger: boolean; option?: boolean; run: Run }>;

export type ModerationKind = keyof typeof KINDS;

/**
 * Bouton d'une action de modération : modale de confirmation avec raison obligatoire
 * (journalisée, transmise au membre quand il est prévenu), puis rafraîchissement de la page.
 */
export function ModerationButton({
  kind,
  targetId,
  name,
  redirectTo,
  className,
}: {
  kind: ModerationKind;
  /** Modèle, signalement ou membre visé. */
  targetId: string;
  /** Titre du modèle ou pseudo du membre (textes de la modale). */
  name: string;
  /** Page à ouvrir après l'action (sinon la page courante est rafraîchie). */
  redirectTo?: string;
  className?: string;
}) {
  const t = useTranslations(`admin.moderation.${kind}`);
  const tShared = useTranslations("admin.moderation");
  const tRoot = useTranslations();
  const router = useRouter();
  const reasonId = useId();
  const config: { icon: LucideIcon; danger: boolean; option?: boolean; run: Run } = KINDS[kind];
  const Icon = config.icon;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [option, setOption] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setReason("");
    setOption(false);
    setError(undefined);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await config.run(targetId, reason, option);
      if (!result.ok) {
        if (result.error.fields?.reason) {
          setError(result.error.fields.reason);
          return;
        }
        const key = result.error.message;
        toast.error(tRoot.has(key) ? tRoot(key) : tRoot("errors.generic"));
        close();
        return;
      }
      toast.success(t("success", { name }));
      close();
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  };

  const danger =
    "border-destructive bg-destructive text-white hover:border-destructive hover:bg-destructive/90 hover:text-white dark:text-background dark:hover:text-background";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={pillButton({
          variant: "soft",
          size: "sm",
          className: cn(config.danger && "text-destructive hover:text-destructive", className),
        })}
      >
        <Icon aria-hidden="true" className="size-5" />
        {t("button")}
      </button>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-[28px] p-6 shadow-dialog sm:max-w-[500px] md:p-8"
        >
          <button
            type="button"
            onClick={close}
            aria-label={tShared("close")}
            className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full hover:bg-muted"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
          <div className="flex flex-col gap-2 pr-9">
            <DialogTitle className="text-2xl leading-tight font-bold">
              {t("title", { name })}
            </DialogTitle>
            <DialogDescription className="text-base text-text-secondary">
              {t("description")}
            </DialogDescription>
          </div>
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <FieldShell
              id={reasonId}
              label={tShared("reason")}
              hint={tShared("reasonHint")}
              error={error}
            >
              {(describedBy) => (
                <textarea
                  id={reasonId}
                  name="reason"
                  required
                  value={reason}
                  maxLength={REASON_MAX_LENGTH}
                  rows={3}
                  onChange={(event) => setReason(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy}
                  className={cn(inputClass, "h-auto min-h-24 py-3")}
                />
              )}
            </FieldShell>
            {config.option && (
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={option}
                  onChange={(event) => setOption(event.target.checked)}
                  className="mt-0.5 size-[22px] shrink-0 accent-primary"
                />
                <span>{t("option")}</span>
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className={pillButton({ variant: "outline", size: "lg" })}
              >
                {tShared("cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className={pillButton({
                  size: "lg",
                  className: config.danger ? danger : undefined,
                })}
              >
                {t("confirm")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
