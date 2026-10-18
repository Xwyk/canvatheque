import argon2 from "argon2";
import { dictionary } from "@zxcvbn-ts/language-common";

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";

/** Les 10 000 mots de passe les plus courants (fuites publiques, triés par fréquence). */
const COMMON_PASSWORDS = new Set(
  (dictionary["passwords-common"] as string[]).slice(0, 10_000).map((p) => p.toLowerCase()),
);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

// Paramètres OWASP pour argon2id : 19 Mio, 2 itérations, 1 fil.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Hachage factice vérifié quand l'adresse est inconnue : le temps de réponse ne révèle
 * pas l'existence du compte.
 */
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("canvatheque-dummy-password");
  await verifyPassword(await dummyHash, password);
  return false;
}
