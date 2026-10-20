import { useRef } from "react";

type FocusHandler = (event: Event) => void;

/**
 * Rend le focus à l'élément qui avait ouvert un dialogue Radix. Radix ne le fait que pour son
 * propre `Trigger` : nos dialogues, ouverts par un état (bouton, lien, hook), perdaient le
 * focus à la fermeture (WCAG 2.4.3). Au moment de `onOpenAutoFocus`, le focus est encore sur
 * l'élément déclencheur.
 */
export function useRestoreFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: FocusHandler;
  onCloseAutoFocus?: FocusHandler;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event);
      const element = opener.current;
      if (event.defaultPrevented || !element?.isConnected) return;
      event.preventDefault();
      element.focus();
    },
  };
}
