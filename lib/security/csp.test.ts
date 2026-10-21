import { describe, expect, it } from "vitest";
import {
  buildCsp,
  createNonce,
  originOf,
  resolveRequestId,
  securityHeaders,
} from "@/lib/security/csp";

describe("buildCsp", () => {
  it("autorise uniquement les scripts portant le nonce en production", () => {
    const csp = buildCsp({ nonce: "abc", isDev: false, storageOrigin: "https://cdn.example" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("img-src 'self' blob: data: https://cdn.example");
    expect(csp).toContain("connect-src 'self' https://cdn.example");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("ajoute eval et websocket en développement, upgrade derrière HTTPS", () => {
    const dev = buildCsp({ nonce: "n", isDev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("connect-src 'self' ws:");
    expect(buildCsp({ nonce: "n", isDev: false, upgradeInsecure: true })).toContain(
      "upgrade-insecure-requests",
    );
  });
});

describe("originOf", () => {
  it("extrait l'origine ou renvoie undefined", () => {
    expect(originOf("https://exemple.fr/s3/bucket")).toBe("https://exemple.fr");
    expect(originOf("pas une url")).toBeUndefined();
    expect(originOf(undefined)).toBeUndefined();
  });
});

describe("securityHeaders", () => {
  it("n'envoie HSTS qu'en HTTPS", () => {
    expect(securityHeaders(true)).toHaveProperty("Strict-Transport-Security");
    const http = securityHeaders(false);
    expect(http).not.toHaveProperty("Strict-Transport-Security");
    expect(http["X-Content-Type-Options"]).toBe("nosniff");
    expect(http["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});

describe("resolveRequestId / createNonce", () => {
  it("réutilise un identifiant amont valide", () => {
    expect(resolveRequestId("req-12345678")).toBe("req-12345678");
  });

  it.each([null, "court", "a b c d e f g h", "x".repeat(200)])(
    "génère un UUID si l'amont vaut %s",
    (value) => {
      expect(resolveRequestId(value)).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it("produit des nonces base64 distincts", () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(createNonce()).not.toBe(nonce);
  });
});
