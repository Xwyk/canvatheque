import { existsSync } from "node:fs";
import { Client } from "pg";

// Base de la pile E2E (PostgreSQL publié sur 127.0.0.1, cf. docker-compose.e2e.yml) ;
// en local, l'adresse vient de .env comme pour `npm run db:seed`.
if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

/**
 * Donne le rôle d'administrateur à un compte de test : aucun parcours de l'interface ne le
 * permet sans administrateur existant, et le mot de passe de l'administrateur initial n'est
 * pas connu des tests.
 */
export async function promoteToAdmin(email: string): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`UPDATE "User" SET "role" = 'ADMIN' WHERE "email" = $1`, [email]);
  } finally {
    await client.end();
  }
}
