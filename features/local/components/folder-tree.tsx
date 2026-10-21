"use client";

import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { FolderNode } from "@/features/local/scan";
import { cn } from "@/lib/utils";

/**
 * Arborescence des dossiers du mode local : chaque dossier se déplie (bouton à chevron,
 * `aria-expanded`) et se sélectionne (filtre sur ce dossier et ses sous-dossiers). Listes
 * imbriquées de boutons, parcourables à la tabulation.
 */
export function FolderTree({
  root,
  selected,
  onSelect,
}: {
  root: FolderNode;
  /** Chemin du dossier sélectionné ("" : dossier choisi en entier). */
  selected: string;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("local.tree");
  // Dossier choisi et premier niveau dépliés d'emblée.
  const [open, setOpen] = useState<Set<string>>(() => new Set([""]));
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNode = (node: FolderNode, depth: number) => {
    const expanded = open.has(node.path);
    const active = node.path === selected;
    const Icon = expanded && node.children.length > 0 ? FolderOpen : Folder;
    return (
      <li key={node.path || "racine"}>
        <div
          className="flex min-h-11 items-center gap-1"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={t(expanded ? "collapse" : "expand", { name: node.name })}
              onClick={() => toggle(node.path)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn("size-4 transition-transform", expanded && "rotate-90")}
              />
            </button>
          ) : (
            <span aria-hidden="true" className="size-9 shrink-0" />
          )}
          <button
            type="button"
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(node.path)}
            className={cn(
              "flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-left text-[15px]",
              active ? "bg-ink font-bold text-ink-foreground" : "hover:bg-muted",
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{node.name}</span>
            <span
              className={cn(
                "ml-auto shrink-0 text-[13px]",
                active ? "text-ink-foreground" : "text-muted-foreground",
              )}
            >
              <span className="sr-only">{t("count", { count: node.count })}</span>
              <span aria-hidden="true">{node.count}</span>
            </span>
          </button>
        </div>
        {expanded && node.children.length > 0 && (
          <ul className="m-0 list-none p-0">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav aria-label={t("label")}>
      <ul className="m-0 list-none p-0">{renderNode(root, 0)}</ul>
    </nav>
  );
}
