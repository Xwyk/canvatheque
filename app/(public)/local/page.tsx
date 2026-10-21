import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocalLibrary } from "@/features/local/components/local-library";
import { parseCwprjKeys } from "@/lib/cwprj-keys";
import { env } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("local");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/local" },
  };
}

/** Mode local (ADR-014) : tout se passe dans le navigateur, la page ne lit aucune donnée. */
export default function LocalPage() {
  const config = env();
  return (
    <LocalLibrary
      maxFileBytes={config.MAX_FILE_SIZE_MB * 1024 * 1024}
      cwprjPreviewEnabled={parseCwprjKeys(config.CWPRJ_KEY, config.CWPRJ_IV).length > 0}
    />
  );
}
