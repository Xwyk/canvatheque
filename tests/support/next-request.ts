/**
 * Simulation minimale du contexte de requête Next (cookies, en-têtes, redirect) pour
 * appeler Server Actions et pages hors du serveur Next. Les vi.mock correspondants doivent
 * figurer en tête de chaque fichier de test (hissage) :
 *
 *   vi.mock("next/headers", async () => (await import("@/tests/support/next-request")).headersModule);
 *   vi.mock("next/navigation", async () => (await import("@/tests/support/next-request")).navigationModule);
 */
export const requestContext = {
  cookies: new Map<string, { value: string; options?: unknown }>(),
  headers: new Headers({ "x-forwarded-for": "203.0.113.10" }),
  reset() {
    this.cookies.clear();
    this.headers = new Headers({ "x-forwarded-for": "203.0.113.10" });
  },
};

export class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

export const cookieStore = {
  get: (name: string) => {
    const entry = requestContext.cookies.get(name);
    return entry ? { name, value: entry.value } : undefined;
  },
  set: (name: string, value: string, options?: unknown) => {
    requestContext.cookies.set(name, { value, options });
  },
  delete: (name: string) => {
    requestContext.cookies.delete(name);
  },
};

/** Exécute une action et renvoie l'URL de redirection (ou lève si aucune). */
export async function expectRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
  throw new Error("Redirection attendue");
}

export function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

export const headersModule = {
  cookies: async () => cookieStore,
  headers: async () => requestContext.headers,
};

export const navigationModule = {
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  usePathname: () => "/",
};
