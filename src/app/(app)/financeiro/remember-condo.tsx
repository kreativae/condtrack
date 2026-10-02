"use client";

import { useEffect } from "react";

export const FIN_CONDO_COOKIE = "fin_condo";

/** Superadmin: lembra o último condomínio aberto no Financeiro (neste aparelho). */
export function RememberCondo({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `${FIN_CONDO_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
  }, [id]);
  return null;
}
