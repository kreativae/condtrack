import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

const PUBLIC = ["/login", "/primeiro-acesso"];

// Checagem otimista: apenas redireciona. A autorização real acontece em cada
// página/ação via requireUser() e nas regras de lib/workflow.ts.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session && (isPublic || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // /api/upload e /api/stripe/webhook ficam fora: fazem a própria autenticação
  // (upload por sessão, webhook pela assinatura do Stripe) e precisam do corpo
  // original — o proxy bufferiza o corpo da requisição em memória.
  // /api/branding: imagens públicas da tela de login (e upload, que confere o superadmin).
  matcher: ["/((?!_next/static|_next/image|api/upload|api/branding|api/stripe/webhook|icon.svg|manifest.webmanifest|favicon.ico).*)"],
};
