import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import type { CurrentUser } from "./auth";

export async function audit(
  user: Pick<CurrentUser, "id" | "condominiumId" | "impersonator"> | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  values?: { old?: unknown; new?: unknown; condominiumId?: string | null },
) {
  const h = await headers();
  await db.auditLog.create({
    data: {
      userId: user?.id,
      actorId: user?.impersonator?.id ?? user?.id,
      condominiumId: values?.condominiumId ?? user?.condominiumId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      oldValues: values?.old === undefined ? null : JSON.stringify(values.old),
      newValues: values?.new === undefined ? null : JSON.stringify(values.new),
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    },
  });
}
