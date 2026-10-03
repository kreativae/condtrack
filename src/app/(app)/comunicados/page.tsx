import type { Metadata } from "next";
import { CheckCheck, Megaphone, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { inCondo } from "@/lib/memberships";
import { requireUser } from "@/lib/auth";
import { DELETED_USER, fmtDateTime } from "@/lib/format";
import { confirmRead } from "@/app/actions/misc";
import { Badge, Card, CardHeader, Empty, PageHeader, buttonClass, type Tone } from "@/components/ui";
import { AnnouncementForm } from "./form";
import { AnnouncementDeletePanel, DeleteOwnAnnouncement, RequestAnnouncementDelete } from "./delete-request";
import { adminScope } from "@/lib/admin-scope-server";
import { FrozenPage, FrozenTop, Pager, ScrollArea, pageParam, withPage } from "@/components/frozen";

export const metadata: Metadata = { title: "Comunicados" };

const CAT: Record<string, [string, Tone]> = {
  general: ["Geral", "muted"], maintenance: ["Manutenção", "warn"], event: ["Evento", "info"], rules: ["Regras", "brand"], urgent: ["Urgente", "bad"],
};

const PAGE = 15;

export default async function AnnouncementsPage({ searchParams }: PageProps<"/comunicados">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "council");
  const sp = await searchParams;
  // Superadmin: comunicados do condomínio em foco (cartão do menu); só pede exclusão, quem aprova é o síndico
  const admin = user.role === "superadmin";
  const condoId = admin ? (await adminScope(user))?.id : user.condominiumId;
  if (!condoId) {
    return (
      <div className="mx-auto max-w-3xl animate-in">
        <PageHeader eyebrow="Mural de avisos" title="Comunicados" />
        <Card><Empty icon={<Megaphone className="size-8" />} title="Escolha um condomínio">Use o cartão do condomínio no menu para ver os comunicados dele.</Empty></Card>
      </div>
    );
  }
  const where = { condominiumId: condoId };
  const total = await db.announcement.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const [items, audience] = await Promise.all([
    db.announcement.findMany({
      where,
      include: { author: { select: { name: true } }, changes: { where: { status: "pending" }, take: 1 } },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    user.role === "syndic" || admin ? db.user.count({ where: { ...inCondo(condoId, ["council", "caretaker"]), status: "active" } }) : 0,
  ]);
  const syndic = user.role === "syndic";

  const list = (
    <ScrollArea className="space-y-4" footer={<Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/comunicados", sp, p)} />}>
      {items.length ? items.map((a) => {
        const readBy: string[] = JSON.parse(a.readBy);
        const [label, tone] = CAT[a.category] ?? CAT.general;
        return (
          <Card key={a.id} brand={a.priority === "high"} className="p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Badge tone={tone}>{label}</Badge>
              <span className="text-xs text-muted">{fmtDateTime(a.publishedAt)}</span>
            </div>
            <h2 className="font-display font-semibold text-xl">{a.title}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-2">{a.content}</p>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
              <span>{a.author?.name ?? DELETED_USER}</span>
              {syndic || admin ? (
                <span className="flex items-center gap-1"><CheckCheck className="size-3.5" />Lido por {readBy.length} de {audience}</span>
              ) : readBy.includes(user.id) ? (
                <span className="flex items-center gap-1 text-ok"><CheckCheck className="size-3.5" />Leitura confirmada</span>
              ) : (
                <form action={confirmRead.bind(null, a.id)}><button className={buttonClass("outline", "sm")}>Confirmar leitura</button></form>
              )}
            </div>
            {a.changes[0] ? (
              (syndic || admin) && (
                <AnnouncementDeletePanel
                  pending={{ id: a.changes[0].id, reason: a.changes[0].reason, requestedBy: a.changes[0].requestedBy, createdAt: a.changes[0].createdAt.toISOString() }}
                  canDecide={syndic && !user.impersonator}
                  canCancel={admin}
                />
              )
            ) : admin ? (
              <div className="mt-2 flex justify-end"><RequestAnnouncementDelete id={a.id} /></div>
            ) : (
              // Síndico apaga direto o que ele mesmo publicou
              syndic && a.authorId === user.id && <div className="mt-2 flex justify-end"><DeleteOwnAnnouncement id={a.id} /></div>
            )}
          </Card>
        );
      }) : <Card><Empty icon={<Megaphone className="size-8" />} title="Nenhum comunicado publicado" /></Card>}
    </ScrollArea>
  );

  if (!syndic) {
    return (
      <div className="mx-auto max-w-3xl">
        <FrozenPage>
          <FrozenTop><PageHeader eyebrow="Mural de avisos" title="Comunicados" /></FrozenTop>
          {list}
        </FrozenPage>
      </div>
    );
  }

  return (
    <FrozenPage>
      <FrozenTop>
        <PageHeader eyebrow="Mural de avisos" title="Comunicados" />
        {/* Celular: formulário recolhível acima da lista */}
        <details className="group mb-4 rounded-2xl border border-brand/30 bg-surface lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-semibold text-brand"><Plus className="size-4" />Novo comunicado</summary>
          <div className="max-h-[55dvh] overflow-auto border-t border-line p-5"><AnnouncementForm /></div>
        </details>
      </FrozenTop>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-col">{list}</div>
        {/* Desktop: formulário fixo na lateral enquanto a lista rola */}
        <Card brand className="hidden min-h-0 self-start overflow-auto lg:block lg:max-h-full">
          <CardHeader title="Novo comunicado" subtitle="Moradores e zeladoria serão notificados." />
          <div className="p-5"><AnnouncementForm /></div>
        </Card>
      </div>
    </FrozenPage>
  );
}
