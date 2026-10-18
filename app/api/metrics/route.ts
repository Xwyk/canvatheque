import { env } from "@/lib/env";
import { metrics } from "@/lib/metrics";
import { safeEqual } from "@/lib/tokens";

export async function GET(request: Request) {
  const token = env().METRICS_TOKEN;
  if (!token) return new Response("Not Found", { status: 404 });

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!safeEqual(provided, token)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="metrics"' },
    });
  }

  const { registry } = metrics();
  return new Response(await registry.metrics(), {
    headers: { "Content-Type": registry.contentType, "Cache-Control": "no-store" },
  });
}
