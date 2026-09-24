import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { FeedCard, feedInclude } from "@/components/feed-card";
import { Card, Empty, PageHeader } from "@/components/ui";
import { FrozenPage, FrozenTop, Pager, ScrollArea, pageParam, withPage } from "@/components/frozen";

export const metadata: Metadata = { title: "Serviços do prédio" };

const PAGE = 10;

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const user = await requireUser("syndic", "caretaker", "council", "resident");
  const sp = await searchParams;
  const where = { condominiumId: user.condominiumId!, status: "approved" };
  const total = await db.serviceOrder.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const items = await db.serviceOrder.findMany({ where, include: feedInclude, orderBy: { approvedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE });

  return (
    <div className="mx-auto max-w-2xl">
      <FrozenPage>
        <FrozenTop>
          <PageHeader eyebrow="Transparência" title="Serviços realizados" description="Tudo o que foi feito no condomínio, com registro de antes e depois, quem executou e quem aprovou." />
        </FrozenTop>
        <ScrollArea className="space-y-6" footer={<Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/feed", sp, p)} />}>
          {items.length ? items.map((o) => <FeedCard key={o.id} o={o} />) : <Card><Empty icon={<Sparkles className="size-8" />} title="Nenhum serviço publicado ainda" /></Card>}
        </ScrollArea>
      </FrozenPage>
    </div>
  );
}
