import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormState } from "@/features/auth/form-state";
import { cn } from "@/lib/utils";

/** Message global d'un formulaire : alerte pour une erreur, statut pour un succès. */
export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  const t = useTranslations();
  if (state.status === "idle" || !state.message) return null;
  const isError = state.status === "error";
  const Icon = isError ? CircleAlert : CircleCheck;
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "m-0 flex items-start gap-2.5 rounded-[14px] px-4 py-3 text-[15px] font-semibold",
        isError ? "bg-destructive/10 text-destructive" : "bg-success-soft text-foreground",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 size-5 shrink-0", isError ? "text-destructive" : "text-success")}
      />
      <span>{t(state.message, state.messageValues)}</span>
    </p>
  );
}
