import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, CheckCircle2, ClipboardList, Eye, Lock, MapPin, RotateCcw, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, nowMs } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { MAX_TICKET_PHOTOS, REOPEN_DAYS, TICKET_ROLES, canManageTickets, canTicket, ticketKind, ticketStatus } from "@/lib/tickets";
import { loadTicketFor, ticketPlace } from "@/lib/tickets-server";
import { STATUS_META, canView, type Status } from "@/lib/workflow";
import { unitLabel } from "@/lib/units";
import { MediaGrid } from "@/components/media-grid";
import { TicketKindIcon } from "@/components/tickets/look";
import { Alert, Avatar, Badge, Card, CardHeader, LinkButton, cx } from "@/components/ui";
import { AddPhotos, ReplyForm, StatusButton } from "./parts";

export const metadata: Metadata = { title: "Chamado" };

export default async function TicketPage({ params, searchParams }: PageProps<"/chamados/[id]">) {
  const user = await requireUser(...TICKET_ROLES);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const t = await loadTicketFor(user, id);
  if (!t) notFound();
  const messages = await db.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } });

  const manager = canManageTickets(user.role);
  const mine = t.createdById === user.id;
  const now = new Date(nowMs());
  const can = (a: Parameters<typeof canTicket>[0]) => canTicket(a, t, user, now);
  const st = ticketStatus(t.status);
  const kind = ticketKind(t.kind);
  const place = ticketPlace(t);
  const os = t.serviceOrder;
  const osMeta = os ? STATUS_META[os.status as Status] : null;
  const falhou = typeof sp.falhou === "string" ? Number(sp.falhou) : 0;

  // Etapas para o quadro da direita
  const steps = [
    { label: "Aberto", at: t.createdAt, done: true },
    { label: "Resposta do síndico", at: t.answeredAt, done: !!t.answeredAt },
    ...(os || t.convertedAt ? [{ label: os ? `Virou ${os.protocol}` : "Virou OS", at: t.convertedAt, done: true }] : []),
    { label: t.status === "closed" ? "Encerrado" : "Resolvido", at: t.closedAt, done: t.status === "resolved" || t.status === "closed" },
  ];

  return (
    <div className="mx-auto max-w-6xl animate-in">
      <Link href="/chamados" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Chamados</Link>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <span className="hidden sm:block"><TicketKindIcon kind={t.kind} size="lg" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-brand">{kind.label} · <span className="font-num">#{t.number}</span></p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {manager ? <>{t.createdByName} ({ROLE_LABEL[t.createdByRole as Role]?.toLowerCase() ?? "morador"}{t.unit ? `, ${unitLabel(t.unit)}` : ""})</> : "Você abriu"} · {fmtDateTime(t.createdAt)}
          </p>
        </div>
        <Badge tone={st.tone} dot className="text-sm">{st.label}</Badge>
      </header>

      {falhou > 0 && <div className="mb-4"><Alert tone="warn">O chamado foi enviado, mas {falhou === 1 ? "1 foto não foi enviada" : `${falhou} fotos não foram enviadas`}. Adicione de novo abaixo.</Alert></div>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
            <p className="whitespace-pre-line leading-relaxed text-fg-2">{t.description}</p>
            {place && <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-bg-2 px-3 py-1 text-xs font-medium text-fg-2"><MapPin className="size-3.5 text-brand" />{place}</p>}
            {t.photos.length > 0 && (
              <div className="mt-5">
                <MediaGrid items={t.photos.map((url, i) => ({ id: `${i}`, url, type: "photo", uploadedAt: t.createdAt.toISOString(), uploadedBy: t.createdByName }))} />
              </div>
            )}
            {mine && can("reply") && t.photos.length < MAX_TICKET_PHOTOS && <div className="mt-4"><AddPhotos id={t.id} remaining={MAX_TICKET_PHOTOS - t.photos.length} /></div>}
          </Card>

          {/* Conversa */}
          <Card>
            <CardHeader title="Conversa" subtitle={manager ? "Quem abriu recebe um aviso a cada resposta." : "O síndico recebe um aviso a cada mensagem sua."} />
            <div className="space-y-3 px-5 pb-5">
              {messages.length === 0 && <p className="rounded-2xl bg-bg-2 px-4 py-6 text-center text-sm text-muted">{manager ? "Nenhuma resposta ainda. Responder põe o chamado em análise." : "Ainda sem resposta. Você recebe um aviso quando o síndico responder."}</p>}
              {messages.map((m) => {
                if (m.system) {
                  return (
                    <div key={m.id} className="flex items-center gap-3 py-1 text-xs text-muted">
                      <span className="h-px flex-1 bg-line" />
                      <span className="max-w-[80%] whitespace-pre-line text-center">{m.body} <span className="opacity-70">· {m.authorName}, {fmtDateTime(m.createdAt)}</span></span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  );
                }
                const own = m.authorId === user.id;
                return (
                  <div key={m.id} className={cx("flex gap-2.5", own && "flex-row-reverse")}>
                    <Avatar name={m.authorName} size={32} />
                    <div className={cx("max-w-[85%] rounded-2xl px-4 py-2.5", own ? "rounded-tr-md bg-brand-soft" : "rounded-tl-md bg-bg-2")}>
                      <p className="text-xs text-muted"><b className="font-semibold text-fg-2">{own ? "Você" : m.authorName}</b> · {ROLE_LABEL[m.authorRole as Role] ?? ""} · {fmtDateTime(m.createdAt)}</p>
                      <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
                    </div>
                  </div>
                );
              })}
              {can("reply") ? (
                <div className="border-t border-line pt-4"><ReplyForm id={t.id} hint={manager && t.status === "open" ? "Responder põe o chamado em análise." : undefined} /></div>
              ) : (
                <p className="border-t border-line pt-4 text-center text-xs text-muted">Chamado {st.label.toLowerCase()}: a conversa foi encerrada.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Lateral: andamento, OS e ações */}
        <div className="space-y-5 lg:sticky lg:top-6">
          <Card className="p-5">
            <p className="mb-4 text-xs font-medium text-muted">Andamento</p>
            <ol className="space-y-4">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ring-2", s.done ? "bg-brand ring-brand text-brand-ink" : "bg-surface ring-line-strong")}>
                    {s.done && <CheckCircle2 className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cx("block text-sm", s.done ? "font-medium" : "text-muted")}>{s.label}</span>
                    {s.at && <span className="block text-xs text-muted">{fmtDateTime(s.at)}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {t.closeNote && <p className="mt-4 whitespace-pre-line rounded-xl bg-bg-2 px-3 py-2 text-sm text-fg-2">“{t.closeNote}”{t.closedByName && <span className="mt-1 block text-xs text-muted">{t.closedByName}</span>}</p>}
          </Card>

          {os && osMeta && (
            <Card className="p-5" brand>
              <p className="flex items-center gap-2 text-xs font-medium text-muted"><ClipboardList className="size-4 text-brand" />Ordem de serviço</p>
              <p className="mt-2 font-display text-lg font-semibold">{os.protocol}</p>
              <div className="mt-2"><Badge tone={osMeta.tone} dot>{osMeta.label}</Badge></div>
              <p className="mt-3 text-xs text-muted">{os.status === "approved" ? "Serviço concluído e aprovado." : "O chamado é resolvido sozinho quando o síndico aprovar o serviço."}</p>
              {canView(os, user) && <LinkButton href={`/os/${os.id}`} variant="outline" size="sm" className="mt-4 w-full"><Eye className="size-4" />Abrir a OS</LinkButton>}
            </Card>
          )}

          {manager && (can("convert") || can("review") || can("resolve")) && (
            <Card className="space-y-2 p-5">
              <p className="mb-2 text-xs font-medium text-muted">O que fazer</p>
              {can("convert") && <LinkButton href={`/os/nova?chamado=${t.id}`} className="w-full"><ClipboardList className="size-4" />Converter em OS</LinkButton>}
              {can("review") && <StatusButton id={t.id} action="review" label="Marcar em análise" icon={<Eye className="size-4" />} />}
              {can("resolve") && <StatusButton id={t.id} action="resolve" label="Marcar como resolvido" variant="success" icon={<CheckCircle2 className="size-4" />} note={{ label: "Comentário para quem abriu (opcional)", placeholder: "Ex.: A lâmpada foi trocada hoje de manhã." }} />}
              {can("close") && <StatusButton id={t.id} action="close" label="Encerrar sem resolver" variant="ghost" icon={<XCircle className="size-4" />} note={{ label: "Motivo do encerramento", required: true, placeholder: "Ex.: Não é responsabilidade do condomínio; o reparo é da unidade." }} />}
              {os && os.status !== "approved" && <p className="pt-1 text-xs text-muted">Resolver ou encerrar aqui não mexe na OS.</p>}
            </Card>
          )}

          {mine && (can("cancel") || can("reopen")) && (
            <Card className="space-y-2 p-5">
              {can("cancel") && <StatusButton id={t.id} action="cancel" label="Cancelar chamado" variant="ghost" icon={<Ban className="size-4" />} confirmText="Cancelar este chamado? O síndico recebe o aviso." />}
              {can("reopen") && (
                <>
                  <StatusButton id={t.id} action="reopen" label="Reabrir chamado" icon={<RotateCcw className="size-4" />} note={{ label: "Por que reabrir?", required: true, placeholder: "Ex.: O vazamento voltou." }} />
                  <p className="text-xs text-muted">Dá para reabrir até {REOPEN_DAYS} dias depois de encerrado.</p>
                </>
              )}
            </Card>
          )}

          {!manager && <p className="flex items-center gap-1.5 px-1 text-xs text-muted"><Lock className="size-3.5" />Só você e o síndico veem este chamado.</p>}
        </div>
      </div>
    </div>
  );
}
