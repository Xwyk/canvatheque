import { describe, expect, it } from "vitest";
import { isActivePath } from "@/lib/navigation";

describe("isActivePath", () => {
  it.each([
    ["/", "/", true],
    ["/models", "/", false],
    ["/models", "/models", true],
    ["/models/papillon", "/models", true],
    ["/modelsx", "/models", false],
  ])("%s actif pour %s : %s", (pathname, href, expected) => {
    expect(isActivePath(pathname, href)).toBe(expected);
  });
});
