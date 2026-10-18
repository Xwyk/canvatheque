import { describe, expect, it } from "vitest";
import { metrics, withRouteMetrics } from "@/lib/metrics";

async function counter(route: string, status: string): Promise<number> {
  const data = await metrics().httpRequests.get();
  return (
    data.values.find((v) => v.labels.route === route && v.labels.status === status)?.value ?? 0
  );
}

describe("withRouteMetrics", () => {
  it("compte les réponses par route et statut", async () => {
    const handler = withRouteMetrics("/test/ok", async () => new Response("ok", { status: 201 }));
    await handler(new Request("http://localhost/test"));
    expect(await counter("/test/ok", "201")).toBe(1);
    expect(metrics()).toBe(metrics());
  });

  it("compte les erreurs et les relance", async () => {
    const handler = withRouteMetrics("/test/ko", async () => {
      throw new Error("boom");
    });
    await expect(handler(new Request("http://localhost/test"))).rejects.toThrow("boom");
    expect(await counter("/test/ko", "500")).toBe(1);
    const errors = await metrics().errors.get();
    expect(errors.values.find((v) => v.labels.route === "/test/ko")?.value).toBe(1);
  });

  it("expose le format Prometheus", async () => {
    const text = await metrics().registry.metrics();
    expect(text).toContain("http_request_duration_seconds");
    expect(text).toContain("model_downloads_total");
  });
});
