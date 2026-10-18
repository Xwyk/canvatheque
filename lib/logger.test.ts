import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { REDACTED_PATHS, createLogger, logger, truncateIp } from "@/lib/logger";

describe("truncateIp", () => {
  it.each([
    ["192.168.12.34", "192.168.12.0"],
    ["203.0.113.9, 10.0.0.1", "203.0.113.0"],
    ["2001:db8:85a3:8d3:1319:8a2e:370:7348", "2001:db8:85a3:8d3::"],
  ])("tronque %s en %s", (input, expected) => {
    expect(truncateIp(input)).toBe(expected);
  });

  it.each([[null], [undefined], [""], ["pas-une-ip"], ["1.2.3"]])(
    "renvoie undefined pour %s",
    (input) => {
      expect(truncateIp(input)).toBeUndefined();
    },
  );
});

describe("createLogger", () => {
  it("masque les données personnelles", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const log = pino({ redact: { paths: REDACTED_PATHS, censor: "[masqué]" } }, sink);
    log.info({ email: "a@b.c", user: { password: "secret" } }, "test");
    expect(lines[0]).not.toContain("a@b.c");
    expect(lines[0]).not.toContain("secret");
    expect(lines[0]).toContain("[masqué]");
  });

  it("respecte le niveau demandé et partage une instance globale", () => {
    expect(createLogger({ level: "warn" }).level).toBe("warn");
    expect(createLogger({ level: "debug", pretty: true }).level).toBe("debug");
    expect(logger).toBe((globalThis as { canvathequeLogger?: unknown }).canvathequeLogger);
  });
});
