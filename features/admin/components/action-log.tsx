import { useFormatter, useTranslations } from "next-intl";
import type { AdminActionView } from "@/features/admin/service";

/** Entrées du journal : type, cible (libellé conservé), raison, auteur et date. */
export function ActionLog({ actions }: { actions: AdminActionView[] }) {
  const t = useTranslations("admin.log");
  const format = useFormatter();
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {actions.map((action) => (
        <li
          key={action.id}
          className="flex flex-col gap-1 rounded-[20px] border-2 border-border px-5 py-4"
        >
          <span className="font-bold">
            {t(`types.${action.type}`)}
            {action.label && <> · « {action.label} »</>}
          </span>
          {action.reason && (
            <span className="text-text-secondary">{t("reason", { reason: action.reason })}</span>
          )}
          <span className="text-[15px] text-muted-foreground">
            {t("entry", {
              admin: action.admin.pseudo,
              date: format.dateTime(action.createdAt, { dateStyle: "medium", timeStyle: "short" }),
            })}
          </span>
        </li>
      ))}
    </ol>
  );
}
