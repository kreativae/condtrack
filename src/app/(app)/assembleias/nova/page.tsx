import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { saveAssembly } from "@/app/actions/assembly";
import { Card, PageHeader } from "@/components/ui";
import { AssemblyForm } from "../assembly-form";

export const metadata: Metadata = { title: "Nova assembleia" };

export default async function NewAssemblyPage() {
  const user = await requireUser("superadmin", "syndic");
  const scope = await adminScope(user);
  const condoId = user.role === "superadmin" ? scope?.id : user.condominiumId;
  if (!condoId) redirect("/assembleias");
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href="/assembleias" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Assembleias</Link>
      <PageHeader eyebrow={scope?.name ?? "Assembleias"} title="Nova assembleia" description="Salve como rascunho, confira e publique a convocação quando estiver pronta." />
      <Card className="p-5 sm:p-8"><AssemblyForm action={saveAssembly.bind(null, null)} condominiumId={condoId} /></Card>
    </div>
  );
}
