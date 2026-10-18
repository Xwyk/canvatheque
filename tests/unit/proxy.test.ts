import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pose la CSP à nonce, l'identifiant de requête et les en-têtes de sécurité", () => {
    vi.stubEnv("APP_URL", "https://canvatheque.example");
    vi.stubEnv("S3_PUBLIC_URL", "https://canvatheque.example/s3");
    const response = proxy(new NextRequest("https://canvatheque.example/"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("upgrade-insecure-requests");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=");
    // Le nonce est transmis au rendu via les en-têtes de requête réécrits.
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
  });

  it("conserve un identifiant de requête amont et reste en HTTP sans HSTS", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "development");
    const request = new NextRequest("http://localhost:3000/", {
      headers: { "x-request-id": "amont-12345678" },
    });
    const response = proxy(request);
    expect(response.headers.get("x-request-id")).toBe("amont-12345678");
    expect(response.headers.get("Strict-Transport-Security")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toContain("'unsafe-eval'");
  });

  it("prolonge le cookie de session pendant la navigation (GET uniquement)", () => {
    vi.stubEnv("APP_URL", "https://canvatheque.example");
    const cookie = { cookie: "__Host-canvatheque.session=jeton" };
    const get = proxy(new NextRequest("https://canvatheque.example/models", { headers: cookie }));
    const renewed = get.cookies.get("__Host-canvatheque.session");
    expect(renewed).toMatchObject({
      value: "jeton",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    expect(new Date(renewed!.expires!).getTime()).toBeGreaterThan(
      Date.now() + 29 * 24 * 3600 * 1000,
    );

    const post = proxy(
      new NextRequest("https://canvatheque.example/login", { method: "POST", headers: cookie }),
    );
    expect(post.cookies.get("__Host-canvatheque.session")).toBeUndefined();
    const anonymous = proxy(new NextRequest("https://canvatheque.example/"));
    expect(anonymous.cookies.getAll()).toEqual([]);
  });

  it("exclut les ressources statiques et les préchargements", () => {
    const [matcher] = config.matcher;
    expect(matcher.source).toContain("_next/static");
    expect(matcher.missing.map((m) => m.key)).toContain("next-router-prefetch");
  });
});
