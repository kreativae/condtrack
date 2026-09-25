import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Pencil, Check, Clock, MapPin, Package, Star, Tag, User as UserIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { locationLabel } from "@/lib/orders";
import { can, canView, FLOW_STEPS, isOverdue, MAX_MEDIA_PER_PHASE, PHASE_LABEL, STATUS_META, type Phase, type Status } from "@/lib/workflow";
import { DELETED_USER, fmtDate, fmtDateTime, fmtDuration, fmtRelative } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { assignOrder, commentOrder, completeOrder, rateOrder, transitionOrder } from "@/app/actions/orders";
import { Avatar, Badge, Card, CardHeader, LinkButton, cx } from "@/components/ui";
import { PriorityBadge, StatusBadge } from "@/components/order-badges";
import { BeforeAfter } from "@/components/before-after";
import { MediaGrid } from "@/components/media-grid";
import { MediaUploader } from "@/components/media-uploader";
import { AdminDeleteOrder } from "./admin-delete";
import { AssignForm, CommentForm, CompleteForm, DecisionForm, RateForm, TransitionForm } from "./order-actions";

async function load(id: string) {
  return db.serviceOrder.findUnique({
    where: { id },
    include: {
      category: true,
      commonArea: true,
      unit: { include: { building: true } },
      condominium: { select: { name: true } },
      requestedBy: { select: { id: true, name: true, role: true, avatarUrl: true } },
      assignedTo: { select: { id: true, name: true, company: true, avatarUrl: true } },
      validatedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      media: { orderBy: { uploadedAt: "asc" }, include: { uploadedBy: { select: { name: true } } } },
      events: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, role: true, avatarUrl: true } } } },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/os/[id]">): Promise<Metadata> {
  const o = await db.serviceOrder.findUnique({ where: { id: (await params).id }, select: { protocol: true } });
  return { title: o?.protocol ?? "Ordem de serviço" };
}

const EVENT_DOT: Record<string, string> = {
  created: "bg-info", assignment: "bg-info", status_change: "bg-warn", validation: "bg-brand", approval: "bg-ok",
  rejection: "bg-bad", comment: "bg-muted", media: "bg-fg-2", rating: "bg-brand",
};

export default async function OrderPage({ params }: PageProps<"/os/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const o = await load(id);
  if (!o || !canView(o, user)) notFound();

  const status = o.status as Status;
  const byPhase = (p: Phase) => o.media.filter((m) => m.phase === p);
  const beforePhoto = o.media.find((m) => m.phase === "before" && m.type === "photo");
  const afterPhoto = o.media.find((m) => m.phase === "after" && m.type === "photo");
  const location = locationLabel(o);
  const watermark = `${o.protocol} · ${location}`;
  const overdue = isOverdue(o);
  const materials: { item: string; qty: string }[] = JSON.parse(o.materialsUsed || "[]");

  const canUploadOpening = status === "open" && (o.requestedById === user.id || ["syndic", "superadmin", "caretaker"].includes(user.role));
  const uploadable: Record<Phase, boolean> = {
    opening: canUploadOpening,
    before: can("upload_before", o, user),
    during: false,
    after: can("upload_after", o, user),
  };

  const providers = can("assign", o, user)
    ? await db.user.findMany({ where: { role: "provider", status: "active", condominiumId: o.condominiumId }, select: { id: true, name: true, company: true, specialty: true }, orderBy: { name: "asc" } })
    : [];

  // Índice da última etapa alcançada; a seguinte é a etapa corrente.
  const stepIdx = status === "rejected" ? 1 : status === "cancelled" ? -1 : FLOW_STEPS.findIndex((s) => s.status === status);
  const lastRejection = status === "rejected" ? [...o.events].reverse().find((e) => e.type === "rejection") : null;
  const phases: Phase[] = ["opening", "before", "after"];
  const canComment = user.role === "council" ? o.requestedById === user.id : user.role !== "resident";

  return (
    <div className="animate-in">
      <Link href={user.role === "resident" ? "/feed" : "/os"} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand">
        <ArrowLeft className="size-3.5" /> {user.role === "resident" ? "Serviços entregues" : "Ordens de serviço"}
      </Link>

      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-num text-sm tracking-wider text-brand">{o.protocol}</span>
          <StatusBadge status={o.status} />
          <PriorityBadge priority={o.priority} />
          {overdue && <Badge tone="bad">Atrasada</Badge>}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="font-display text-2xl font-bold leading-tight sm:text-[32px]">{o.title}</h1>
          {user.role === "superadmin" && <LinkButton href={`/os/${o.id}/editar`} variant="outline"><Pencil className="size-4" />Editar OS</LinkButton>}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-2">
          <span className="flex items-center gap-2"><MapPin className="size-4 text-brand" />{location}</span>
          {o.category && <span className="flex items-center gap-2"><Tag className="size-4 text-brand" />{o.category.name}</span>}
          <span className="flex items-center gap-2"><Clock className="size-4 text-brand" />Aberta {fmtRelative(o.createdAt)}</span>
          {o.dueDate && (
            <span className={cx("flex items-center gap-2", overdue && "text-bad")}>
              <CalendarClock className="size-4 text-brand" />Prazo {fmtDate(o.dueDate)}
            </span>
          )}
          {user.role === "superadmin" && <span className="text-muted">· {o.condominium.name}</span>}
        </div>
      </header>

      {/* Progresso */}
      {status !== "cancelled" && (
        <Card className="mb-6 px-4 py-4 sm:px-5 sm:py-5">
          <ol className="flex items-center">
            {FLOW_STEPS.map((s, i) => {
              const done = i <= stepIdx;
              const current = i === stepIdx + 1;
              return (
                <li key={s.status} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className={cx(
                        "flex size-7 shrink-0 items-center sm:size-8 justify-center rounded-full text-xs font-semibold ring-1 transition",
                        done && "bg-brand text-brand-ink ring-brand",
                        current && (status === "rejected" ? "bg-bad/15 text-bad ring-bad" : "bg-brand/15 text-brand ring-brand"),
                        !done && !current && "text-muted ring-line",
                      )}
                    >
                      {done ? <Check className="size-4" /> : i + 1}
                    </span>
                    <span className={cx("hidden whitespace-nowrap text-xs font-medium sm:block", done || current ? "text-fg" : "text-muted")}>{s.label}</span>
                  </div>
                  {i < FLOW_STEPS.length - 1 && <span className={cx("mx-1 h-px flex-1 sm:mx-2 sm:mb-6", i < stepIdx ? "bg-brand" : "bg-line")} />}
                </li>
              );
            })}
          </ol>
          {/* No celular os rótulos somem da linha; mostra só a etapa atual */}
          <p className="mt-3 text-xs text-muted sm:hidden">
            Etapa {Math.min(stepIdx + 2, FLOW_STEPS.length)} de {FLOW_STEPS.length} ·{" "}
            <span className="font-medium text-fg">{FLOW_STEPS[Math.min(stepIdx + 1, FLOW_STEPS.length - 1)].label}</span>
          </p>
        </Card>
      )}

      {lastRejection && (
        <div className="mb-6 rounded-2xl border border-bad/30 bg-bad/5 p-5">
          <p className="text-sm font-semibold text-bad">Devolvida para ajustes</p>
          <p className="mt-2 text-sm">“{lastRejection.comment}”</p>
          <p className="mt-2 text-xs text-muted">{lastRejection.user?.name ?? DELETED_USER} · {fmtDateTime(lastRejection.createdAt)}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {beforePhoto && afterPhoto && <BeforeAfter before={beforePhoto.url} after={afterPhoto.url} alt={o.title} />}

          <Card>
            <CardHeader title="Descrição" />
            <p className="whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-fg-2">{o.description}</p>
          </Card>

          {phases.map((p) => {
            const items = byPhase(p);
            if (!items.length && !uploadable[p]) return null;
            return (
              <Card key={p}>
                <CardHeader
                  title={p === "opening" ? "Registro da ocorrência" : `Registro — ${PHASE_LABEL[p]}`}
                  subtitle={`${items.length} de ${MAX_MEDIA_PER_PHASE} arquivos`}
                  action={p === "before" && status === "assigned" && user.role === "provider" ? <Badge tone="brand">Próximo passo</Badge> : p === "after" && status === "in_progress" && user.role === "provider" ? <Badge tone="brand">Próximo passo</Badge> : null}
                />
                <div className="space-y-4 p-5">
                  <MediaGrid
                    items={items.map((m) => ({
                      id: m.id, url: m.url, type: m.type, uploadedAt: m.uploadedAt.toISOString(), uploadedBy: m.uploadedBy?.name ?? DELETED_USER,
                      deletable: uploadable[p] && m.uploadedById === user.id,
                    }))}
                  />
                  {uploadable[p] && <MediaUploader orderId={o.id} phase={p} watermark={watermark} remaining={MAX_MEDIA_PER_PHASE - items.length} compact={items.length > 0} />}
                </div>
              </Card>
            );
          })}

          {o.serviceReport && (
            <Card>
              <CardHeader title="Relatório do serviço" subtitle={o.assignedTo ? `${o.assignedTo.name}${o.assignedTo.company ? ` · ${o.assignedTo.company}` : ""}` : undefined} />
              <div className="space-y-4 px-5 py-4 text-sm">
                <p className="whitespace-pre-line leading-relaxed text-fg-2">{o.serviceReport}</p>
                <div className="flex flex-wrap gap-6 text-xs text-muted">
                  <span>Tempo de execução: <b className="font-num text-fg">{fmtDuration(o.executionMinutes)}</b></span>
                  {o.startedAt && o.completedAt && <span>Do início à conclusão: <b className="font-num text-fg">{fmtDuration((o.completedAt.getTime() - o.startedAt.getTime()) / 60000)}</b></span>}
                </div>
                {materials.length > 0 && (
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Package className="size-3.5" />Materiais</p>
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {materials.map((m, i) => (
                        <li key={i} className="flex justify-between px-3 py-2"><span>{m.item}</span><span className="font-num text-muted">{m.qty}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Linha do tempo" subtitle="Histórico completo de interações" />
            <ol className="relative space-y-5 px-5 py-5">
              <span className="absolute bottom-6 left-[29px] top-6 w-px bg-line" />
              {o.events.map((e) => (
                <li key={e.id} className="relative flex gap-4">
                  <span className={cx("relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface", EVENT_DOT[e.type] ?? "bg-muted")} style={{ marginLeft: 4 }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{e.user?.name ?? DELETED_USER}</span>
                      {e.user && <span className="text-muted"> · {ROLE_LABEL[e.user.role as Role]}</span>}
                      {e.toStatus && e.type !== "created" && e.type !== "comment" && (
                        <span className="text-muted"> → <span className="text-fg-2">{STATUS_META[e.toStatus as Status]?.label}</span></span>
                      )}
                    </p>
                    {e.comment && <p className={cx("mt-1 text-sm", e.type === "comment" ? "rounded-xl bg-bg-2 px-3 py-2 text-fg-2" : "text-fg-2")}>{e.comment}</p>}
                    <p className="mt-1 text-xs text-muted">{fmtDateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
            {canComment && (
              <div className="border-t border-line p-4">
                <CommentForm action={commentOrder.bind(null, o.id)} />
              </div>
            )}
          </Card>
        </div>

        {/* Painel lateral */}
        <aside className="space-y-6">
          <ActionPanel o={o} user={user} providers={providers} />
          {user.role === "superadmin" && <AdminDeleteOrder id={o.id} protocol={o.protocol} />}

          <Card>
            <CardHeader title="Responsáveis" />
            <dl className="space-y-4 p-5 text-sm">
              <Person label="Solicitado por" name={o.requestedBy?.name ?? DELETED_USER} extra={o.requestedBy ? ROLE_LABEL[o.requestedBy.role as Role] : undefined} when={o.createdAt} />
              <Person label="Executado por" name={o.assignedTo?.name ?? (o.startedAt ? DELETED_USER : undefined)} extra={o.assignedTo?.company} when={o.completedAt ?? o.startedAt ?? o.assignedAt} />
              <Person label="Validado por" name={o.validatedBy?.name ?? (o.validatedAt ? DELETED_USER : undefined)} extra="Zeladoria" when={o.validatedAt} />
              <Person label="Aprovado por" name={o.approvedBy?.name ?? (o.approvedAt ? DELETED_USER : undefined)} extra="Síndico" when={o.approvedAt} />
            </dl>
          </Card>

          {o.rating != null && (
            <Card className="p-5">
              <p className="text-xs font-medium text-muted">Avaliação do solicitante</p>
              <div className="mt-2 flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cx("size-5", n <= o.rating! ? "fill-brand text-brand" : "text-muted")} strokeWidth={1.4} />)}
              </div>
              {o.ratingComment && <p className="mt-2 text-sm text-fg-2">“{o.ratingComment}”</p>}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Person({ label, name, extra, when }: { label: string; name?: string | null; extra?: string | null; when?: Date | null }) {
  return (
    <div className="flex items-center gap-3">
      {name ? <Avatar name={name} size={34} /> : <span className="flex size-[34px] items-center justify-center rounded-full ring-1 ring-dashed ring-line"><UserIcon className="size-4 text-muted" /></span>}
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className={cx("truncate", !name && "text-muted")}>
          {name ?? "Pendente"}
          {name && extra && <span className="text-muted"> · {extra}</span>}
        </dd>
        {name && when && <dd className="text-xs text-muted">{fmtDateTime(when)}</dd>}
      </div>
    </div>
  );
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

function ActionPanel({ o, user, providers }: { o: Loaded; user: Awaited<ReturnType<typeof requireUser>>; providers: { id: string; name: string; company: string | null; specialty: string | null }[] }) {
  const blocks: { title: string; subtitle?: string; node: React.ReactNode }[] = [];
  const hasBefore = o.media.some((m) => m.phase === "before");
  const hasAfter = o.media.some((m) => m.phase === "after");
  const t = (k: Parameters<typeof transitionOrder>[1]) => transitionOrder.bind(null, o.id, k);

  if (can("start", o, user)) {
    blocks.push({
      title: o.status === "rejected" ? "Retomar serviço" : "Iniciar serviço",
      subtitle: hasBefore ? "Fotos do ANTES registradas." : "Primeiro, registre as fotos do ANTES.",
      node: hasBefore ? <TransitionForm action={t("start")} label={o.status === "rejected" ? "Retomar execução" : "Iniciar execução"} /> : null,
    });
  }
  if (can("complete", o, user)) {
    blocks.push({ title: "Concluir serviço", subtitle: "Registre o DEPOIS e descreva o que foi feito.", node: <CompleteForm action={completeOrder.bind(null, o.id)} disabled={!hasAfter} /> });
  }
  if (can("validate", o, user) && user.role === "caretaker") {
    blocks.push({ title: "Validação da zeladoria", subtitle: "Confira o serviço no local antes de validar.", node: <DecisionForm approve={t("validate")} reject={t("return")} approveLabel="Validar" rejectLabel="Devolver" title="Comentário da vistoria" /> });
  }
  if (can("reject", o, user) && o.status === "completed" && user.role !== "caretaker") {
    blocks.push({ title: "Aguardando zeladoria", subtitle: "O síndico pode validar diretamente, se necessário.", node: <DecisionForm approve={t("validate")} reject={t("reject")} approveLabel="Validar" rejectLabel="Devolver" title="Comentário" /> });
  }
  if (can("approve", o, user)) {
    blocks.push({ title: "Aprovação do síndico", subtitle: "Ao aprovar, o serviço é publicado no feed dos moradores.", node: <DecisionForm approve={t("approve")} reject={t("reject")} approveLabel="Aprovar" rejectLabel="Rejeitar" title="Parecer" /> });
  }
  if (can("assign", o, user)) {
    blocks.push({
      title: o.assignedToId ? "Reatribuir prestador" : "Atribuir prestador",
      node: providers.length ? (
        <AssignForm action={assignOrder.bind(null, o.id)} providers={providers} currentId={o.assignedToId} defaultDue={o.dueDate?.toISOString().slice(0, 10)} />
      ) : (
        <p className="text-sm text-muted">Nenhum prestador ativo cadastrado. <Link className="text-brand underline" href="/usuarios/novo?role=provider">Cadastrar</Link></p>
      ),
    });
  }
  if (can("rate", o, user)) {
    blocks.push({ title: "Avalie este serviço", subtitle: "Sua opinião ajuda a manter a qualidade.", node: <RateForm action={rateOrder.bind(null, o.id)} /> });
  }

  const cancel = can("cancel", o, user);
  if (!blocks.length && !cancel) {
    const waiting: Partial<Record<Status, string>> = {
      open: "Aguardando o síndico atribuir um prestador.",
      assigned: "Aguardando o prestador iniciar o serviço.",
      in_progress: "Serviço em execução.",
      completed: "Aguardando validação da zeladoria.",
      validated: "Aguardando aprovação do síndico.",
      rejected: "Devolvida ao prestador para ajustes.",
      approved: "Serviço concluído e publicado no feed.",
      cancelled: "Esta OS foi cancelada.",
    };
    return (
      <Card brand className="p-5">
        <p className="text-xs font-medium text-brand">Status</p>
        <p className="mt-2 font-display font-semibold text-lg">{waiting[o.status as Status]}</p>
      </Card>
    );
  }

  return (
    <>
      {blocks.map((b) => (
        <Card key={b.title} brand>
          <CardHeader title={b.title} subtitle={b.subtitle} />
          {b.node && <div className="p-5">{b.node}</div>}
        </Card>
      ))}
      {cancel && (
        <details className="group rounded-2xl border border-line p-4 text-sm">
          <summary className="cursor-pointer list-none text-muted group-open:mb-3 hover:text-bad">Cancelar esta OS…</summary>
          <TransitionForm action={t("cancel")} label="Confirmar cancelamento" variant="danger" commentLabel="Motivo" requireComment />
        </details>
      )}
    </>
  );
}
