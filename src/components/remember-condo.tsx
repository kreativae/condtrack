"use client";

import { useEffect } from "react";

/** Último condomínio aberto pelo superadmin (Financeiro, Checklist), neste aparelho. */
export const ADMIN_CONDO_COOKIE = "sa_condo";

/** Superadmin: lembra o último condomínio aberto. */
export function RememberCondo({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `${ADMIN_CONDO_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
  }, [id]);
  return null;
}
