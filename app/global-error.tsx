"use client";

/**
 * Dernier filet : remplace la mise en page racine si elle échoue elle-même.
 * Aucun fournisseur (i18n, thème) n'est disponible ici : textes et styles en dur.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#ffffff",
          color: "#221f3a",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <main>
          <h1 style={{ fontSize: "32px", margin: "0 0 12px" }}>Un fil s&apos;est coincé</h1>
          <p style={{ margin: "0 0 24px", color: "#5b5873" }}>
            Une erreur inattendue est survenue. Réessayez dans un instant.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "48px",
              padding: "0 28px",
              borderRadius: "999px",
              border: 0,
              background: "#c81e4b",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "17px",
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
