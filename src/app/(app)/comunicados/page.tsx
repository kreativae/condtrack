import type { Metadata } from "next";
import { CheckCheck, Megaphone, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { confirmRead } from "@/app/actions/misc";
import { Badge, Card, CardHeader, Empty, PageHeader, buttonClass, type Tone } from "@/components/ui";
import { AnnouncementForm } from "./form";
import { FrozenPage, FrozenTop, Pager, ScrollArea, pageParam, withPage } from "@/components/frozen";

export const metadata: Metadata = { title: "Comunicados" };

const CAT: Record<string, [string, Tone]> = {
  general: ["Geral", "muted"], maintenance: ["Manutenção", "warn"], event: ["Evento", "info"], rules: ["Regras", "brand"], urgent: ["Urgente", "bad"],
};

const PAGE = 15;

export default async function AnnouncementsPage({ searchParams }: PageProps<"/comunicados">) {
  const user = await requireUser("syndic", "caretaker", "council");
  const sp = await searchParams;
  const where = { condominiumId: user.condominiumId! };
  const total = await db.announcement.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const [items, audience] = await Promise.all([
    db.announcement.findMany({ where, include: { author: { select: { name: true } } }, orderBy: { publishedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    user.role === "syndic" ? db.user.count({ where: { condominiumId: user.condominiumId, role: { in: ["council", "caretaker"] }, status: "active" } }) : 0,
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
              <span>{a.author.name}</span>
              {syndic ? (
                <span className="flex items-center gap-1"><CheckCheck className="size-3.5" />Lido por {readBy.length} de {audience}</span>
              ) : readBy.includes(user.id) ? (
                <span className="flex items-center gap-1 text-ok"><CheckCheck className="size-3.5" />Leitura confirmada</span>
              ) : (
                <form action={confirmRead.bind(null, a.id)}><button className={buttonClass("outline", "sm")}>Confirmar leitura</button></form>
              )}
            </div>
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
