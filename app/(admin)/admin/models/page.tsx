import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FormatBadge, ModelThumb, tintFor } from "@/components/model-card";
import {
  AdminSearch,
  AdminShell,
  EmptyState,
  FilterPills,
  listHref,
  ModelStatusBadge,
  Pagination,
} from "@/features/admin/components/admin-ui";
import { ModerationButton } from "@/features/admin/components/moderation-button";
import { firstValues, MODEL_FILTERS, modelListSchema } from "@/features/admin/schemas";
import { countOpenReports, listAdminModels } from "@/features/admin/service";
import { requireAdminPage } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("models"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const cell = "border-b-2 border-border px-4 py-3 text-left align-middle";

export default async function AdminModelsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/models");
  const t = await getTranslations("admin.models");
  const { q, status, page } = modelListSchema.parse(firstValues(await searchParams));
  const [openReports, models] = await Promise.all([
    countOpenReports(db()),
    listAdminModels(db(), { q, status, page }),
  ]);
  const href = (params: { q?: string; status?: string; page?: number }) =>
    listHref("/admin/models", {
      ...params,
      status: params.status === "all" ? undefined : params.status,
    });

  return (
    <AdminShell current="/admin/models" openReports={openReports} title={t("heading")}>
      <div className="flex flex-col gap-4">
        <AdminSearch
          action="/admin/models"
          label={t("search")}
          placeholder={t("searchPlaceholder")}
          submit={t("searchSubmit")}
          defaultValue={q}
          keep={status === "all" ? {} : { status }}
        />
        <FilterPills
          label={t("filtersLabel")}
          items={MODEL_FILTERS.map((value) => ({
            href: href({ q, status: value }),
            label: t(`filters.${value}`),
            active: value === status,
          }))}
        />
      </div>
      {models.items.length > 0 ? (
        <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
          <table className="w-full min-w-[820px] border-collapse text-[15px]">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr>
                {(["model", "author", "status", "reports", "actions"] as const).map((column) => (
                  <th key={column} scope="col" className={cn(cell, "font-extrabold")}>
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.items.map((model) => (
                <tr key={model.id}>
                  <th scope="row" className={cn(cell, "font-normal")}>
                    <div className="flex items-center gap-3">
                      <ModelThumb
                        preview={model.preview}
                        tint={tintFor(model.id)}
                        className="w-14 shrink-0 rounded-[12px]"
                      />
                      <div className="flex min-w-0 flex-col items-start gap-1">
                        <Link
                          href={`/models/${model.slug}`}
                          className="font-bold hover:text-primary"
                        >
                          {model.title}
                        </Link>
                        <FormatBadge format={model.format} className="px-2" />
                      </div>
                    </div>
                  </th>
                  <td className={cell}>{model.author.pseudo}</td>
                  <td className={cell}>
                    <div className="flex flex-col items-start gap-1">
                      <ModelStatusBadge status={model.status} />
                      {model.hiddenReason && (
                        <span className="max-w-[240px] text-[13px] text-text-secondary">
                          {model.hiddenReason}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={cell}>
                    {model.openReports > 0 ? (
                      <strong className="text-primary">
                        {t("openReports", { count: model.openReports })}
                      </strong>
                    ) : (
                      t("openReports", { count: 0 })
                    )}
                  </td>
                  <td className={cell}>
                    <div className="flex flex-wrap gap-2">
                      {model.status === "PUBLISHED" && (
                        <ModerationButton kind="hide" targetId={model.id} name={model.title} />
                      )}
                      {model.status === "HIDDEN" && (
                        <ModerationButton kind="unhide" targetId={model.id} name={model.title} />
                      )}
                      <ModerationButton kind="deleteModel" targetId={model.id} name={model.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>{t("empty")}</EmptyState>
      )}
      <Pagination
        page={models.page}
        hasNext={models.hasNext}
        href={(next) => href({ q, status, page: next })}
      />
    </AdminShell>
  );
}
