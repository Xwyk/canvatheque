import { useTranslations } from "next-intl";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-[52px] w-full rounded-[14px] border-2 border-input bg-background px-4 text-[17px] text-foreground placeholder:text-muted-foreground focus-visible:border-ink focus-visible:outline-none aria-invalid:border-destructive";

type FieldShellProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  /** Clé `errors.field.*`. */
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
  after?: ReactNode;
};

/** Libellé, aide et message d'erreur reliés au champ (aria-describedby). */
export function FieldShell({ id, label, hint, error, children, after }: FieldShellProps) {
  const t = useTranslations("errors.field");
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-bold">
        {label}
      </label>
      {children(describedBy)}
      {error && (
        <p id={errorId} className="m-0 text-sm font-semibold text-destructive">
          {t.has(error) ? t(error) : error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="m-0 text-sm text-text-secondary">
          {hint}
        </p>
      )}
      {after}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
};

export function TextField({ label, hint, error, className, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputClass, className)}
          {...input}
        />
      )}
    </FieldShell>
  );
}
