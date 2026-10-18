import { cn } from "@/lib/utils";

/** Fonds d'avatar à texte blanc (contraste ≥ 4,5:1 ; pas de jaune). */
const AVATAR_COLORS = ["bg-info", "bg-primary", "bg-success", "bg-ink"] as const;

/** Indice stable dérivé d'une chaîne (même pseudo → même couleur). */
export function stableIndex(key: string, modulo: number): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % modulo;
}

/** Avatar à initiale (maquettes : 26 px carte, 32-40 px fiche, 96 px profil). Décoratif. */
export function Avatar({ pseudo, className }: { pseudo: string; className?: string }) {
  const color = AVATAR_COLORS[stableIndex(pseudo, AVATAR_COLORS.length)];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-[26px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-white dark:text-background",
        color,
        className,
      )}
    >
      {pseudo.charAt(0).toLocaleUpperCase("fr")}
    </span>
  );
}
