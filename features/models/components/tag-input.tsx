"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type KeyboardEvent } from "react";
import { FieldShell, inputClass } from "@/components/forms/text-field";
import type { Result } from "@/lib/result";
import { MAX_TAGS, normalizeTag, normalizeTags } from "@/lib/tags";

/**
 * Saisie de mots-clés en pastilles (10 au plus) avec suggestions des mots-clés existants.
 * `suggest` est l'action serveur (injectée pour les tests).
 */
export function TagInput({
  id,
  tags,
  error,
  onChange,
  suggest,
}: {
  id: string;
  tags: string[];
  error?: string;
  onChange: (tags: string[]) => void;
  suggest: (query: string) => Promise<Result<string[]>>;
}) {
  const t = useTranslations("publish.info");
  const [draft, setDraft] = useState("");
  // Suggestions rattachées à la saisie qui les a demandées (ignorées si la saisie a changé).
  const [found, setFound] = useState<{ query: string; tags: string[] }>({ query: "", tags: [] });
  const full = tags.length >= MAX_TAGS;
  const query = normalizeTag(draft);
  const suggestions =
    query && found.query === query ? found.tags.filter((tag) => !tags.includes(tag)) : [];

  useEffect(() => {
    if (query.length < 1) return;
    let active = true;
    const timer = setTimeout(async () => {
      const result = await suggest(query);
      if (active && result.ok) setFound({ query, tags: result.data });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, suggest]);

  const add = (raw: string) => {
    onChange(normalizeTags([...tags, ...raw.split(",")]));
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <FieldShell id={id} label={t("tags")} hint={t("tagsHint")} error={error}>
      {(describedBy) => (
        <div className="flex flex-col gap-2.5">
          {tags.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3.5 font-semibold"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={t("tagRemove", { tag })}
                    onClick={() => onChange(tags.filter((item) => item !== tag))}
                    className="inline-flex size-9 items-center justify-center rounded-full hover:bg-border"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            id={id}
            value={draft}
            disabled={full}
            placeholder={t("tagsPlaceholder")}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => setDraft(event.target.value.trimStart())}
            onKeyDown={onKeyDown}
            onBlur={() => draft.trim() && add(draft)}
            className={inputClass}
          />
          {suggestions.length > 0 && !full && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">
                {t("tagSuggestions")}
              </span>
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-label={t("tagAdd", { tag })}
                  // mousedown : ajouté avant la perte de focus du champ (onBlur).
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(tag)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border-2 border-input px-3 text-sm font-semibold hover:border-ink"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </FieldShell>
  );
}
