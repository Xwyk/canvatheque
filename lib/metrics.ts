import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

type Metrics = {
  registry: Registry;
  httpRequests: Counter<"route" | "method" | "status">;
  httpDuration: Histogram<"route" | "method">;
  errors: Counter<"route">;
  downloads: Counter<"format">;
};

function createMetrics(): Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ app: "canvatheque" });
  collectDefaultMetrics({ register: registry });
  return {
    registry,
    httpRequests: new Counter({
      name: "http_requests_total",
      help: "Requêtes HTTP traitées, par route et statut",
      labelNames: ["route", "method", "status"],
      registers: [registry],
    }),
    httpDuration: new Histogram({
      name: "http_request_duration_seconds",
      help: "Durée des requêtes HTTP (p50/p95 via histogram_quantile)",
      labelNames: ["route", "method"],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    errors: new Counter({
      name: "app_errors_total",
      help: "Erreurs serveur non gérées",
      labelNames: ["route"],
      registers: [registry],
    }),
    downloads: new Counter({
      name: "model_downloads_total",
      help: "Téléchargements de modèles servis",
      labelNames: ["format"],
      registers: [registry],
    }),
  };
}

const globalForMetrics = globalThis as unknown as { canvathequeMetrics?: Metrics };

export function metrics(): Metrics {
  globalForMetrics.canvathequeMetrics ??= createMetrics();
  return globalForMetrics.canvathequeMetrics;
}

/** Enveloppe un route handler pour mesurer statut, durée et erreurs. */
export function withRouteMetrics<Args extends unknown[]>(
  route: string,
  handler: (request: Request, ...args: Args) => Promise<Response>,
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request, ...args) => {
    const m = metrics();
    const end = m.httpDuration.startTimer({ route, method: request.method });
    try {
      const response = await handler(request, ...args);
      m.httpRequests.inc({ route, method: request.method, status: String(response.status) });
      return response;
    } catch (error) {
      m.httpRequests.inc({ route, method: request.method, status: "500" });
      m.errors.inc({ route });
      throw error;
    } finally {
      end();
    }
  };
}
