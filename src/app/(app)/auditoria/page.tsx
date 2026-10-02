import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { AuditView } from "@/components/audit/audit-view";

export const metadata: Metadata = { title: "Auditoria" };

/** Auditoria do condomínio para o síndico (só com a permissão concedida pelo superadmin). */
export default async function SyndicAuditPage({ searchParams }: PageProps<"/auditoria">) {
  const me = await requireUser("syndic");
  if (!hasPermission(me, "audit") || !me.condominiumId) redirect("/dashboard");
  return <AuditView where={{ condominiumId: me.condominiumId }} base="/auditoria" sp={await searchParams} scopeName={me.condominium?.name} showCondo={false} />;
}
