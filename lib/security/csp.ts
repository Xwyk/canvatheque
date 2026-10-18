export type CspOptions = {
  nonce: string;
  isDev: boolean;
  /** Origine publique du stockage objet (aperçus, URL présignées). */
  storageOrigin?: string;
  /** Uniquement derrière HTTPS : sinon les ressources http://localhost casseraient. */
  upgradeInsecure?: boolean;
};

/** Origine (schéma + hôte + port) d'une URL, ou undefined si invalide. */
export function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function buildCsp({
  nonce,
  isDev,
  storageOrigin,
  upgradeInsecure = false,
}: CspOptions): string {
  const storage = storageOrigin ? ` ${storageOrigin}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Les styles inline de React/Radix (attribut style) exigent 'unsafe-inline' :
    // un nonce ne couvre pas les attributs. Risque faible (pas d'exécution de script).
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${storage}`,
    "font-src 'self'",
    `connect-src 'self'${storage}${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(upgradeInsecure ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function securityHeaders(isHttps: boolean): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    ...(isHttps
      ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }
      : {}),
  };
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

/** Réutilise un identifiant de requête amont valide, sinon en génère un. */
export function resolveRequestId(incoming: string | null): string {
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
}

export function createNonce(): string {
  return btoa(crypto.randomUUID());
}
