"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import { cn } from "@/lib/utils";

export type StrengthLevel = "empty" | "tooShort" | "weak" | "good" | "strong";

/** Score zxcvbn (0-4) → niveau affiché sur trois barres (planche Connexion). */
export function strengthLevel(password: string, score: number | null): StrengthLevel {
  if (!password) return "empty";
  if (password.length < PASSWORD_MIN_LENGTH) return "tooShort";
  if (score === null || score <= 1) return "weak";
  return score >= 4 ? "strong" : "good";
}

const BARS: Record<StrengthLevel, number> = { empty: 0, tooShort: 1, weak: 1, good: 2, strong: 3 };

type Scorer = (password: string) => number;
let scorerPromise: Promise<Scorer> | undefined;

/** zxcvbn et ses dictionnaires (~1 Mo) ne sont chargés qu'à la première saisie. */
function loadScorer(): Promise<Scorer> {
  scorerPromise ??= Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-fr"),
  ]).then(([core, common, fr]) => {
    const factory = new core.ZxcvbnFactory({
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...fr.dictionary },
      translations: fr.translations,
    });
    return (password: string) => factory.check(password).score;
  });
  return scorerPromise;
}

export function PasswordStrength({ password }: { password: string }) {
  const t = useTranslations("auth.strength");
  const [score, setScore] = useState<{ password: string; value: number } | null>(null);

  useEffect(() => {
    if (password.length < PASSWORD_MIN_LENGTH) return;
    let cancelled = false;
    void loadScorer().then((scorer) => {
      if (!cancelled) setScore({ password, value: scorer(password) });
    });
    return () => {
      cancelled = true;
    };
  }, [password]);

  const current = score?.password === password ? score.value : null;
  const level = strengthLevel(password, current);
  const bars = BARS[level];
  const color = level === "good" || level === "strong" ? "bg-success" : "bg-destructive";

  return (
    <div className="flex items-center gap-2.5 text-sm text-text-secondary">
      <span aria-hidden="true" className="flex w-[120px] shrink-0 gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn("h-1.5 flex-1 rounded-sm", index < bars ? color : "bg-border")}
          />
        ))}
      </span>
      <span aria-live="polite">
        {level === "empty"
          ? t("empty", { min: PASSWORD_MIN_LENGTH })
          : t("label", { level: t(level), min: PASSWORD_MIN_LENGTH })}
      </span>
    </div>
  );
}
