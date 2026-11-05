import { NextResponse, type NextRequest } from "next/server";
import { basicPassword } from "@/lib/text";

/**
 * Optional password protection. Set APP_PASSWORD to require HTTP Basic auth
 * (any username) on every page except the read-only buddy page.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  if (basicPassword(request.headers.get("authorization") ?? "") === password) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RightFeed"' },
  });
}

export const config = {
  matcher: ["/((?!share/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
