import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";
import { FrozenPage, FrozenTop, Pager, ScrollCard, pageParam, stickyHead, withPage } from "@/components/frozen";

const PAGE = 50;

/** Logs de auditoria com paginação (superadmin: todos ou o condomínio em foco; síndico: o próprio). */
export async function AuditView({ where, base, sp, scopeName, showCondo = true }: {
  where: Prisma.AuditLogWhereInput;
  base: string;
  sp: Record<string, string | string[] | undefined>;
  scopeName?: string | null;
  showCondo?: boolean;
}) {
  const total = await db.auditLog.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const logs = await db.auditLog.findMany({
    where,
    include: { user: { select: { name: true } }, condominium: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE,
    take: PAGE,
  });
  const actors = await db.user.findMany({ where: { id: { in: logs.map((l) => l.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const cols = showCondo ? 6 : 5;

  return (
    <FrozenPage>
      <FrozenTop>
        <PageHeader eyebrow="Segurança" title="Logs de auditoria" description={`${total} registro(s)${scopeName ? ` de ${scopeName}` : ""} — todas as ações críticas com IP, user-agent e horário.`} />
      </FrozenTop>

      <ScrollCard footer={<Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage(base, sp, p)} />}>
          <table className="w-full min-w-[820px] text-sm">
            <thead className={`${stickyHead} text-left text-xs text-muted`}>
              <tr>
                <th className="px-5 py-3 font-medium">Quando</th>
                <th className="px-5 py-3 font-medium">Usuário</th>
                <th className="px-5 py-3 font-medium">Ação</th>
                <th className="px-5 py-3 font-medium">Entidade</th>
                {showCondo && <th className="px-5 py-3 font-medium">Condomínio</th>}
                <th className="px-5 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((l) => {
                const actor = l.actorId && l.actorId !== l.userId ? actors.find((a) => a.id === l.actorId)?.name : null;
                return (
                  <tr key={l.id} className="align-top transition hover:bg-bg-2/60">
                    <td className="whitespace-nowrap px-5 py-3 font-num text-xs text-muted">{fmtDateTime(l.createdAt)}</td>
                    <td className="px-5 py-3">{l.user?.name ?? "—"}{actor && <p className="text-[11px] text-brand">via {actor}</p>}</td>
                    <td className="px-5 py-3"><Badge tone={l.action.includes("fail") || l.action.includes("reject") || l.action.startsWith("de") ? "bad" : l.action.includes("impersonate") ? "brand" : "muted"}>{l.action}</Badge></td>
                    <td className="px-5 py-3 text-xs">
                      {l.entityType === "service_order" && l.entityId ? <Link href={`/os/${l.entityId}`} className="text-brand hover:underline">{l.entityType}</Link> : l.entityType}
                      {l.newValues && <p className="mt-1 max-w-xs truncate font-mono text-[10px] text-muted" title={l.newValues}>{l.newValues}</p>}
                    </td>
                    {showCondo && <td className="px-5 py-3 text-xs text-muted">{l.condominium?.name ?? "—"}</td>}
                    <td className="px-5 py-3 font-mono text-[11px] text-muted" title={l.userAgent ?? ""}>{l.ipAddress ?? "—"}</td>
                  </tr>
                );
              })}
              {!logs.length && (
                <tr><td colSpan={cols} className="px-5 py-16 text-center text-muted">Nenhum registro de auditoria.</td></tr>
              )}
            </tbody>
          </table>
      </ScrollCard>
    </FrozenPage>
  );
}
