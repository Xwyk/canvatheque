import type { Metadata } from "next";
import { ContentPage } from "@/features/content/content-page";
import { contentMetadata, legalValues } from "@/features/content/pages";

export function generateMetadata(): Promise<Metadata> {
  return contentMetadata("legal");
}

export default async function LegalPage() {
  return <ContentPage page="legal" values={await legalValues()} />;
}
