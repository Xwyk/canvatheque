"use client";

import { useCallback, useRef, useState } from "react";
import { confirmUploadAction, createUploadAction } from "@/features/uploads/actions";
import { postToStorage, UploadAbortedError } from "@/features/uploads/client";
import type { Crop } from "@/lib/images/preview";
import type { ActionError, Result } from "@/lib/result";

export type UploadPhase =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string; percent: number }
  | { phase: "processing"; fileName: string }
  | { phase: "error"; fileName?: string; error: ActionError };

export type UploadActions = {
  create: typeof createUploadAction;
  confirm: typeof confirmUploadAction;
  post: typeof postToStorage;
};

const DEFAULT_ACTIONS: UploadActions = {
  create: createUploadAction,
  confirm: confirmUploadAction,
  post: postToStorage,
};

const NETWORK_ERROR: ActionError = { code: "INTERNAL", message: "errors.upload.network" };

/**
 * Enchaîne demande d'envoi → POST direct vers le stockage → confirmation serveur, avec
 * progression et annulation. Renvoie le résultat de la confirmation (ou null si annulé/échec).
 */
export function useUpload<T>(actions: UploadActions = DEFAULT_ACTIONS) {
  const [state, setState] = useState<UploadPhase>({ phase: "idle" });
  const controller = useRef<AbortController | null>(null);

  const start = useCallback(
    async (
      file: File,
      request: { kind: "MODEL" | "PREVIEW"; modelId?: string },
      crop?: Crop,
    ): Promise<T | null> => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const fileName = file.name;
      const failWith = (error: ActionError) => {
        setState({ phase: "error", fileName, error });
        return null;
      };

      setState({ phase: "uploading", fileName, percent: 0 });
      const ticket = await actions.create({
        ...request,
        fileName,
        size: file.size,
        mime: file.type,
      });
      if (!ticket.ok) return failWith(ticket.error);
      try {
        await actions.post(ticket.data, file, {
          signal: abort.signal,
          onProgress: (percent) => setState({ phase: "uploading", fileName, percent }),
        });
      } catch (error) {
        if (error instanceof UploadAbortedError) {
          setState({ phase: "idle" });
          return null;
        }
        return failWith(NETWORK_ERROR);
      }
      setState({ phase: "processing", fileName });
      const confirmed = (await actions.confirm({
        uploadId: ticket.data.uploadId,
        crop,
      })) as Result<T>;
      if (!confirmed.ok) return failWith(confirmed.error);
      setState({ phase: "idle" });
      return confirmed.data;
    },
    [actions],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    setState({ phase: "idle" });
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, start, cancel, reset };
}
