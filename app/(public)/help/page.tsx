import type { Metadata } from "next";
import { ContentPage } from "@/features/content/content-page";
import { contentMetadata, legalValues } from "@/features/content/pages";

export function generateMetadata(): Promise<Metadata> {
  return contentMetadata("help");
}

export default async function HelpPage() {
  return <ContentPage page="help" values={await legalValues()} />;
}
