import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isProductionRuntime, validateBasicAuthHeader } from "@/lib/security/basic-auth";

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) {
    return true;
  }

  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return true;
  }

  // External systems must reach these endpoints without browser auth.
  if (pathname === "/api/webhooks/resend" || pathname.startsWith("/api/inngest")) {
    return true;
  }

  return false;
}

export function middleware(request: NextRequest) {
  if (!isProductionRuntime()) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return NextResponse.json(
      {
        error: "Server misconfigured: BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD are required in production"
      },
      {
        status: 500
      }
    );
  }

  const authHeader = request.headers.get("authorization");
  const valid = validateBasicAuthHeader(authHeader, username, password);

  if (valid) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="OutreachAI Admin"'
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
