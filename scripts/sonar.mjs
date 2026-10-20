#!/usr/bin/env node
/**
 * Analyse SonarQube locale ou en CI, Quality Gate bloquant.
 *
 * 1. Attend que SonarQube réponde (SONAR_HOST_URL, défaut http://localhost:9002).
 * 2. Instance neuve : remplace le mot de passe admin par défaut, crée le Quality Gate
 *    « Canvathèque » (Sonar way + couverture globale ≥ 80 %) et un jeton d'analyse.
 * 3. Lance le scanner (image Docker officielle) sur coverage/lcov.info ; échoue si le
 *    Quality Gate échoue.
 *
 * Prérequis : `npm run test:coverage` et
 *   docker compose --profile quality up -d sonarqube
 * Variables : SONAR_HOST_URL, SONAR_TOKEN (sinon créé), SONAR_ADMIN_PASSWORD (sinon
 *   généré dans .sonar/admin-password).
 *
 * SonarCloud (SONAR_ORGANIZATION renseignée) : ni installation ni Quality Gate à créer ;
 * SONAR_TOKEN obligatoire, clé du projet par SONAR_PROJECT_KEY. L'analyse automatique de
 * SonarCloud doit être désactivée (elle ne connaît pas la couverture).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HOST = process.env.SONAR_HOST_URL ?? "http://localhost:9002";
const ADMIN_PASSWORD = process.env.SONAR_ADMIN_PASSWORD || localAdminPassword();
const SCANNER_IMAGE = "sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0";
const GATE = "Canvatheque";
/** Clé SonarQube (lettres, chiffres, « _ - . : ») : rien d'autre ne part vers le scanner. */
function sonarKey(value, name) {
  if (value && !/^[\w.:-]{1,400}$/.test(value)) throw new Error(`${name} invalide`);
  return value;
}

const ORGANIZATION = sonarKey(process.env.SONAR_ORGANIZATION, "SONAR_ORGANIZATION");
const PROJECT_KEY = sonarKey(process.env.SONAR_PROJECT_KEY, "SONAR_PROJECT_KEY") ?? "canvatheque";

/** Mot de passe admin de l'instance locale : généré une fois, conservé hors dépôt. */
function localAdminPassword() {
  const file = ".sonar/admin-password";
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const generated = `Cv-${randomBytes(18).toString("base64url")}`;
  mkdirSync(".sonar", { recursive: true });
  writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

const log = (message) => process.stdout.write(`[sonar] ${message}\n`);

async function api(path, { method = "GET", auth, params } = {}) {
  const url = new URL(path, HOST);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const headers = auth ? { Authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {};
  const response = await fetch(url, { method, headers });
  const text = await response.text();
  return { status: response.status, body: text ? safeJson(text) : null };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function waitUntilUp(timeoutMs = 300_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { body } = await api("/api/system/status");
      if (body?.status === "UP") return;
    } catch {
      // pas encore joignable
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`SonarQube injoignable sur ${HOST}`);
}

async function adminAuth() {
  const candidate = `admin:${ADMIN_PASSWORD}`;
  if ((await api("/api/authentication/validate", { auth: candidate })).body?.valid) {
    const check = await api("/api/system/info", { auth: candidate });
    if (check.status !== 401) return candidate;
  }
  log("Instance neuve : remplacement du mot de passe administrateur par défaut");
  const changed = await api("/api/users/change_password", {
    method: "POST",
    auth: "admin:admin",
    params: { login: "admin", previousPassword: "admin", password: ADMIN_PASSWORD },
  });
  if (changed.status >= 300)
    throw new Error(`Changement du mot de passe admin impossible (${changed.status})`);
  return candidate;
}

async function ensureQualityGate(auth) {
  const { body } = await api("/api/qualitygates/list", { auth });
  if (!body.qualitygates.some((g) => g.name === GATE)) {
    log(`Création du Quality Gate « ${GATE} »`);
    await api("/api/qualitygates/copy", {
      method: "POST",
      auth,
      params: { sourceName: "Sonar way", name: GATE },
    });
    for (const metric of ["coverage"]) {
      await api("/api/qualitygates/create_condition", {
        method: "POST",
        auth,
        params: { gateName: GATE, metric, op: "LT", error: 80 },
      });
    }
  }
  await api("/api/qualitygates/set_as_default", { method: "POST", auth, params: { name: GATE } });
}

async function scannerToken(auth) {
  if (process.env.SONAR_TOKEN) return process.env.SONAR_TOKEN;
  const name = `canvatheque-${Date.now()}`;
  const { body, status } = await api("/api/user_tokens/generate", {
    method: "POST",
    auth,
    params: { name, type: "GLOBAL_ANALYSIS_TOKEN" },
  });
  if (status >= 300) throw new Error(`Création du jeton impossible (${status})`);
  return body.token;
}

/** Jeton d'analyse : caractères attendus seulement (il peut venir d'une réponse HTTP). */
function checkedToken(token) {
  if (!/^[\w-]{16,256}$/.test(token ?? "")) throw new Error("Jeton d'analyse invalide");
  return token;
}

async function main() {
  if (!existsSync("coverage/lcov.info")) {
    throw new Error("coverage/lcov.info absent : lancez d'abord `npm run test:coverage`");
  }
  let token = process.env.SONAR_TOKEN;
  if (ORGANIZATION) {
    if (!token) throw new Error("SONAR_TOKEN requis pour SonarCloud");
    log(`SonarCloud : organisation ${ORGANIZATION}, projet ${PROJECT_KEY}`);
  } else {
    log(`Attente de SonarQube (${HOST})`);
    await waitUntilUp();
    const auth = await adminAuth();
    await ensureQualityGate(auth);
    token = await scannerToken(auth);
  }

  // Le scanner tourne dans Docker : localhost de l'hôte devient host.docker.internal.
  const scannerHost = HOST.replace(/\/\/(localhost|127\.0\.0\.1)/, "//host.docker.internal");
  log("Analyse en cours");
  // Script de développement/CI : « docker » est résolu via le PATH de l'opérateur.
  // Valeurs variables transmises par l'environnement (`-e NOM` sans valeur) : rien de
  // dynamique dans les arguments, et le jeton n'apparaît pas dans la liste des processus.
  const scannerOptions = [
    `-Dsonar.projectKey=${PROJECT_KEY}`,
    ...(ORGANIZATION ? [`-Dsonar.organization=${ORGANIZATION}`] : []),
  ].join(" ");
  const result = spawnSync(
    "docker", // NOSONAR
    [
      "run",
      "--rm",
      "--add-host=host.docker.internal:host-gateway",
      "-e",
      "SONAR_HOST_URL",
      "-e",
      "SONAR_TOKEN",
      "-e",
      "SONAR_SCANNER_OPTS",
      "-v",
      `${resolve(".")}:/usr/src`,
      SCANNER_IMAGE,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SONAR_HOST_URL: scannerHost,
        SONAR_TOKEN: checkedToken(token),
        SONAR_SCANNER_OPTS: scannerOptions,
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(`Analyse en échec ou Quality Gate non atteint (code ${result.status})`);
  }
  log(`Quality Gate atteint : ${HOST}/dashboard?id=${PROJECT_KEY}`);
}

main().catch((error) => {
  process.stderr.write(`[sonar] ${error.message}\n`);
  process.exit(1);
});
