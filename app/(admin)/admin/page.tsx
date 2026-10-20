import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AdminShell, EmptyState } from "@/features/admin/components/admin-ui";
import { ActionLog } from "@/features/admin/components/action-log";
import { ReportCard } from "@/features/admin/components/report-card";
import { getAdminDashboard } from "@/features/admin/service";
import { requireAdminPage } from "@/lib/auth/current";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("dashboard"), robots: { index: false } };
}

const sectionTitle = "m-0 text-2xl font-bold";
const moreLink = "inline-flex min-h-11 items-center font-bold text-primary hover:underline";

export default async function AdminDashboardPage() {
  await requireAdminPage("/admin");
  const t = await getTranslations("admin");
  const { counts, reports, actions } = await getAdminDashboard(db());

  const stats = [
    { href: "/admin/reports", main: t("dashboard.openReports", { count: counts.openReports }) },
    {
      href: "/admin/members",
      main: t("dashboard.members", { count: counts.members }),
      sub: t("dashboard.bannedMembers", { count: counts.bannedMembers }),
    },
    {
      href: "/admin/models",
      main: t("dashboard.publishedModels", { count: counts.publishedModels }),
      sub: t("dashboard.hiddenModels", { count: counts.hiddenModels }),
    },
  ];

  return (
    <AdminShell current="/admin" openReports={counts.openReports} title={t("nav.dashboard")}>
      <section aria-label={t("dashboard.stats")}>
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
          {stats.map((stat) => (
            <li key={stat.href}>
              <Link
                href={stat.href}
                className="flex h-full flex-col gap-1 rounded-[28px] bg-muted px-6 py-5 hover:bg-border"
              >
                <strong className="text-xl">{stat.main}</strong>
                {stat.sub && <span className="text-text-secondary">{stat.sub}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="oldest-reports" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="oldest-reports" className={sectionTitle}>
              {t("dashboard.oldestReports")}
            </h2>
            <Link href="/admin/reports" className={moreLink}>
              {t("dashboard.allReports")}
            </Link>
          </div>
          {reports.length > 0 ? (
            reports.map((report) => (
              <ReportCard key={report.id} report={report} compact headingLevel={3} />
            ))
          ) : (
            <EmptyState>{t("dashboard.noReports")}</EmptyState>
          )}
        </section>

        <section aria-labelledby="last-actions" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="last-actions" className={sectionTitle}>
              {t("dashboard.lastActions")}
            </h2>
            <Link href="/admin/log" className={moreLink}>
              {t("dashboard.fullLog")}
            </Link>
          </div>
          {actions.length > 0 ? (
            <ActionLog actions={actions} />
          ) : (
            <EmptyState>{t("dashboard.noActions")}</EmptyState>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
