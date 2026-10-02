"use client";

import { useEffect } from "react";
import { ADMIN_CONDO_COOKIE } from "@/lib/admin-scope";

/** Superadmin: lembra o último condomínio aberto. */
export function RememberCondo({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `${ADMIN_CONDO_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
  }, [id]);
  return null;
}
