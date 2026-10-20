import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ActionLog } from "@/features/admin/components/action-log";
import {
  AdminShell,
  EmptyState,
  FilterPills,
  listHref,
  Pagination,
} from "@/features/admin/components/admin-ui";
import { ACTION_TYPES, actionListSchema, firstValues } from "@/features/admin/schemas";
import { countOpenReports, listAdminActions } from "@/features/admin/service";
import { requireAdminPage } from "@/lib/auth/current";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("log"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminLogPage({ searchParams }: Props) {
  await requireAdminPage("/admin/log");
  const t = await getTranslations("admin");
  const { type, page } = actionListSchema.parse(firstValues(await searchParams));
  const [openReports, actions] = await Promise.all([
    countOpenReports(db()),
    listAdminActions(db(), { type, page }),
  ]);
  const href = (params: { type?: string; page?: number }) => listHref("/admin/log", params);

  return (
    <AdminShell current="/admin/log" openReports={openReports} title={t("log.heading")}>
      <FilterPills
        label={t("log.filtersLabel")}
        items={[
          { href: href({}), label: t("log.all"), active: type === undefined },
          ...ACTION_TYPES.map((value) => ({
            href: href({ type: value }),
            label: t(`log.types.${value}`),
            active: value === type,
          })),
        ]}
      />
      {actions.items.length > 0 ? (
        <ActionLog actions={actions.items} />
      ) : (
        <EmptyState>{t("log.empty")}</EmptyState>
      )}
      <Pagination
        page={actions.page}
        hasNext={actions.hasNext}
        href={(page) => href({ type, page })}
      />
    </AdminShell>
  );
}
