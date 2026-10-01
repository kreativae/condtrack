import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, Eye, FileText, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { loadEntryFor, logView } from "@/lib/finance-server";
import { ATTACHMENT_KINDS, FIELD_LABEL, FIN_STATUS, FIN_TYPES, LOG_LABEL, centsToInput, dateToDay, fmtBRL, fmtDayBR, fmtSize, type FinStatus, type FinType } from "@/lib/finance";
import { deleteFinanceEntry, removeFinanceAttachment, restoreFinanceEntry, setFinanceStatus } from "@/app/actions/finance";
import { Alert, Badge, Card, CardHeader, buttonClass, cx } from "@/components/ui";
import { AttachmentUploader, ConfirmSubmit, EditEntry } from "./entry-client";

export const metadata: Metadata = { title: "Lançamento" };

const roleLabel = (r: string) => ROLE_LABEL[r as Role] ?? r;

export default async function FinanceEntryPage({ params }: PageProps<"/financeiro/[id]">) {
  const user = await requireUser("superadmin", "syndic", "council");
  const { id } = await params;
  const r = await loadEntryFor(user, id);
  if (!r) notFound();
  const { entry, access } = r;

  // Toda abertura do lançamento fica registrada (no máximo uma a cada 10 min por pessoa)
  await logView(user, { condominiumId: entry.condominiumId, entryId: entry.id, action: "viewed" });

  const [attachments, logs, createdBy, updatedBy] = await Promise.all([
    db.financeAttachment.findMany({ where: { entryId: id, ...(access.edit ? {} : { deletedAt: null }) }, include: { uploadedBy: { select: { name: true } } }, orderBy: { uploadedAt: "asc" } }),
    db.financeLog.findMany({ where: { entryId: id }, orderBy: { createdAt: "desc" }, take: 300 }),
    entry.createdById ? db.user.findUnique({ where: { id: entry.createdById }, select: { name: true } }) : null,
    entry.updatedById ? db.user.findUnique({ where: { id: entry.updatedById }, select: { name: true } }) : null,
  ]);
  const created = logs.findLast((l) => l.action === "created");
  const history = logs.filter((l) => l.action !== "viewed" && l.action !== "attachment_viewed");
  const views = logs.filter((l) => l.action === "viewed" || l.action === "attachment_viewed");
  // Resumo por pessoa: quantas vezes e quando foi a última
  const viewers = [...views.reduce((m, l) => {
    const k = l.userId ?? l.userName;
    const v = m.get(k) ?? { name: l.userName, role: l.userRole, count: 0, last: l.createdAt, files: 0 };
    if (l.action === "viewed") v.count++;
    else v.files++;
    if (l.createdAt > v.last) v.last = l.createdAt;
    return m.set(k, v);
  }, new Map<string, { name: string; role: string; count: number; last: Date; files: number }>()).values()];

  const st = FIN_STATUS[entry.status as FinStatus];
  const back = user.role === "superadmin" ? `/financeiro?condo=${entry.condominiumId}` : "/financeiro";
  const today = dateToDay(new Date());

  return (
    <div className="mx-auto max-w-5xl animate-in space-y-6">
      <Link href={back} className={buttonClass("ghost", "sm")}><ArrowLeft className="size-4" />Financeiro</Link>

      {entry.deletedAt && (
        <Alert tone="bad">Este lançamento foi excluído em {fmtDateTime(entry.deletedAt)} e não entra nos totais. O histórico continua guardado.</Alert>
      )}

      {/* Cabeçalho */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Badge tone={entry.type === "income" ? "ok" : "bad"}>{FIN_TYPES[entry.type as FinType] ?? entry.type}</Badge>
            <Badge tone={st?.tone ?? "muted"} dot>{st?.label ?? entry.status}</Badge>
            <Badge tone="muted">{entry.category}</Badge>
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight sm:text-[28px]">{entry.description}</h1>
          <p className="mt-1 text-sm text-muted">{entry.condominium.name}</p>
        </div>
        <p className={cx("font-num text-3xl font-bold tabular-nums", entry.type === "income" ? "text-ok" : "text-fg")}>
          {entry.type === "income" ? "+" : "−"} {fmtBRL(entry.amountCents)}
        </p>
      </header>

      {/* Ações */}
      {access.edit && (
        <div className="flex flex-wrap items-center gap-2">
          {entry.deletedAt ? (
            <form action={restoreFinanceEntry}>
              <input type="hidden" name="id" value={entry.id} />
              <button className={buttonClass("outline", "sm")}><RotateCcw className="size-3.5" />Restaurar</button>
            </form>
          ) : (
            <>
              {entry.status !== "cancelled" && (
                <form action={setFinanceStatus}>
                  <input type="hidden" name="id" value={entry.id} />
                  <input type="hidden" name="status" value={entry.status === "paid" ? "pending" : "paid"} />
                  {entry.status === "paid" ? (
                    <button className={buttonClass("outline", "sm")}><Undo2 className="size-3.5" />Voltar para pendente</button>
                  ) : (
                    <button className={buttonClass("success", "sm")}><CheckCircle2 className="size-3.5" />{entry.type === "income" ? "Marcar como recebido" : "Marcar como pago"} hoje</button>
                  )}
                </form>
              )}
              <form action={deleteFinanceEntry} className="ml-auto">
                <input type="hidden" name="id" value={entry.id} />
                <ConfirmSubmit message="Excluir este lançamento? Ele sai dos totais, mas o histórico e os anexos ficam guardados e dá para restaurar." className={buttonClass("danger", "sm")}>
                  <Trash2 className="size-3.5" />Excluir
                </ConfirmSubmit>
              </form>
              <EditEntry
                today={today}
                initial={{
                  id: entry.id,
                  type: entry.type as FinType,
                  category: entry.category,
                  description: entry.description,
                  counterparty: entry.counterparty ?? "",
                  document: entry.document ?? "",
                  amount: centsToInput(entry.amountCents),
                  date: dateToDay(entry.date),
                  dueDate: dateToDay(entry.dueDate),
                  paidAt: dateToDay(entry.paidAt),
                  status: entry.status,
                  paymentMethod: entry.paymentMethod ?? "",
                  notes: entry.notes ?? "",
                }}
              />
            </>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {/* Dados */}
          <Card>
            <CardHeader title="Dados do lançamento" />
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <Info k={entry.type === "expense" ? "Fornecedor" : "Pagador"} v={entry.counterparty} />
              <Info k="Nº da nota fiscal / documento" v={entry.document} />
              <Info k="Competência" v={fmtDayBR(entry.date)} />
              <Info k="Vencimento" v={entry.dueDate ? fmtDayBR(entry.dueDate) : null} />
              <Info k={entry.type === "expense" ? "Pagamento" : "Recebimento"} v={entry.paidAt ? fmtDayBR(entry.paidAt) : null} />
              <Info k="Forma de pagamento" v={entry.paymentMethod} />
              <Info k="Lançado por" v={`${createdBy?.name ?? created?.userName ?? "—"} · ${fmtDateTime(entry.createdAt)}`} />
              <Info k="Última edição" v={entry.updatedAt.getTime() - entry.createdAt.getTime() > 1000 ? `${updatedBy?.name ?? "—"} · ${fmtDateTime(entry.updatedAt)}` : "Sem edições"} />
              {entry.notes && <div className="sm:col-span-2"><dt className="text-xs text-muted">Observações</dt><dd className="mt-1 whitespace-pre-line">{entry.notes}</dd></div>}
            </dl>
          </Card>

          {/* Anexos */}
          <Card>
            <CardHeader title="Notas fiscais e comprovantes" subtitle={`${attachments.filter((a) => !a.deletedAt).length} anexo(s). Quem abre cada arquivo fica registrado.`} />
            <ul className="divide-y divide-line">
              {attachments.length ? attachments.map((a) => (
                <li key={a.id} className={cx("flex flex-wrap items-center gap-3 px-5 py-3", a.deletedAt && "opacity-60")}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><FileText className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.fileName}</p>
                    <p className="text-xs text-muted">
                      {ATTACHMENT_KINDS[a.kind as keyof typeof ATTACHMENT_KINDS] ?? a.kind} · {fmtSize(a.sizeBytes)} · enviado por {a.uploadedBy?.name ?? "usuário excluído"} em {fmtDateTime(a.uploadedAt)}
                      {a.deletedAt && <> · <span className="text-bad">removido em {fmtDateTime(a.deletedAt)}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={`/api/financeiro/anexo/${a.id}`} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}><Eye className="size-3.5" />Abrir</a>
                    <a href={`/api/financeiro/anexo/${a.id}?baixar=1`} className={buttonClass("ghost", "sm")} aria-label="Baixar"><Download className="size-3.5" /></a>
                    {access.edit && !a.deletedAt && !entry.deletedAt && (
                      <form action={removeFinanceAttachment}>
                        <input type="hidden" name="attachmentId" value={a.id} />
                        <ConfirmSubmit message="Remover este anexo da lista? O arquivo fica guardado no histórico." className={cx(buttonClass("ghost", "sm"), "text-bad")}>
                          <Trash2 className="size-3.5" />
                        </ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </li>
              )) : <li className="px-5 py-6 text-center text-sm text-muted">Nenhum anexo ainda.</li>}
            </ul>
            {access.edit && !entry.deletedAt && <div className="border-t border-line p-5"><AttachmentUploader entryId={entry.id} /></div>}
          </Card>

          {/* Histórico */}
          <Card>
            <CardHeader title="Histórico de alterações" subtitle="Criação, edições, anexos e exclusões, com data e hora." />
            <ol className="divide-y divide-line">
              {history.map((l) => {
                const changes = parse(l.changes);
                const fields = l.action === "updated" ? Object.entries(changes as Record<string, [string, string]>) : [];
                return (
                  <li key={l.id} className="px-5 py-3.5 text-sm">
                    <p>
                      <span className="font-semibold">{l.userName}</span> <span className="text-muted">({roleLabel(l.userRole)})</span> {LOG_LABEL[l.action] ?? l.action}
                      {(l.action === "attachment_added" || l.action === "attachment_removed") && typeof changes.arquivo === "string" && <> <span className="font-medium">{changes.arquivo}</span></>}
                    </p>
                    {fields.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs">
                        {fields.map(([k, [a, b]]) => (
                          <li key={k} className="text-fg-2">
                            <span className="text-muted">{FIELD_LABEL[k] ?? k}:</span> <span className="line-through decoration-muted/60">{a}</span> → <span className="font-medium text-fg">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-0.5 text-xs text-muted">{fmtDateTime(l.createdAt)}{l.ipAddress && ` · IP ${l.ipAddress}`}</p>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        {/* Visualizações */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Quem visualizou" subtitle="Aberturas deste lançamento e dos anexos." />
            <ul className="divide-y divide-line">
              {viewers.length ? viewers.sort((a, b) => b.last.getTime() - a.last.getTime()).map((v) => (
                <li key={v.name + v.role} className="px-5 py-3 text-sm">
                  <p><span className="font-medium">{v.name}</span> <span className="text-xs text-muted">({roleLabel(v.role)})</span></p>
                  <p className="text-xs text-muted">
                    {v.count > 0 && `${v.count} visualização(ões)`}{v.count > 0 && v.files > 0 && " · "}{v.files > 0 && `abriu anexos ${v.files}×`} · última em {fmtDateTime(v.last)}
                  </p>
                </li>
              )) : <li className="px-5 py-4 text-sm text-muted">Ninguém visualizou ainda.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Acessos recentes" />
            <ol className="max-h-96 divide-y divide-line overflow-y-auto">
              {views.slice(0, 40).map((l) => {
                const c = parse(l.changes);
                return (
                  <li key={l.id} className="px-5 py-2.5 text-xs">
                    <p className="text-fg-2"><span className="font-medium text-fg">{l.userName}</span> {LOG_LABEL[l.action]}{l.action === "attachment_viewed" && typeof c.arquivo === "string" && ` ${c.arquivo}`}</p>
                    <p className="text-muted">{fmtDateTime(l.createdAt)}</p>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="mt-1 [overflow-wrap:anywhere]">{v || "—"}</dd>
    </div>
  );
}

function parse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
