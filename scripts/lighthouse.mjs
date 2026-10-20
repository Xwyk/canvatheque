// Audit Lighthouse des pages clés contre la pile Docker (profil mobile par défaut :
// Moto G Power, 4G lente simulée). Chaque page est mesurée plusieurs fois et le passage
// médian (score de performance) est retenu, comme le recommande Lighthouse ; le script
// échoue si une catégorie passe sous le seuil.
//   npm run lighthouse   (LIGHTHOUSE_BASE_URL, LIGHTHOUSE_RUNS, LIGHTHOUSE_THRESHOLD)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.LIGHTHOUSE_BASE_URL ?? "http://localhost:3000";
const RUNS = Number(process.env.LIGHTHOUSE_RUNS ?? 3);
const THRESHOLD = Number(process.env.LIGHTHOUSE_THRESHOLD ?? 90);
const PAGES = ["/", "/models", "/models/papillon-monarque", "/help"];
const OUT = ".lighthouse";
const CATEGORIES = "performance,accessibility,best-practices,seo";

// npm lancé par son chemin absolu (fourni par `npm run`) : aucune recherche dans le PATH.
const NPM_CLI = process.env.npm_execpath;
if (!NPM_CLI) throw new Error("Lancer par npm run lighthouse (npm_execpath absent).");

function audit(url, file) {
  execFileSync(
    process.execPath,
    [
      NPM_CLI,
      "exec",
      "--yes",
      "--package=lighthouse@13.5.0",
      "--",
      "lighthouse",
      url,
      "--quiet",
      "--chrome-flags=--headless=new",
      `--only-categories=${CATEGORIES}`,
      "--output=json",
      `--output-path=${file}`,
    ],
    { stdio: "ignore" },
  );
  return JSON.parse(readFileSync(file, "utf8"));
}

mkdirSync(OUT, { recursive: true });
let failed = false;
for (const page of PAGES) {
  const name = page === "/" ? "accueil" : page.slice(1).replaceAll("/", "-");
  const reports = Array.from({ length: RUNS }, (_, run) =>
    audit(`${BASE}${page}`, path.join(OUT, `${name}-${run + 1}.json`)),
  ).sort((a, b) => a.categories.performance.score - b.categories.performance.score);
  const report = reports[Math.floor(reports.length / 2)];
  const scores = Object.values(report.categories).map((c) => [c.id, Math.round(c.score * 100)]);
  const lcp = Math.round(report.audits["largest-contentful-paint"].numericValue);
  const low = scores.filter(([, score]) => score < THRESHOLD);
  failed ||= low.length > 0;
  const all = reports.map((r) => Math.round(r.categories.performance.score * 100)).join("/");
  process.stdout.write(
    `${page.padEnd(28)} ${scores.map(([id, s]) => `${id} ${s}`).join(" · ")} · LCP ${lcp} ms (performance : ${all})${low.length ? "  ← sous le seuil" : ""}\n`,
  );
}
process.exit(failed ? 1 : 0);
