import pino, { type Logger } from "pino";

/** Tronque une IP : dernier octet IPv4 ou 64 derniers bits IPv6 masqués. */
export function truncateIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  const value = ip.split(",")[0]!.trim();
  if (value.includes(".") && !value.includes(":")) {
    const parts = value.split(".");
    if (parts.length !== 4) return undefined;
    return `${parts.slice(0, 3).join(".")}.0`;
  }
  if (value.includes(":")) {
    const groups = value.split(":").slice(0, 4);
    return `${groups.join(":")}::`;
  }
  return undefined;
}

export const REDACTED_PATHS = [
  "email",
  "*.email",
  "password",
  "*.password",
  "passwordHash",
  "*.passwordHash",
  "token",
  "*.token",
  "headers.cookie",
  "headers.authorization",
];

export function createLogger(options: { level?: string; pretty?: boolean } = {}): Logger {
  return pino({
    level: options.level ?? process.env.LOG_LEVEL ?? "info",
    base: { service: "canvatheque" },
    redact: { paths: REDACTED_PATHS, censor: "[masqué]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(options.pretty
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  });
}

const globalForLogger = globalThis as unknown as { canvathequeLogger?: Logger };

export const logger: Logger =
  globalForLogger.canvathequeLogger ??
  (globalForLogger.canvathequeLogger = createLogger({
    pretty: process.env.NODE_ENV === "development" && process.env.LOG_PRETTY !== "false",
  }));
