"use client";

import { FolderOpen, Grid3x3, List, Search, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useAuthGate } from "@/components/auth/auth-gate";
import { FormatBadge } from "@/components/model-card";
import { pillButton } from "@/components/ui/pill-button";
import { FolderTree } from "@/features/local/components/folder-tree";
import { LocalCard } from "@/features/local/components/local-card";
import { PathButton } from "@/features/local/components/path-button";
import { handOffForPublishing } from "@/features/local/handoff";
import {
  fetchCwprjThumbnail,
  LOOKUP_LIMIT,
  lookupOnCanvatheque,
  type LookupMatch,
} from "@/features/local/lookup-client";
import {
  applyView,
  DEFAULT_VIEW,
  duplicateGroups,
  folderTree,
  SCAN_LIMITS,
  summarize,
  type LocalEntry,
  type LocalFormat,
  type LocalSort,
  type LocalView,
} from "@/features/local/scan";
import {
  supportsDirectoryPicker,
  useLocalLibrary,
  type HasherFactory,
} from "@/features/local/use-local-library";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE = 60;
const COARSE_POINTER = "(hover: none) and (pointer: coarse)";

/** Téléphone ou tablette tactile : le parcours d'un dossier n'y est pas proposé. */
function useIsTouchDevice(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(COARSE_POINTER);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  );
}

const selectClass =
  "h-11 rounded-full border-2 border-input bg-background px-4 text-[15px] font-semibold text-foreground";

/**
 * Mode local (ADR-014) : choix d'un dossier de l'ordinateur, analyse dans le navigateur,
 * synthèse, doublons, grille ou liste filtrable, rapprochement par empreintes et publication
 * sur clic. Aucun fichier ne part sans action explicite.
 */
export function LocalLibrary({
  maxFileBytes,
  cwprjPreviewEnabled,
  hasherFactory,
}: {
  maxFileBytes: number;
  cwprjPreviewEnabled: boolean;
  hasherFactory?: HasherFactory;
}) {
  const t = useTranslations("local");
  const format = useFormatter();
  const router = useRouter();
  const gate = useAuthGate();
  const touch = useIsTouchDevice();
  const library = useLocalLibrary({ maxFileBytes, hasherFactory });
  const { state } = library;
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [matches, setMatches] = useState<Map<string, LookupMatch> | null>(null);
  const [checking, setChecking] = useState(false);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());

  const choose = () => {
    setMatches(null);
    if (supportsDirectoryPicker()) void library.pickDirectory();
    else input.current?.click();
  };

  const publish = (entry: LocalEntry) => {
    const file = state.status === "ready" ? state.files.get(entry.id) : undefined;
    if (!file) return;
    handOffForPublishing(file);
    if (gate.signedIn) router.push("/publish");
    else gate.open("publish", "/publish");
  };

  const thumbnail = async (entry: LocalEntry) => {
    const file = state.status === "ready" ? state.files.get(entry.id) : undefined;
    if (!file) return;
    if (!gate.signedIn) {
      gate.open("preview", "/local");
      return;
    }
    const result = await fetchCwprjThumbnail(file);
    if (result.ok) {
      const url = URL.createObjectURL(result.image);
      setThumbnails((current) => new Map(current).set(entry.id, url));
    } else if (result.reason === "unauthorized") {
      gate.open("preview", "/local");
    } else {
      toast.error(t(`thumbnail.${result.reason}`));
    }
  };

  const check = async (entries: LocalEntry[]) => {
    const checksums = [...new Set(entries.flatMap((entry) => entry.checksum ?? []))];
    setChecking(true);
    try {
      const found = await lookupOnCanvatheque(checksums);
      setMatches(new Map(found.map((match) => [match.checksum, match])));
      toast.success(t("lookup.done", { count: found.length }));
      if (checksums.length > LOOKUP_LIMIT) toast.info(t("lookup.partial", { max: LOOKUP_LIMIT }));
    } catch {
      toast.error(t("lookup.error"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="container-page flex flex-col gap-8 py-8 md:py-12">
      <header className="flex max-w-[760px] flex-col gap-3">
        <h1 className="m-0 text-[clamp(32px,4.5vw,44px)] leading-[1.08] font-extrabold tracking-[-0.02em]">
          {t("title")}
        </h1>
        <p className="m-0 text-lg text-text-secondary">{t("lead")}</p>
        <p
          role="note"
          className="m-0 flex items-start gap-3 rounded-[20px] bg-success-soft px-5 py-4 text-foreground"
        >
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          {t("privacy")}
        </p>
      </header>

      {touch ? (
        <p className="m-0 rounded-[28px] bg-muted px-6 py-10 text-center text-text-secondary">
          {t("mobile")}
        </p>
      ) : (
        <>
          {/* Champ de repli (Firefox, Safari) : rempli aussi par les tests. */}
          <label htmlFor={inputId} className="sr-only">
            {t("inputLabel")}
          </label>
          <input
            ref={input}
            id={inputId}
            type="file"
            className="sr-only"
            tabIndex={-1}
            // Attribut non standard : sélection d'un dossier entier.
            {...{ webkitdirectory: "", directory: "" }}
            multiple
            onChange={(event) => {
              const files = event.target.files;
              if (files?.length) void library.fromFileList(files);
              event.target.value = "";
            }}
          />

          {state.status === "idle" && (
            <section aria-label={t("choose")} className="flex flex-col items-start gap-6">
              <div className="flex flex-col items-start gap-2">
                <button type="button" onClick={choose} className={pillButton({ size: "xl" })}>
                  <FolderOpen aria-hidden="true" className="size-6" />
                  {t("choose")}
                </button>
                <p className="m-0 text-[15px] text-muted-foreground">{t("chooseHint")}</p>
              </div>
              {state.saved && (
                <div className="flex flex-col gap-3 rounded-[28px] border-2 border-border px-6 py-5">
                  <h2 className="m-0 text-xl font-bold">{t("saved.title")}</h2>
                  <p className="m-0 text-text-secondary">
                    {t("saved.text", {
                      folder: state.saved.folderName,
                      count: state.saved.entries.length,
                      date: format.dateTime(new Date(state.saved.scannedAt), { dateStyle: "long" }),
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {state.saved.handle && (
                      <button
                        type="button"
                        onClick={() => void library.rescan()}
                        className={pillButton({ variant: "outline", size: "sm" })}
                      >
                        {t("saved.rescan")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={library.showSaved}
                      className={pillButton({ variant: "soft", size: "sm" })}
                    >
                      {t("saved.show")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void library.forget()}
                      className={pillButton({
                        variant: "soft",
                        size: "sm",
                        className: "text-destructive hover:text-destructive",
                      })}
                    >
                      {t("saved.forget")}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {state.status === "scanning" && (
            <section aria-label={t("scanning.label")} className="flex max-w-[560px] flex-col gap-3">
              <p role="status" className="m-0 font-semibold">
                {state.total === 0
                  ? t("scanning.listing")
                  : t("scanning.progress", { done: state.done, total: state.total })}
              </p>
              <div
                role="progressbar"
                aria-label={t("scanning.label")}
                aria-valuemin={0}
                aria-valuemax={state.total || 1}
                aria-valuenow={state.done}
                className="h-3 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${state.total ? (state.done / state.total) * 100 : 5}%` }}
                />
              </div>
              <button
                type="button"
                onClick={library.cancel}
                className={pillButton({ variant: "outline", size: "sm", className: "self-start" })}
              >
                {t("scanning.cancel")}
              </button>
            </section>
          )}

          {state.status === "error" && (
            <div role="alert" className="flex flex-col items-start gap-3">
              <p className="m-0 font-semibold text-destructive">{t(`error.${state.reason}`)}</p>
              <button type="button" onClick={choose} className={pillButton({ size: "md" })}>
                {t("error.retry")}
              </button>
            </div>
          )}

          {state.status === "ready" && (
            <Results
              folderName={state.folderName}
              entries={state.entries}
              files={state.files}
              truncated={state.truncated}
              matches={matches}
              checking={checking}
              thumbnails={thumbnails}
              onChange={choose}
              onForget={() => {
                setMatches(null);
                void library.forget();
              }}
              onCheck={check}
              actions={{ publish, thumbnail: cwprjPreviewEnabled ? thumbnail : undefined }}
            />
          )}
        </>
      )}
    </div>
  );
}

function Results({
  folderName,
  entries,
  files,
  truncated,
  matches,
  checking,
  thumbnails,
  onChange,
  onForget,
  onCheck,
  actions,
}: {
  folderName: string;
  entries: LocalEntry[];
  files: Map<string, File>;
  truncated: boolean;
  matches: Map<string, LookupMatch> | null;
  checking: boolean;
  thumbnails: Map<string, string>;
  onChange: () => void;
  onForget: () => void;
  onCheck: (entries: LocalEntry[]) => void;
  actions: Parameters<typeof LocalCard>[0]["actions"];
}) {
  const t = useTranslations("local");
  const [view, setView] = useState<LocalView>(DEFAULT_VIEW);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [limit, setLimit] = useState(PAGE);
  const summary = useMemo(() => summarize(entries), [entries]);
  const duplicates = useMemo(() => duplicateGroups(entries), [entries]);
  const shown = useMemo(() => applyView(entries, view), [entries, view]);
  const tree = useMemo(() => folderTree(entries, folderName), [entries, folderName]);
  const searchId = useId();
  const update = (patch: Partial<LocalView>) => {
    setView((current) => ({ ...current, ...patch }));
    setLimit(PAGE);
  };
  const matchOf = (entry: LocalEntry) =>
    entry.checksum ? matches?.get(entry.checksum) : undefined;
  const indexOnly = files.size === 0 && entries.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 mr-auto text-2xl font-bold break-words">
          {t("result.heading", { folder: folderName })}
        </h2>
        <button
          type="button"
          onClick={onChange}
          className={pillButton({ variant: "outline", size: "sm" })}
        >
          {t("result.change")}
        </button>
        <button
          type="button"
          onClick={onForget}
          className={pillButton({
            variant: "soft",
            size: "sm",
            className: "text-destructive hover:text-destructive",
          })}
        >
          {t("result.forget")}
        </button>
      </div>

      {indexOnly && (
        <p className="m-0 rounded-[20px] bg-highlight-soft px-5 py-4">{t("result.indexOnly")}</p>
      )}
      {truncated && (
        <p className="m-0 rounded-[20px] bg-highlight-soft px-5 py-4">
          {t("result.truncated", { max: SCAN_LIMITS.maxFiles })}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="m-0 rounded-[28px] bg-muted px-6 py-12 text-center text-text-secondary">
          {t("result.empty")}
        </p>
      ) : (
        <>
          <section aria-label={t("summary.label")} className="flex flex-col gap-4">
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
              {[
                t("summary.total", { count: summary.total }),
                t("summary.formats", { svg: summary.byFormat.SVG, cwprj: summary.byFormat.CWPRJ }),
                t("summary.size", { size: formatFileSize(summary.totalSize) }),
                t("summary.duplicates", { count: summary.duplicateFiles }),
              ].map((text) => (
                <li key={text} className="rounded-[20px] bg-muted px-5 py-4 font-bold">
                  {text}
                </li>
              ))}
            </ul>
            <p className="m-0 text-text-secondary">
              {t("summary.recent", { count: summary.recent })}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={checking}
                onClick={() => onCheck(entries)}
                className={pillButton({ variant: "outline", size: "sm" })}
              >
                {t("lookup.button")}
              </button>
              <span className="text-[15px] text-muted-foreground">{t("lookup.hint")}</span>
            </div>
          </section>

          <section aria-labelledby="local-duplicates" className="flex flex-col gap-3">
            <h2 id="local-duplicates" className="m-0 text-xl font-bold">
              {t("duplicates.heading")}
            </h2>
            {duplicates.length === 0 ? (
              <p className="m-0 text-text-secondary">{t("duplicates.none")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {duplicates.map((group) => (
                  <li
                    key={group[0]!.checksum}
                    className="rounded-[20px] border-2 border-border px-5 py-4"
                  >
                    <details>
                      <summary className="min-h-11 cursor-pointer font-bold">
                        {group[0]!.name} · {t("duplicates.group", { count: group.length })}
                      </summary>
                      <ul className="m-0 mt-2 flex flex-col gap-1 pl-5 text-text-secondary">
                        {group.map((entry) => (
                          <li key={entry.id} className="break-all">
                            {entry.path}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="local-files"
            className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]"
          >
            <h2 id="local-files" className="sr-only">
              {t("list.caption")}
            </h2>
            <aside className="rounded-[20px] border-2 border-border p-2 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
              <FolderTree
                root={tree}
                selected={view.folder ?? ""}
                onSelect={(path) => update({ folder: path || null })}
              />
            </aside>
            <div className="flex min-w-0 flex-col gap-5">
              <div
                role="search"
                aria-label={t("filters.label")}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="relative min-w-0 flex-[1_1_240px]">
                  <label htmlFor={searchId} className="sr-only">
                    {t("filters.search")}
                  </label>
                  <Search
                    aria-hidden="true"
                    className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    id={searchId}
                    type="search"
                    value={view.q}
                    placeholder={t("filters.searchPlaceholder")}
                    onChange={(event) => update({ q: event.target.value })}
                    className="h-11 w-full rounded-full border-2 border-input bg-background pr-4 pl-11 text-[15px] text-foreground"
                  />
                </div>
                <select
                  aria-label={t("filters.format")}
                  value={view.format}
                  onChange={(event) =>
                    update({ format: event.target.value as LocalFormat | "all" })
                  }
                  className={selectClass}
                >
                  <option value="all">{t("filters.allFormats")}</option>
                  <option value="SVG">SVG</option>
                  <option value="CWPRJ">CWPRJ</option>
                </select>
                <select
                  aria-label={t("filters.sort")}
                  value={view.sort}
                  onChange={(event) => update({ sort: event.target.value as LocalSort })}
                  className={selectClass}
                >
                  <option value="name">{t("filters.sortName")}</option>
                  <option value="date">{t("filters.sortDate")}</option>
                  <option value="size">{t("filters.sortSize")}</option>
                </select>
                <div
                  role="group"
                  aria-label={t("filters.view")}
                  className="flex gap-1 rounded-full bg-muted p-1"
                >
                  {(["grid", "list"] as const).map((mode) => {
                    const Icon = mode === "grid" ? Grid3x3 : List;
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={layout === mode}
                        onClick={() => setLayout(mode)}
                        className={cn(
                          "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[15px] font-bold",
                          layout === mode
                            ? "bg-card shadow-[0_1px_4px_rgb(34_31_58/0.18)]"
                            : "text-text-secondary",
                        )}
                      >
                        <Icon aria-hidden="true" className="size-4" />
                        {t(`filters.${mode}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {shown.length === 0 ? (
                <p className="m-0 text-text-secondary">{t("result.noMatch")}</p>
              ) : layout === "grid" ? (
                <ul className="m-0 grid list-none grid-cols-2 gap-5 p-0 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                  {shown.slice(0, limit).map((entry) => (
                    <li key={entry.id}>
                      <LocalCard
                        entry={entry}
                        folderName={folderName}
                        file={files.get(entry.id)}
                        thumbnail={thumbnails.get(entry.id)}
                        match={matchOf(entry)}
                        actions={actions}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <FileTable
                  folderName={folderName}
                  entries={shown.slice(0, limit)}
                  files={files}
                  matchOf={matchOf}
                  actions={actions}
                />
              )}
              {shown.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit((current) => current + PAGE)}
                  className={pillButton({
                    variant: "outline",
                    size: "sm",
                    className: "self-center",
                  })}
                >
                  {t("result.more")}
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function FileTable({
  folderName,
  entries,
  files,
  matchOf,
  actions,
}: {
  folderName: string;
  entries: LocalEntry[];
  files: Map<string, File>;
  matchOf: (entry: LocalEntry) => LookupMatch | undefined;
  actions: Parameters<typeof LocalCard>[0]["actions"];
}) {
  const t = useTranslations("local");
  const format = useFormatter();
  const cell = "border-b-2 border-border px-4 py-3 text-left align-middle";
  return (
    <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <table className="w-full min-w-[860px] border-collapse text-[15px]">
        <caption className="sr-only">{t("list.caption")}</caption>
        <thead>
          <tr>
            {(["name", "folder", "format", "size", "modified", "actions"] as const).map(
              (column) => (
                <th key={column} scope="col" className={cn(cell, "font-extrabold")}>
                  {t(`list.${column}`)}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const match = matchOf(entry);
            return (
              <tr key={entry.id}>
                <th scope="row" className={cn(cell, "font-bold break-all")}>
                  {entry.name}
                  {match && (
                    <span className="ml-2 text-[13px] text-success">{t("lookup.badge")}</span>
                  )}
                </th>
                <td className={cn(cell, "break-all text-text-secondary")}>
                  {entry.folder || t("summary.root")}
                </td>
                <td className={cell}>
                  <FormatBadge format={entry.format} />
                </td>
                <td className={cell}>{formatFileSize(entry.size)}</td>
                <td className={cell}>
                  {format.dateTime(new Date(entry.lastModified), { dateStyle: "medium" })}
                </td>
                <td className={cell}>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!files.get(entry.id) || entry.tooLarge}
                      onClick={() => actions.publish(entry)}
                      aria-label={t("card.publishLabel", { name: entry.name })}
                      className={pillButton({ variant: "outline", size: "sm" })}
                    >
                      {t("card.publish")}
                    </button>
                    <PathButton name={entry.name} path={`${folderName}/${entry.path}`} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
