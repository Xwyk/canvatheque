"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWorkerHasher } from "@/features/local/hasher";
import { filesFromInput, type FoundFile, type LocalEntry } from "@/features/local/scan";
import { forgetLibrary, loadLibrary, saveLibrary, type SavedLibrary } from "@/features/local/store";
import {
  analyzeFiles,
  ScanAborted,
  walkDirectory,
  type DirectoryHandleLike,
  type Hasher,
} from "@/features/local/walk";

/** Sélecteur de dossier de Chromium (File System Access). */
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: "read"; id?: string }) => Promise<DirectoryHandleLike>;
};
type PermissionHandle = DirectoryHandleLike & {
  requestPermission?: (options: { mode: "read" }) => Promise<PermissionState>;
};

export type LibraryState =
  | { status: "idle"; saved: SavedLibrary | null }
  | { status: "scanning"; done: number; total: number }
  | {
      status: "ready";
      folderName: string;
      entries: LocalEntry[];
      /** Fichiers de l'analyse en cours (absents d'un index restauré). */
      files: Map<string, File>;
      truncated: boolean;
      /** Dossier rescannable (handle mémorisé). */
      canRescan: boolean;
    }
  | { status: "error"; reason: "denied" | "failed" };

export type HasherFactory = () => { hash: Hasher; terminate: () => void };

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * État du mode local : choix du dossier (sélecteur Chromium ou champ `webkitdirectory`),
 * analyse annulable, mémoire IndexedDB (index et handle), oubli.
 */
export function useLocalLibrary({
  maxFileBytes,
  hasherFactory = createWorkerHasher,
}: {
  maxFileBytes: number;
  hasherFactory?: HasherFactory;
}) {
  const [state, setState] = useState<LibraryState>({ status: "idle", saved: null });
  const run = useRef<{ abort: AbortController; terminate: () => void } | null>(null);

  useEffect(() => {
    let active = true;
    void loadLibrary().then((saved) => {
      if (active && saved)
        setState((current) => (current.status === "idle" ? { status: "idle", saved } : current));
    });
    return () => {
      active = false;
      run.current?.terminate();
    };
  }, []);

  const analyze = useCallback(
    async (
      folderName: string,
      collect: (signal: AbortSignal) => Promise<{ found: FoundFile[]; truncated: boolean }>,
      handle?: DirectoryHandleLike,
    ) => {
      run.current?.terminate();
      const abort = new AbortController();
      const hasher = hasherFactory();
      run.current = { abort, terminate: hasher.terminate };
      setState({ status: "scanning", done: 0, total: 0 });
      try {
        const { found, truncated } = await collect(abort.signal);
        setState({ status: "scanning", done: 0, total: found.length });
        const entries = await analyzeFiles(found, {
          hash: hasher.hash,
          maxFileBytes,
          signal: abort.signal,
          onProgress: (done, total) => setState({ status: "scanning", done, total }),
        });
        const files = new Map(found.map((item) => [item.path, item.file]));
        setState({ status: "ready", folderName, entries, files, truncated, canRescan: !!handle });
        await saveLibrary({ folderName, scannedAt: Date.now(), truncated, entries, handle });
      } catch (error) {
        if (error instanceof ScanAborted || abort.signal.aborted) {
          setState({ status: "idle", saved: await loadLibrary() });
        } else {
          setState({ status: "error", reason: "failed" });
        }
      } finally {
        hasher.terminate();
        if (run.current?.abort === abort) run.current = null;
      }
    },
    [hasherFactory, maxFileBytes],
  );

  /** Sélecteur de dossier (Chromium) ; l'utilisatrice peut le fermer sans choisir. */
  const pickDirectory = useCallback(async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return;
    let handle: DirectoryHandleLike;
    try {
      handle = await picker({ mode: "read", id: "canvatheque-local" });
    } catch {
      return; // boîte de dialogue fermée
    }
    await analyze(handle.name, (signal) => walkDirectory(handle, signal), handle);
  }, [analyze]);

  /** Champ `webkitdirectory` (Firefox, Safari, ou au choix de l'utilisatrice). */
  const fromFileList = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const folderName = list[0]?.webkitRelativePath.split("/")[0] || "dossier";
      await analyze(folderName, async () => filesFromInput(list));
    },
    [analyze],
  );

  /** Nouvelle analyse du dossier mémorisé, après une nouvelle autorisation. */
  const rescan = useCallback(async () => {
    if (state.status !== "idle" || !state.saved?.handle) return;
    const handle = state.saved.handle as PermissionHandle;
    const permission = (await handle.requestPermission?.({ mode: "read" })) ?? "granted";
    if (permission !== "granted") {
      setState({ status: "error", reason: "denied" });
      return;
    }
    await analyze(state.saved.folderName, (signal) => walkDirectory(handle, signal), handle);
  }, [analyze, state]);

  /** Index de la dernière analyse, sans les fichiers (aperçus et publication indisponibles). */
  const showSaved = useCallback(() => {
    if (state.status !== "idle" || !state.saved) return;
    const { folderName, entries, truncated, handle } = state.saved;
    setState({
      status: "ready",
      folderName,
      entries,
      files: new Map(),
      truncated,
      canRescan: !!handle,
    });
  }, [state]);

  const cancel = useCallback(() => {
    run.current?.abort.abort();
    run.current?.terminate();
  }, []);

  const forget = useCallback(async () => {
    run.current?.terminate();
    await forgetLibrary();
    setState({ status: "idle", saved: null });
  }, []);

  const reset = useCallback(async () => {
    setState({ status: "idle", saved: await loadLibrary() });
  }, []);

  return { state, pickDirectory, fromFileList, rescan, showSaved, cancel, forget, reset };
}
