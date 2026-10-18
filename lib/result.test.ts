import { describe, expect, it } from "vitest";
import { fail, httpStatusFor, ok } from "@/lib/result";

describe("Result", () => {
  it("construit les variantes succès et échec", () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
    expect(fail("RATE_LIMITED", "Trop de requêtes", { retryAfter: 30 })).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: "Trop de requêtes", retryAfter: 30 },
    });
  });

  it.each([
    ["VALIDATION", 400],
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["RATE_LIMITED", 429],
    ["INTERNAL", 500],
  ] as const)("%s → HTTP %i", (code, status) => {
    expect(httpStatusFor(code)).toBe(status);
  });
});
