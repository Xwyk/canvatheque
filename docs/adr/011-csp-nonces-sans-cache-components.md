# ADR-011 : CSP à nonces, Cache Components désactivés

- Statut : acceptée (2026-10-18)

## Contexte

Le plan prévoit une CSP stricte à nonces (`script-src 'nonce-…' 'strict-dynamic'`).
Le squelette Next.js 16.4 active `cacheComponents` (Partial Prerendering par défaut) et
`partialPrefetching`. La documentation embarquée de Next indique que le PPR est incompatible
avec une CSP à nonces : le shell statique est produit sans requête, donc sans nonce, et toutes
les pages doivent être rendues dynamiquement.

## Décision

- `cacheComponents: false` (et donc pas de `partialPrefetching`).
- `proxy.ts` génère un nonce par requête, pose la CSP sur la requête (Next y lit le nonce et
  l'applique à ses scripts) et sur la réponse.
- La mise en page racine lit `x-nonce` via `headers()` : toutes les pages sont dynamiques
  (attendu pour une application à session), et le nonce est transmis à `next-themes`.
- `style-src 'self' 'unsafe-inline'` : les attributs `style` de React/Radix ne peuvent pas
  porter de nonce ; le risque est faible (aucune exécution de script).
- `upgrade-insecure-requests` et HSTS seulement si `APP_URL` est en HTTPS (sinon la pile locale
  en HTTP casserait).

## Conséquences

- Pas de pré-rendu statique : chaque page est rendue à la demande. Acceptable sur ce volume ;
  la mise en cache se fera au niveau des données (requêtes catalogue) si nécessaire.
- Alternative écartée : SRI expérimental (`experimental.sri`) + CSP par hachages, qui garderait
  le PPR mais ne couvre pas les scripts générés dynamiquement et reste expérimental.
