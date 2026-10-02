import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { AuditView } from "@/components/audit/audit-view";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/auditoria">) {
  const me = await requireUser("superadmin");
  const sp = await searchParams;
  // Condomínio em foco (seletor do menu)
  const scope = await adminScope(me);
  return <AuditView where={scope ? { condominiumId: scope.id } : {}} base="/admin/auditoria" sp={sp} scopeName={scope?.name} />;
}
