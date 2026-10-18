import { NextResponse, type NextRequest } from "next/server";
import {
  buildCsp,
  createNonce,
  originOf,
  resolveRequestId,
  securityHeaders,
} from "@/lib/security/csp";

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const isHttps = (process.env.APP_URL ?? "").startsWith("https://");
  const nonce = createNonce();
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const csp = buildCsp({
    nonce,
    isDev,
    storageOrigin: originOf(process.env.S3_PUBLIC_URL),
    upgradeInsecure: isHttps,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  for (const [name, value] of Object.entries(securityHeaders(isHttps))) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|fonts/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
