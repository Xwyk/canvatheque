import type { Metadata } from "next";
import { ContentPage } from "@/features/content/content-page";
import { contentMetadata, legalValues } from "@/features/content/pages";

export function generateMetadata(): Promise<Metadata> {
  return contentMetadata("privacy");
}

export default async function PrivacyPage() {
  return <ContentPage page="privacy" values={await legalValues()} />;
}
