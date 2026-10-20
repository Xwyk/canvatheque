import type { Metadata } from "next";
import { ContentPage } from "@/features/content/content-page";
import { contentMetadata, legalValues } from "@/features/content/pages";

export function generateMetadata(): Promise<Metadata> {
  return contentMetadata("terms");
}

export default async function TermsPage() {
  return <ContentPage page="terms" values={await legalValues()} />;
}
