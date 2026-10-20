import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ModelThumb, tintFor } from "@/components/model-card";
import { ModelStatusBadge } from "@/features/admin/components/admin-ui";
import { ModerationButton } from "@/features/admin/components/moderation-button";
import type { ReportView } from "@/features/admin/service";

/** Carte d'un signalement : modèle visé, motif, précisions, puis actions ou issue. */
export function ReportCard({
  report,
  compact = false,
  headingLevel = 2,
}: {
  report: ReportView;
  compact?: boolean;
  /** 2 dans la file des signalements, 3 sous une section du tableau de bord. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const t = useTranslations("admin.reports");
  const tReasons = useTranslations("reports.reasons");
  const format = useFormatter();
  const { model } = report;
  const date = (value: Date) => format.dateTime(value, { dateStyle: "long" });
  const others = report.status === "OPEN" ? model.openReports - 1 : 0;
  const titleId = `report-${report.id}`;

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-[28px] border-2 border-border bg-card p-5 md:flex-row md:p-6"
    >
      <ModelThumb
        preview={model.preview}
        tint={tintFor(model.id)}
        className="w-24 shrink-0 self-start rounded-[16px] md:w-28"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="inline-flex min-h-7 items-center rounded-full bg-primary px-3 text-[13px] text-primary-foreground">
            {tReasons(`${report.reason}.label`)}
          </strong>
          {model.deleted ? (
            <span className="text-[13px] font-bold text-destructive">{t("modelDeleted")}</span>
          ) : (
            model.status !== "PUBLISHED" && <ModelStatusBadge status={model.status} />
          )}
        </div>
        <Heading id={titleId} className="m-0 text-xl font-bold break-words">
          {model.deleted ? (
            model.title
          ) : (
            <Link href={`/models/${model.slug}`} className="hover:text-primary">
              {model.title}
            </Link>
          )}
        </Heading>
        <p className="m-0 text-[15px] text-muted-foreground">
          {t("author", { pseudo: model.author.pseudo })} ·{" "}
          {t("by", { pseudo: report.reporter.pseudo, date: date(report.createdAt) })}
        </p>
        {!compact && (
          <p className="m-0 whitespace-pre-line text-text-secondary">
            {report.details ?? <em>{t("noDetails")}</em>}
          </p>
        )}
        {others > 0 && (
          <p className="m-0 text-[15px] font-bold text-primary">{t("others", { count: others })}</p>
        )}

        {report.status === "OPEN"
          ? !compact && (
              <div className="flex flex-wrap gap-2 pt-1">
                {!model.deleted && model.status === "PUBLISHED" && (
                  <ModerationButton kind="resolveHide" targetId={report.id} name={model.title} />
                )}
                {!model.deleted && (
                  <ModerationButton kind="resolveDelete" targetId={report.id} name={model.title} />
                )}
                {(model.deleted || model.status !== "PUBLISHED") && (
                  <ModerationButton kind="resolveNone" targetId={report.id} name={model.title} />
                )}
                <ModerationButton kind="dismiss" targetId={report.id} name={model.title} />
              </div>
            )
          : report.resolvedAt && (
              <div className="flex flex-col gap-1 rounded-[16px] bg-muted px-4 py-3 text-[15px]">
                <strong>
                  {t("closedBy", {
                    status: t(`status.${report.status}`),
                    pseudo: report.resolvedBy?.pseudo ?? "—",
                    date: date(report.resolvedAt),
                  })}
                </strong>
                {report.resolution && (
                  <span className="text-text-secondary">
                    {t("resolution", { reason: report.resolution })}
                  </span>
                )}
              </div>
            )}
      </div>
    </article>
  );
}
