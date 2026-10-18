"use client";

import { useTranslations } from "next-intl";
import { LICENSES, type LicenseValue } from "@/features/models/schemas";
import { cn } from "@/lib/utils";

/** Choix de licence : une carte par licence, avec sa phrase d'explication. */
export function LicenseField({
  value,
  error,
  onChange,
}: {
  value: LicenseValue | null;
  error?: string;
  onChange: (value: LicenseValue) => void;
}) {
  const t = useTranslations("publish.info");
  const tLicense = useTranslations("licenses");
  const tError = useTranslations("errors.field");
  const errorId = "license-error";
  return (
    <fieldset
      aria-describedby={cn("license-hint", error && errorId)}
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
    >
      <legend className="mb-1.5 p-0 text-[15px] font-bold">{t("license")}</legend>
      <p id="license-hint" className="m-0 text-sm text-text-secondary">
        {t("licenseHint")}
      </p>
      {error && (
        <p id={errorId} className="m-0 text-sm font-semibold text-destructive">
          {tError(error)}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {LICENSES.map((license) => (
          <div
            key={license}
            className={cn(
              "flex items-start gap-3 rounded-[14px] border-2 p-3.5 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
              value === license ? "border-primary bg-tint-rose dark:bg-secondary" : "border-input",
            )}
          >
            <input
              id={`license-${license}`}
              type="radio"
              name="license"
              value={license}
              checked={value === license}
              onChange={() => onChange(license)}
              className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-none"
            />
            <label
              htmlFor={`license-${license}`}
              className="flex flex-1 cursor-pointer flex-col gap-0.5"
            >
              <span className="font-bold">{tLicense(`${license}.name`)}</span>
              <span className="text-sm text-text-secondary">{tLicense(`${license}.summary`)}</span>
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
