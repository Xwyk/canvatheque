import { describe, expect, it } from "vitest";
import { sessionCookieName, sessionCookieOptions, SESSION_TTL_MS } from "@/lib/auth/session";
import { parseFlash } from "@/lib/flash-shared";
import { DAY, HOUR, rateLimitKey, slidingCount } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

describe("cookie de session", () => {
  it("utilise le préfixe __Host- en HTTPS seulement", () => {
    expect(sessionCookieName(true)).toBe("__Host-canvatheque.session");
    expect(sessionCookieName(false)).toBe("canvatheque.session");
  });

  it("est httpOnly, SameSite=Lax, sur tout le site", () => {
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    expect(sessionCookieOptions(true, expires)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires,
    });
  });
});

describe("rate limit : outils purs", () => {
  it("pondère le seau précédent selon la part de fenêtre écoulée", () => {
    expect(slidingCount(2, 10, 0)).toBe(12);
    expect(slidingCount(2, 10, 0.5)).toBe(7);
    expect(slidingCount(2, 10, 1)).toBe(2);
    expect(DAY).toBe(24 * HOUR);
  });

  it("hache les identifiants dans la clé", () => {
    const key = rateLimitKey("login", "203.0.113.9", "lucie@exemple.fr");
    expect(key).toMatch(/^login:[A-Za-z0-9_-]{22}$/);
    expect(key).not.toContain("203.0.113");
    expect(rateLimitKey("login", "203.0.113.9", "lucie@exemple.fr")).toBe(key);
    expect(rateLimitKey("login", null, undefined)).toMatch(/^login:/);
  });
});

describe("clientIp", () => {
  it("prend la première adresse de X-Forwarded-For, puis X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
    expect(clientIp(new Headers({ "x-real-ip": " 198.51.100.2 " }))).toBe("198.51.100.2");
    expect(clientIp(new Headers({ "x-forwarded-for": " , " }))).toBe("unknown");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("parseFlash", () => {
  const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value));

  it("accepte une clé auth.flash et ses paramètres", () => {
    expect(parseFlash(encode({ key: "auth.flash.welcome", values: { pseudo: "Lucie" } }))).toEqual({
      key: "auth.flash.welcome",
      values: { pseudo: "Lucie" },
    });
    expect(parseFlash(encode({ key: "auth.flash.signedOut", values: "x" }))).toEqual({
      key: "auth.flash.signedOut",
      values: undefined,
    });
  });

  it.each([
    undefined,
    "",
    "%E0%A4%A",
    encode({ key: "errors.generic" }),
    encode({ nope: 1 }),
    encode(null),
  ])("ignore une valeur invalide : %s", (raw) => {
    expect(parseFlash(raw)).toBeNull();
  });
});
