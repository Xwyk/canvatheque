import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { MemberProfileView } from "@/features/catalog/components/member/member-profile";
import { getMemberProfile } from "@/features/catalog/member";
import { summarize } from "@/features/catalog/model-page";
import { absoluteUrl, DEFAULT_OG_IMAGE } from "@/features/catalog/seo";
import { db } from "@/lib/db";

const loadProfile = cache((pseudoSlug: string) => getMemberProfile(db(), pseudoSlug));

export async function generateMetadata({
  params,
}: PageProps<"/members/[pseudo]">): Promise<Metadata> {
  const { pseudo } = await params;
  const profile = await loadProfile(pseudo);
  if (!profile) return { robots: { index: false } };
  const t = await getTranslations("memberPage");
  const tMeta = await getTranslations("meta");
  const title = t("metaTitle", { pseudo: profile.pseudo });
  const description = profile.bio
    ? summarize(profile.bio)
    : t("metaDescription", { pseudo: profile.pseudo });
  const canonical = absoluteUrl(`/members/${profile.pseudoSlug}`);
  const images = [{ ...DEFAULT_OG_IMAGE, alt: tMeta("siteName") }];
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      siteName: tMeta("siteName"),
      locale: "fr_FR",
      url: canonical,
      title,
      description,
      username: profile.pseudo,
      images,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function MemberPage({ params }: PageProps<"/members/[pseudo]">) {
  const { pseudo } = await params;
  const profile = await loadProfile(pseudo);
  if (!profile) notFound();
  return <MemberProfileView profile={profile} />;
}
