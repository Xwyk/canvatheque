"use client";

import { useCallback, useState } from "react";

/**
 * Schéma d'URL d'ouverture directe dans CanvasWorkspace : aucun n'est documenté par Brother
 * (vérifié le 18/10/2026), donc désactivé. S'il en publie un, le renseigner ici suffit :
 * la tentative passe avant le repli.
 */
export const CANVAS_WORKSPACE_PROTOCOL: ((slug: string) => string) | null = null;

/** Délai après lequel l'ouverture directe est considérée comme ratée. */
export const PROTOCOL_TIMEOUT_MS = 1500;

export const HELP_DISMISSED_KEY = "canvatheque.cws-help-dismissed";

function helpDismissed(): boolean {
  try {
    return window.localStorage.getItem(HELP_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissHelp(): void {
  try {
    window.localStorage.setItem(HELP_DISMISSED_KEY, "1");
  } catch {
    // stockage indisponible (navigation privée) : l'aide restera proposée
  }
}

/** Ouvre une URL de protocole ; vrai si la page a perdu le focus avant le délai (logiciel lancé). */
export function tryProtocol(url: string, timeoutMs = PROTOCOL_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let launched = false;
    const onHide = () => {
      launched = true;
    };
    window.addEventListener("blur", onHide);
    document.addEventListener("visibilitychange", onHide);
    window.location.href = url;
    setTimeout(() => {
      window.removeEventListener("blur", onHide);
      document.removeEventListener("visibilitychange", onHide);
      resolve(launched);
    }, timeoutMs);
  });
}

/**
 * « Ouvrir dans CanvasWorkspace » : tentative d'ouverture directe si un protocole existe,
 * sinon (ou en cas d'échec) téléchargement du fichier et explications pas à pas
 * (masquables : « Ne plus afficher », mémorisé dans le navigateur).
 */
export function useOpenInCanvasWorkspace({
  download,
  protocol = CANVAS_WORKSPACE_PROTOCOL,
}: {
  download: () => Promise<boolean>;
  protocol?: ((slug: string) => string) | null;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  const open = useCallback(
    async (slug: string) => {
      if (protocol && (await tryProtocol(protocol(slug)))) return "protocol" as const;
      const started = await download();
      if (started && !helpDismissed()) setHelpOpen(true);
      return started ? ("download" as const) : ("none" as const);
    },
    [download, protocol],
  );

  return { open, helpOpen, closeHelp: () => setHelpOpen(false) };
}
