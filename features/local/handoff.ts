/**
 * Fichier transmis du mode local à l'assistant de publication (même onglet, navigation côté
 * client) : rien n'est envoyé tant que l'assistant ne commence pas l'envoi. Un rechargement
 * de page efface la transmission.
 */
let pending: File | null = null;

export function handOffForPublishing(file: File): void {
  pending = file;
}

/** Fichier en attente, retiré de la file (une seule utilisation). */
export function takeHandedOffFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}
