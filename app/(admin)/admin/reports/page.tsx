import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  AdminShell,
  EmptyState,
  FilterPills,
  listHref,
  Pagination,
} from "@/features/admin/components/admin-ui";
import { ReportCard } from "@/features/admin/components/report-card";
import { firstValues, REPORT_TABS, reportListSchema } from "@/features/admin/schemas";
import { countOpenReports, listReports } from "@/features/admin/service";
import { requireAdminPage } from "@/lib/auth/current";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("reports"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminReportsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/reports");
  const t = await getTranslations("admin");
  const { tab, page } = reportListSchema.parse(firstValues(await searchParams));
  const [openReports, reports] = await Promise.all([
    countOpenReports(db()),
    listReports(db(), { tab, page }),
  ]);
  const href = (params: { tab?: string; page?: number }) =>
    listHref("/admin/reports", {
      tab: params.tab === "open" ? undefined : params.tab,
      page: params.page,
    });

  return (
    <AdminShell current="/admin/reports" openReports={openReports} title={t("reports.heading")}>
      <FilterPills
        label={t("reports.tabsLabel")}
        items={REPORT_TABS.map((value) => ({
          href: href({ tab: value }),
          label: t(value === "open" ? "reports.tabOpen" : "reports.tabClosed"),
          active: value === tab,
        }))}
      />
      {reports.items.length > 0 ? (
        <div className="flex flex-col gap-4">
          {reports.items.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <EmptyState>{t(tab === "open" ? "reports.emptyOpen" : "reports.emptyClosed")}</EmptyState>
      )}
      <Pagination
        page={reports.page}
        hasNext={reports.hasNext}
        href={(page) => href({ tab, page })}
      />
    </AdminShell>
  );
}
