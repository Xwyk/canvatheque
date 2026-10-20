import type { Metadata } from "next";
import { ContentPage } from "@/features/content/content-page";
import { contentMetadata, legalValues } from "@/features/content/pages";

export function generateMetadata(): Promise<Metadata> {
  return contentMetadata("about");
}

export default async function AboutPage() {
  return <ContentPage page="about" values={await legalValues()} />;
}
