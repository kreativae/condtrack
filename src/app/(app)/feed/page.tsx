import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FeedCard, feedInclude } from "@/components/feed-card";
import { Card, Empty, PageHeader, Select, buttonClass } from "@/components/ui";
import { FrozenPage, FrozenTop, Pager, ScrollArea, pageParam, withPage } from "@/components/frozen";

export const metadata: Metadata = { title: "Serviços do prédio" };

const PAGE = 10;

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "council", "resident");
  const sp = await searchParams;
  const admin = user.role === "superadmin";
  // Superadmin vê todos os condomínios (com filtro); os demais, só o próprio
  const condos = admin ? await db.condominium.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const condo = admin && typeof sp.condo === "string" && condos.some((c) => c.id === sp.condo) ? sp.condo : null;
  const where = { status: "approved", ...(admin ? (condo ? { condominiumId: condo } : {}) : { condominiumId: user.condominiumId! }) };
  const total = await db.serviceOrder.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const items = await db.serviceOrder.findMany({ where, include: feedInclude, orderBy: { approvedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE });

  return (
    <div className="mx-auto max-w-2xl">
      <FrozenPage>
        <FrozenTop>
          <PageHeader
            eyebrow="Transparência"
            title="Serviços realizados"
            description={admin ? "Serviços entregues em todos os condomínios, com antes e depois, quem executou e quem aprovou." : "Tudo o que foi feito no condomínio, com registro de antes e depois, quem executou e quem aprovou."}
          />
          {admin && (
            <form className="mb-4 flex gap-2">
              <Select name="condo" defaultValue={condo ?? ""} className="flex-1">
                <option value="">Todos os condomínios</option>
                {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <button className={buttonClass("outline")}>Filtrar</button>
            </form>
          )}
        </FrozenTop>
        <ScrollArea className="space-y-6" footer={<Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/feed", sp, p)} />}>
          {items.length ? items.map((o) => <FeedCard key={o.id} o={o} showCondo={admin && !condo} />) : <Card><Empty icon={<Sparkles className="size-8" />} title="Nenhum serviço publicado ainda" /></Card>}
        </ScrollArea>
      </FrozenPage>
    </div>
  );
}
