import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublishWizard } from "@/features/models/components/publish-wizard";
import { wizardContext } from "@/features/models/publication-page";
import { requireUserPage } from "@/lib/auth/current";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("publish"), robots: { index: false } };
}

export default async function PublishPage() {
  const user = await requireUserPage("/publish");
  return <PublishWizard initial={null} {...await wizardContext(user)} />;
}
