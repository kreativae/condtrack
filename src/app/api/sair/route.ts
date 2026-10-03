import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";
import { setSessionCookie } from "@/lib/auth";

// Encerra uma sessão que não vale mais (conta desativada ou condomínio arquivado).
// Em "visualizar como", só volta para a conta do superadmin.
export async function GET(req: Request) {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (session?.actor && session.actor !== session.uid) {
    await setSessionCookie({ uid: session.actor });
    return NextResponse.redirect(new URL("/admin/usuarios", req.url));
  }
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login?desativado=1", req.url));
}
