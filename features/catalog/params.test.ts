import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  catalogSearchParams,
  licensesOf,
  parseCatalogParams,
  PAGE_SIZE,
} from "@/features/catalog/params";
import { decodeCursor, encodeCursor } from "@/lib/cursor";

describe("parseCatalogParams", () => {
  it("lit des filtres multiples depuis URLSearchParams ou searchParams de Next", () => {
    const fromUrl = parseCatalogParams(
      new URLSearchParams(
        "q=+étoile+&format=svg&format=exe&format=svg&category=decoration&category=../x&license=free&license=gratuit&tag=Noël&sort=downloads&limit=100",
      ),
    );
    expect(fromUrl).toEqual({
      q: "étoile",
      formats: ["svg"],
      categories: ["decoration"],
      licenses: ["free"],
      tags: ["noel"],
      sort: "downloads",
      cursor: null,
      limit: 48,
    });
    const fromRecord = parseCatalogParams({ format: ["cwprj", "svg"], tag: "boite", cursor: "c" });
    expect(fromRecord).toMatchObject({ formats: ["cwprj", "svg"], tags: ["boite"], cursor: "c" });
  });

  it("tri par défaut : pertinence avec recherche, sinon plus récents", () => {
    expect(parseCatalogParams({}).sort).toBe("recent");
    expect(parseCatalogParams({ q: "x" }).sort).toBe("relevance");
    expect(parseCatalogParams({ sort: "relevance" }).sort).toBe("recent");
    expect(parseCatalogParams({ sort: "inconnu", q: "x" }).sort).toBe("relevance");
    expect(parseCatalogParams({ limit: "abc" }).limit).toBe(PAGE_SIZE);
    expect(parseCatalogParams({ limit: "0" }).limit).toBe(1);
    expect(parseCatalogParams({ q: "a".repeat(150) }).q).toHaveLength(100);
  });

  it("reconstruit l'URL dans un ordre stable, sans le tri par défaut", () => {
    const filters = parseCatalogParams({
      q: "x",
      format: "svg",
      category: "deco",
      license: "personal",
      tag: "noel",
      sort: "relevance",
    });
    expect(catalogSearchParams(filters).toString()).toBe(
      "q=x&format=svg&category=deco&license=personal&tag=noel",
    );
    expect(catalogSearchParams({ ...filters, q: "", sort: "popular" }).get("sort")).toBe("popular");
    expect(activeFilterCount(filters)).toBe(4);
    expect(licensesOf(["free", "personal"])).toEqual(["CC0", "CC_BY", "CC_BY_SA", "PERSONAL_USE"]);
  });
});

describe("curseur", () => {
  it("encode et décode, refuse un curseur altéré", () => {
    const cursor = encodeCursor({ value: "2026-10-18T10:00:00.000Z", id: "cm1" });
    expect(decodeCursor(cursor)).toEqual({ value: "2026-10-18T10:00:00.000Z", id: "cm1" });
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("pas du base64 !")).toBeNull();
    expect(decodeCursor(Buffer.from('["a",""]').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('{"a":1}').toString("base64url"))).toBeNull();
    expect(decodeCursor("x".repeat(600))).toBeNull();
  });
});
