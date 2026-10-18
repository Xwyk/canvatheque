import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Jeton aléatoire URL-safe (256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Seul le hachage est stocké en base. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparaison à temps constant de deux secrets. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
