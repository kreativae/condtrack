import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Download, Lock, LockOpen, Paperclip, Plus, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, nowMs } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { financeAccess, financeCondo, financePeriod, shiftMonth } from "@/lib/finance-server";
import { FIN_STATUS, FIN_TYPES, LOG_LABEL, fmtBRL, fmtDayBR, type FinStatus } from "@/lib/finance";
import { setCouncilFinanceAccess } from "@/app/actions/finance";
import { Badge, Card, CardHeader, Empty, Input, LinkButton, PageHeader, Select, Stat, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Financeiro" };

type SP = Record<string, string | string[] | undefined>;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const str = (v: unknown) => (typeof v === "string" ? v : "");

export default async function FinancePage({ searchParams }: PageProps<"/financeiro">) {
  const user = await requireUser("superadmin", "syndic", "council");
  const sp: SP = await searchParams;

  // Superadmin escolhe o condomínio
  if (user.role === "superadmin" && !sp.condo) {
    const condos = await db.condominium.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    return (
      <div className="mx-auto max-w-xl animate-in">
        <PageHeader eyebrow="Gestão" title="Financeiro" description="Escolha o condomínio para ver receitas, despesas e notas fiscais." />
        <Card>
          <form className="flex gap-2 p-5">
            <Select name="condo" required defaultValue="" className="flex-1">
              <option value="" disabled>Selecione o condomínio…</option>
              {condos.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <button className={buttonClass("brand")}>Abrir</button>
          </form>
        </Card>
      </div>
    );
  }

  const condo = await financeCondo(user, sp.condo);
  if (!condo) redirect("/financeiro");
  const access = financeAccess(user, condo);
  if (!access.view) redirect("/dashboard");

  const p = financePeriod(sp);
  const now = nowMs();
  const tipo = str(sp.tipo);
  const status = str(sp.status);
  const categoria = str(sp.categoria);
  const q = str(sp.q).trim();
  const excluidos = access.edit && sp.excluidos === "1";

  const base: Prisma.FinanceEntryWhereInput = { condominiumId: condo.id, date: { gte: p.from, lt: p.to } };
  const where: Prisma.FinanceEntryWhereInput = {
    ...base,
    deletedAt: excluidos ? { not: null } : null,
    ...(tipo in FIN_TYPES && { type: tipo }),
    ...(status in FIN_STATUS && { status }),
    ...(categoria && { category: categoria }),
    ...(q && {
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { counterparty: { contains: q, mode: "insensitive" } },
        { document: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [entries, totals, categories, catTotals, overdue, activity, lastAccess] = await Promise.all([
    db.financeEntry.findMany({
      where,
      include: { _count: { select: { attachments: { where: { deletedAt: null } } } }, createdBy: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
    db.financeEntry.groupBy({ by: ["type", "status"], where: { ...base, deletedAt: null }, _sum: { amountCents: true } }),
    db.financeEntry.findMany({ where: { condominiumId: condo.id, deletedAt: null }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    db.financeEntry.groupBy({ by: ["category"], where: { ...base, deletedAt: null, type: "expense", status: { not: "cancelled" } }, _sum: { amountCents: true } }),
    db.financeEntry.count({ where: { condominiumId: condo.id, deletedAt: null, status: "pending", dueDate: { lt: new Date(now) } } }),
    db.financeLog.findMany({ where: { condominiumId: condo.id }, orderBy: { createdAt: "desc" }, take: 10, include: { entry: { select: { id: true, description: true } } } }),
    access.manageAccess ? db.financeLog.findFirst({ where: { condominiumId: condo.id, action: "council_access" }, orderBy: { createdAt: "desc" } }) : null,
  ]);

  const sum = (type: string, st: FinStatus) => totals.find((t) => t.type === type && t.status === st)?._sum.amountCents ?? 0;
  const incomePaid = sum("income", "paid");
  const expensePaid = sum("expense", "paid");
  const toPay = sum("expense", "pending");
  const toReceive = sum("income", "pending");
  const catMax = Math.max(1, ...catTotals.map((c) => c._sum.amountCents ?? 0));
  const catSorted = [...catTotals].sort((a, b) => (b._sum.amountCents ?? 0) - (a._sum.amountCents ?? 0)).slice(0, 8);

  // Links preservando os filtros
  const keep = { condo: user.role === "superadmin" ? condo.id : undefined, tipo, status, categoria, q, excluidos: excluidos ? "1" : undefined };
  const href = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, ...(p.kind === "year" ? { ano: p.key } : { mes: p.key }), ...over })) if (v) u.set(k, v);
    const s = u.toString();
    return `/financeiro${s ? `?${s}` : ""}`;
  };
  const periodLabel = p.kind === "year" ? `Ano de ${p.key}` : `${MONTHS[Number(p.key.slice(5)) - 1]} de ${p.key.slice(0, 4)}`;
  const condoQS = user.role === "superadmin" ? `?condo=${condo.id}` : "";
  const exportQS = new URLSearchParams({ ...(user.role === "superadmin" && { condo: condo.id }), ...(p.kind === "year" ? { ano: p.key } : { mes: p.key }) }).toString();

  return (
    <div className="animate-in space-y-6">
      <PageHeader
        eyebrow={user.role === "superadmin" ? condo.name : "Gestão"}
        title="Financeiro"
        description={access.edit ? "Receitas, despesas e notas fiscais do condomínio, com histórico de quem lançou, editou e visualizou." : "Receitas, despesas e notas fiscais do condomínio (somente leitura)."}
        actions={
          <>
            <a href={`/api/financeiro/exportar?${exportQS}`} className={buttonClass("outline")}><Download className="size-4" />Planilha</a>
            {access.edit && <LinkButton href={`/financeiro/novo${condoQS}`}><Plus className="size-4" />Novo lançamento</LinkButton>}
          </>
        }
      />

      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        {p.kind === "month" ? (
          <>
            <Link href={href({ mes: shiftMonth(p.key, -1) })} className={buttonClass("outline", "sm")} aria-label="Mês anterior"><ChevronLeft className="size-4" /></Link>
            <p className="min-w-40 text-center font-display text-lg font-semibold first-letter:uppercase">{periodLabel}</p>
            <Link href={href({ mes: shiftMonth(p.key, 1) })} className={buttonClass("outline", "sm")} aria-label="Próximo mês"><ChevronRight className="size-4" /></Link>
            <Link href={href({ mes: undefined, ano: p.key.slice(0, 4) })} className={cx(buttonClass("ghost", "sm"), "ml-1")}>Ver o ano todo</Link>
          </>
        ) : (
          <>
            <Link href={href({ ano: String(Number(p.key) - 1) })} className={buttonClass("outline", "sm")} aria-label="Ano anterior"><ChevronLeft className="size-4" /></Link>
            <p className="min-w-40 text-center font-display text-lg font-semibold">{periodLabel}</p>
            <Link href={href({ ano: String(Number(p.key) + 1) })} className={buttonClass("outline", "sm")} aria-label="Próximo ano"><ChevronRight className="size-4" /></Link>
            <Link href={href({ ano: undefined, mes: `${p.key}-01` })} className={cx(buttonClass("ghost", "sm"), "ml-1")}>Ver por mês</Link>
          </>
        )}
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Receitas recebidas" value={fmtBRL(incomePaid)} tone="ok" />
        <Stat label="Despesas pagas" value={fmtBRL(expensePaid)} tone="bad" />
        <Stat label="Saldo do período" value={fmtBRL(incomePaid - expensePaid)} tone={incomePaid - expensePaid < 0 ? "bad" : undefined} hint="Recebido menos pago" />
        <Stat label="A receber" value={fmtBRL(toReceive)} tone="info" />
        <Stat label="A pagar" value={fmtBRL(toPay)} tone="warn" hint={overdue ? `${overdue} vencido(s), em qualquer mês` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {/* Filtros */}
          <form className="flex flex-wrap gap-2">
            {user.role === "superadmin" && <input type="hidden" name="condo" value={condo.id} />}
            <input type="hidden" name={p.kind === "year" ? "ano" : "mes"} value={p.key} />
            <Input name="q" defaultValue={q} placeholder="Buscar descrição, fornecedor ou nº da nota" className="min-w-56 flex-1" />
            <Select name="tipo" defaultValue={tipo} className="w-auto">
              <option value="">Receitas e despesas</option>
              {Object.entries(FIN_TYPES).map(([k, l]) => <option key={k} value={k}>{l}s</option>)}
            </Select>
            <Select name="status" defaultValue={status} className="w-auto">
              <option value="">Todas as situações</option>
              {Object.entries(FIN_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </Select>
            <Select name="categoria" defaultValue={categoria} className="w-auto">
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}
            </Select>
            {access.edit && (
              <label className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg-2">
                <input type="checkbox" name="excluidos" value="1" defaultChecked={excluidos} className="size-4 accent-[var(--brand)]" />Excluídos
              </label>
            )}
            <button className={buttonClass("outline")}>Filtrar</button>
          </form>

          {/* Lançamentos */}
          <Card className="overflow-hidden">
            {entries.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-line bg-surface-2 text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Data</th>
                      <th className="px-4 py-2.5 font-medium">Descrição</th>
                      <th className="px-4 py-2.5 font-medium">Categoria</th>
                      <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                      <th className="px-4 py-2.5 font-medium">Situação</th>
                      <th className="px-4 py-2.5 font-medium"><span className="sr-only">Anexos</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const st = FIN_STATUS[e.status as FinStatus];
                      const late = e.status === "pending" && e.dueDate && e.dueDate.getTime() < now;
                      return (
                        <tr key={e.id} className="border-b border-line last:border-0 hover:bg-bg-2/60">
                          <td className="whitespace-nowrap px-4 py-3 text-fg-2">{fmtDayBR(e.date)}</td>
                          <td className="px-4 py-3">
                            <Link href={`/financeiro/${e.id}`} className="font-medium hover:text-brand">{e.description}</Link>
                            <p className="text-xs text-muted">{[e.counterparty, e.document && `Doc. ${e.document}`, e.createdBy && `por ${e.createdBy.name}`].filter(Boolean).join(" · ")}</p>
                          </td>
                          <td className="px-4 py-3 text-fg-2">{e.category}</td>
                          <td className={cx("whitespace-nowrap px-4 py-3 text-right font-num font-semibold tabular-nums", e.type === "income" ? "text-ok" : "text-fg")}>
                            {e.type === "income" ? "+" : "−"} {fmtBRL(e.amountCents)}
                          </td>
                          <td className="px-4 py-3">
                            {e.deletedAt ? <Badge tone="muted">Excluído</Badge> : late ? <Badge tone="bad" dot>Vencido</Badge> : <Badge tone={st?.tone ?? "muted"} dot>{st?.label ?? e.status}</Badge>}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {e._count.attachments > 0 && <span className="inline-flex items-center gap-1 text-xs" title="Anexos"><Paperclip className="size-3.5" />{e._count.attachments}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon={<Wallet />} title={excluidos ? "Nenhum lançamento excluído neste período" : "Nenhum lançamento neste período"}>
                {access.edit && !excluidos ? "Registre receitas e despesas com as notas fiscais em “Novo lançamento”." : null}
              </Empty>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* Despesas por categoria */}
          <Card>
            <CardHeader title="Despesas por categoria" subtitle={periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)} />
            <div className="space-y-3 p-5">
              {catSorted.length ? catSorted.map((c) => (
                <div key={c.category}>
                  <div className="mb-1 flex justify-between gap-3 text-xs">
                    <span className="truncate text-fg-2">{c.category}</span>
                    <span className="font-num font-semibold tabular-nums">{fmtBRL(c._sum.amountCents ?? 0)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-2"><div className="h-full rounded-full" style={{ width: `${((c._sum.amountCents ?? 0) / catMax) * 100}%`, background: "var(--chart-1)" }} /></div>
                </div>
              )) : <p className="text-sm text-muted">Sem despesas no período.</p>}
            </div>
          </Card>

          {/* Acesso do conselho */}
          {access.manageAccess && (
            <Card>
              <CardHeader
                title="Acesso do conselho"
                subtitle="O conselho só visualiza: não lança nem edita."
                action={condo.councilFinanceAccess ? <Badge tone="ok" dot>Liberado</Badge> : <Badge tone="muted" dot>Bloqueado</Badge>}
              />
              <form action={setCouncilFinanceAccess} className="space-y-3 p-5">
                <input type="hidden" name="condominiumId" value={condo.id} />
                <input type="hidden" name="enabled" value={condo.councilFinanceAccess ? "0" : "1"} />
                <p className="text-sm text-fg-2">
                  {condo.councilFinanceAccess
                    ? "Os membros do conselho veem os lançamentos, as notas fiscais e a planilha. Cada visualização fica registrada."
                    : "Os membros do conselho não veem o Financeiro nem o item no menu."}
                </p>
                <button className={buttonClass(condo.councilFinanceAccess ? "outline" : "brand", "sm")}>
                  {condo.councilFinanceAccess ? <><Lock className="size-3.5" />Retirar acesso</> : <><LockOpen className="size-3.5" />Liberar acesso</>}
                </button>
                {lastAccess && <p className="text-xs text-muted">Última alteração por {lastAccess.userName}, {fmtDateTime(lastAccess.createdAt)}.</p>}
              </form>
            </Card>
          )}

          {/* Atividade recente */}
          <Card>
            <CardHeader title="Atividade recente" subtitle="Quem lançou, editou, visualizou ou anexou." />
            <ul className="divide-y divide-line">
              {activity.length ? activity.map((l) => (
                <li key={l.id} className="px-5 py-3 text-xs">
                  <p className="text-fg-2">
                    <span className="font-semibold text-fg">{l.userName}</span>
                    <span className="text-muted"> ({ROLE_LABEL[l.userRole as Role] ?? l.userRole})</span> {LOG_LABEL[l.action] ?? l.action}
                    {l.entry && <> · <Link href={`/financeiro/${l.entry.id}`} className="font-medium text-brand hover:underline">{l.entry.description}</Link></>}
                  </p>
                  <p className="mt-0.5 text-muted">{fmtDateTime(l.createdAt)}</p>
                </li>
              )) : <li className="px-5 py-4 text-sm text-muted">Nada registrado ainda.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
