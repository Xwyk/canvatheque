import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PublishWizard } from "@/features/models/components/publish-wizard";
import { wizardContext } from "@/features/models/publication-page";
import { getEditableModel } from "@/features/models/service";
import { requireUserPage } from "@/lib/auth/current";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publish");
  return { title: t("editTitle"), robots: { index: false } };
}

export default async function EditModelPage({ params }: PageProps<"/models/[slug]/edit">) {
  const { slug } = await params;
  const user = await requireUserPage(`/models/${encodeURIComponent(slug)}/edit`);
  // Introuvable ou appartenant à un autre membre : même réponse (pas de fuite d'existence).
  const model = await getEditableModel(db(), user, slug);
  if (!model) notFound();
  return <PublishWizard key={model.id} initial={model} {...await wizardContext(user)} />;
}
