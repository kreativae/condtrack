import Link from "next/link";
import { Badge } from "@/components/ui";
import { ageLabel, ticketStatus } from "@/lib/tickets";
import { TicketKindIcon } from "./look";

type Row = { id: string; number: number; kind: string; title: string; status: string; createdAt: Date; createdByName: string };

/** Lista curta de chamados para os painéis. `showAuthor`: síndico vê quem abriu. */
export function TicketMiniList({ items, showAuthor, now, empty }: { items: Row[]; showAuthor?: boolean; now: Date; empty?: string }) {
  if (!items.length) return <p className="px-5 py-6 text-sm text-muted">{empty ?? "Nenhum chamado."}</p>;
  return (
    <div className="divide-y divide-line">
      {items.map((t) => {
        const st = ticketStatus(t.status);
        return (
          <Link key={t.id} href={`/chamados/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-bg-2">
            <TicketKindIcon kind={t.kind} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="block truncate text-xs text-muted"><span className="font-num">#{t.number}</span>{showAuthor && ` · ${t.createdByName}`} · {ageLabel(t.createdAt, now)}</span>
            </span>
            <Badge tone={st.tone}>{st.label}</Badge>
          </Link>
        );
      })}
    </div>
  );
}
