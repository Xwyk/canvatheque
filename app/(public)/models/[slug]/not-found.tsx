import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusPage } from "@/components/status-page";
import { pillButton } from "@/components/ui/pill-button";

export default function ModelNotFound() {
  const t = useTranslations("modelPage");
  return (
    <StatusPage
      title={t("notFoundTitle")}
      text={t("notFoundText")}
      actions={
        <Link href="/models" className={pillButton({ size: "lg" })}>
          {t("notFoundCta")}
        </Link>
      }
    />
  );
}
