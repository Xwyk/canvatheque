/** Modification d'un modèle : rattachée à la section « Publier », pas au catalogue. */
const EDIT_PAGE = /^\/models\/[^/]+\/edit$/;

/** Vrai si `href` correspond à la page courante ou à l'une de ses sous-pages. */
export function isActivePath(pathname: string, href: string): boolean {
  const section = EDIT_PAGE.test(pathname) ? "/publish" : pathname;
  if (href === "/") return section === "/";
  return section === href || section.startsWith(`${href}/`);
}
