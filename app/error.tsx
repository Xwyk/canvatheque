"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusPage } from "@/components/status-page";
import { pillButton } from "@/components/ui/pill-button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  return (
    <StatusPage
      title={t("title")}
      text={t("text")}
      actions={
        <>
          <button type="button" onClick={reset} className={pillButton({ size: "lg" })}>
            {t("retry")}
          </button>
          <Link href="/" className={pillButton({ variant: "outline", size: "lg" })}>
            {t("back")}
          </Link>
        </>
      }
      footnote={
        error.digest ? (
          <p className="m-0 text-sm text-muted-foreground">
            {t("reference", { digest: error.digest })}
          </p>
        ) : undefined
      }
    />
  );
}
