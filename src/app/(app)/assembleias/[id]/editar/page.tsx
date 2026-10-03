import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { assemblyAccess, loadAssembly } from "@/lib/assembly-server";
import { parseOptions, toLocalInput } from "@/lib/assembly";
import { requestAssemblyEdit, saveAssembly } from "@/app/actions/assembly";
import { Card, PageHeader } from "@/components/ui";
import { AssemblyForm } from "../../assembly-form";

export const metadata: Metadata = { title: "Editar assembleia" };

export default async function EditAssemblyPage({ params }: PageProps<"/assembleias/[id]/editar">) {
  const user = await requireUser("superadmin", "syndic");
  const a = await loadAssembly((await params).id);
  if (!a || !assemblyAccess(user, a.condominiumId).manage) notFound();
  // Publicada: só o superadmin, e vira pedido para o síndico aprovar
  const request = a.status !== "draft";
  if (request && user.role !== "superadmin") redirect(`/assembleias/${a.id}`);
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href={`/assembleias/${a.id}`} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Voltar</Link>
      <PageHeader
        eyebrow={a.condominium.name}
        title="Editar assembleia"
        description={request ? "A assembleia já foi publicada: a alteração só vale depois que o síndico aprovar." : undefined}
      />
      <Card className="p-5 sm:p-8">
        <AssemblyForm
          action={request ? requestAssemblyEdit.bind(null, a.id) : saveAssembly.bind(null, a.id)}
          request={request}
          lockItems={a.status === "closed"}
          condominiumId={a.condominiumId}
          initial={{
            title: a.title, kind: a.kind, description: a.description, location: a.location, showPartial: a.showPartial,
            meetingAt: toLocalInput(a.meetingAt), votingEndsAt: toLocalInput(a.votingEndsAt),
            items: a.items.map((i) => ({ id: i.id, title: i.title, description: i.description, options: parseOptions(i.options) })),
          }}
        />
      </Card>
    </div>
  );
}
