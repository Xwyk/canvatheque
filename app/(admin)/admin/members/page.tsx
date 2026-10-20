import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  AdminSearch,
  AdminShell,
  EmptyState,
  FilterPills,
  listHref,
  Pagination,
} from "@/features/admin/components/admin-ui";
import { ModerationButton } from "@/features/admin/components/moderation-button";
import { firstValues, MEMBER_FILTERS, memberListSchema } from "@/features/admin/schemas";
import { countOpenReports, listMembers, type MemberView } from "@/features/admin/service";
import { requireAdminPage } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("members"), robots: { index: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const cell = "border-b-2 border-border px-4 py-3 text-left align-top";
const badge =
  "inline-flex min-h-7 items-center rounded-full px-3 text-[13px] font-bold whitespace-nowrap";

export default async function AdminMembersPage({ searchParams }: Props) {
  const admin = await requireAdminPage("/admin/members");
  const t = await getTranslations("admin.members");
  const format = await getFormatter();
  const { q, filter, page } = memberListSchema.parse(firstValues(await searchParams));
  const [openReports, members] = await Promise.all([
    countOpenReports(db()),
    listMembers(db(), { q, filter, page }),
  ]);
  const href = (params: { q?: string; filter?: string; page?: number }) =>
    listHref("/admin/members", {
      ...params,
      filter: params.filter === "all" ? undefined : params.filter,
    });

  const status = (member: MemberView) => (
    <div className="flex flex-col items-start gap-1">
      {member.role === "ADMIN" && (
        <span className={cn(badge, "bg-info text-white dark:text-background")}>{t("admin")}</span>
      )}
      {member.bannedAt ? (
        <span className={cn(badge, "bg-destructive text-white dark:text-background")}>
          {t("banned")}
        </span>
      ) : (
        <span className={cn(badge, "bg-muted text-foreground")}>{t("active")}</span>
      )}
      {!member.emailVerified && (
        <span className="text-[13px] text-muted-foreground">{t("unverified")}</span>
      )}
      {member.bannedReason && (
        <span className="max-w-[280px] text-[13px] text-text-secondary">
          {t("bannedReason", { reason: member.bannedReason })}
        </span>
      )}
    </div>
  );

  const actions = (member: MemberView) => {
    if (member.id === admin.id) return <span className="text-muted-foreground">{t("self")}</span>;
    if (member.role === "ADMIN") return null;
    return (
      <div className="flex flex-wrap gap-2">
        {member.bannedAt ? (
          <ModerationButton kind="unban" targetId={member.id} name={member.pseudo} />
        ) : (
          <>
            <ModerationButton kind="ban" targetId={member.id} name={member.pseudo} />
            <ModerationButton kind="promote" targetId={member.id} name={member.pseudo} />
          </>
        )}
      </div>
    );
  };

  return (
    <AdminShell current="/admin/members" openReports={openReports} title={t("heading")}>
      <div className="flex flex-col gap-4">
        <AdminSearch
          action="/admin/members"
          label={t("search")}
          placeholder={t("searchPlaceholder")}
          submit={t("searchSubmit")}
          defaultValue={q}
          keep={filter === "all" ? {} : { filter }}
        />
        <FilterPills
          label={t("filtersLabel")}
          items={MEMBER_FILTERS.map((value) => ({
            href: href({ q, filter: value }),
            label: t(`filters.${value}`),
            active: value === filter,
          }))}
        />
      </div>
      {members.items.length > 0 ? (
        <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
          <table className="w-full min-w-[760px] border-collapse text-[15px]">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr>
                {(["member", "joined", "models", "status", "actions"] as const).map((column) => (
                  <th key={column} scope="col" className={cn(cell, "font-extrabold")}>
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.items.map((member) => (
                <tr key={member.id}>
                  <th scope="row" className={cn(cell, "font-normal")}>
                    <div className="flex flex-col">
                      {member.bannedAt ? (
                        <strong>{member.pseudo}</strong>
                      ) : (
                        <Link
                          href={`/members/${member.pseudoSlug}`}
                          className="font-bold hover:text-primary"
                        >
                          {member.pseudo}
                        </Link>
                      )}
                      <span className="break-all text-muted-foreground">{member.email}</span>
                    </div>
                  </th>
                  <td className={cell}>
                    {format.dateTime(member.createdAt, { dateStyle: "medium" })}
                  </td>
                  <td className={cell}>{member.models}</td>
                  <td className={cell}>{status(member)}</td>
                  <td className={cell}>{actions(member)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>{t("empty")}</EmptyState>
      )}
      <Pagination
        page={members.page}
        hasNext={members.hasNext}
        href={(next) => href({ q, filter, page: next })}
      />
    </AdminShell>
  );
}
