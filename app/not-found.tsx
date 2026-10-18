import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusPage } from "@/components/status-page";
import { pillButton } from "@/components/ui/pill-button";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <StatusPage
      title={t("title")}
      text={t("text")}
      actions={
        <Link href="/" className={pillButton({ size: "lg" })}>
          {t("back")}
        </Link>
      }
    />
  );
}
