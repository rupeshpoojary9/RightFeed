import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional password protection. Set APP_PASSWORD to require HTTP Basic auth
 * (any username) on every page except the read-only buddy page.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="MyTube"' },
  });
}

export const config = {
  matcher: ["/((?!share/|_next/static|_next/image|favicon.ico).*)"],
};
