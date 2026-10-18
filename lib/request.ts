/**
 * Adresse IP du client. Derrière le reverse proxy (Caddy), X-Forwarded-For est fiable ;
 * le port de l'application n'est publié que sur 127.0.0.1 (docker-compose.yml) pour
 * qu'un client ne puisse pas le forger en contournant le proxy.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
