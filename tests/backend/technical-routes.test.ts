import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET as metricsRoute } from "@/app/api/metrics/route";
import { resetEnvCache } from "@/lib/env";
import { setS3ForTests } from "@/lib/storage/s3";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
    setS3ForTests(undefined);
  });

  it("répond 200 quand base et stockage sont joignables", async () => {
    const response = await health(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", checks: { db: "ok", storage: "ok" } });
  });

  it("répond 503 et désigne le composant en panne", async () => {
    vi.stubEnv("S3_BUCKET_PREVIEWS", "bucket-inexistant");
    resetEnvCache();
    setS3ForTests(undefined);
    const response = await health(new Request("http://localhost/api/health"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      checks: { db: "ok", storage: "error" },
    });
  });
});

describe("GET /api/metrics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  const call = (authorization?: string) =>
    metricsRoute(
      new Request("http://localhost/api/metrics", {
        headers: authorization ? { authorization } : {},
      }),
    );

  it("exige le jeton Bearer", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer mauvais")).status).toBe(401);
    expect((await call("Basic test-metrics-token")).status).toBe(401);
  });

  it("expose les métriques Prometheus avec le bon jeton", async () => {
    await health(new Request("http://localhost/api/health"));
    const response = await call("Bearer test-metrics-token");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain('http_requests_total{route="/api/health"');
    expect(body).toContain("process_cpu_seconds_total");
  });

  it("est désactivé sans METRICS_TOKEN", async () => {
    vi.stubEnv("METRICS_TOKEN", "");
    resetEnvCache();
    expect((await call("Bearer test-metrics-token")).status).toBe(404);
  });
});
