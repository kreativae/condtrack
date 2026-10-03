import "server-only";
import { cookies } from "next/headers";

// Aviso rápido ("toast") depois de uma ação: a server action grava um cookie de vida curta e o
// <Toaster> do layout mostra no canto da tela (e apaga). Funciona com refresh e com redirect.
export const FLASH_COOKIE = "flash";

export async function flash(message: string, tone: "ok" | "info" = "ok") {
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ message, tone, at: Date.now() })), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false, // o Toaster lê no navegador
  });
}
