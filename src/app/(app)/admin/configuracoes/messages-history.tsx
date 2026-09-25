import Link from "next/link";
import { Bell, CheckCircle2, Mail, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDateTime, nowMs } from "@/lib/format";
import { TEMPLATES, templateDef } from "@/lib/messages";
import { Pager, pageParam, withPage } from "@/components/frozen";
import { Badge, Card, Empty, Select, buttonClass, cx } from "@/components/ui";
import { DeleteNotificationButton } from "./delete-notification";

const PAGE = 25;
const OTHER: Record<string, string> = { test: "E-mail de teste", other: "Outro" };
const typeLabel = (t: string) => templateDef(t)?.label ?? OTHER[t] ?? t;

type SP = Record<string, string | string[] | undefined>;

/** Histórico do que o sistema enviou: notificações no app e e-mails. */
export async function MessagesHistory({ sp }: { sp: SP }) {
  const canal = sp.canal === "email" ? "email" : "app";
  const tipo = typeof sp.tipo === "string" && sp.tipo ? sp.tipo : undefined;
  const since = new Date(nowMs() - 30 * 86400_000);
  const [app30, sent30, failed30] = await Promise.all([
    db.notification.count({ where: { createdAt: { gte: since } } }),
    db.emailLog.count({ where: { createdAt: { gte: since }, status: "sent" } }),
    db.emailLog.count({ where: { createdAt: { gte: since }, status: "failed" } }),
  ]);
  const base = "/admin/configuracoes";
  const params = { aba: "mensagens", sub: "historico", canal, ...(tipo && { tipo }) };
  const link = (p: Record<string, string | undefined>) => `${base}?${new URLSearchParams(Object.entries({ ...params, ...p }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Bell} label="Notificações no app (30 dias)" value={app30} />
        <Stat icon={CheckCircle2} label="E-mails entregues ao provedor (30 dias)" value={sent30} tone="text-ok" />
        <Stat icon={XCircle} label="E-mails com falha (30 dias)" value={failed30} tone={failed30 ? "text-bad" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-bg-2 p-1 text-sm">
          {(["app", "email"] as const).map((c) => (
            <Link key={c} href={link({ canal: c, tipo: undefined })} className={cx("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition", canal === c ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
              {c === "app" ? <><Bell className="size-4" />No app</> : <><Mail className="size-4" />E-mails</>}
            </Link>
          ))}
        </div>
        <form className="ml-auto flex gap-2">
          {Object.entries(params).filter(([k]) => k !== "tipo").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <Select name="tipo" defaultValue={tipo ?? ""} className="w-64">
            <option value="">Todos os tipos</option>
            {TEMPLATES.filter((t) => (canal === "app" ? t.channels.includes("app") : true)).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            {canal === "email" && <option value="test">E-mail de teste</option>}
          </Select>
          <button className={buttonClass("outline")}>Filtrar</button>
        </form>
      </div>

      {canal === "app" ? <AppLog sp={sp} tipo={tipo} params={params} /> : <EmailLogList sp={sp} tipo={tipo} params={params} />}
    </div>
  );
}

async function AppLog({ sp, tipo, params }: { sp: SP; tipo?: string; params: SP }) {
  const where = tipo ? { type: tipo } : {};
  const total = await db.notification.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const rows = await db.notification.findMany({
    where,
    include: { user: { select: { name: true, email: true, condominium: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE,
    take: PAGE,
  });
  return (
    <Card className="overflow-hidden">
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((n) => (
            <li key={n.id} className="flex items-start gap-3 px-5 py-3.5">
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-line-strong" : "bg-brand")} title={n.read ? "Lida" : "Não lida"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="whitespace-pre-line text-sm text-muted">{n.message}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <Badge tone="muted">{typeLabel(n.type)}</Badge>
                  <span>Para <b className="font-medium text-fg-2">{n.user.name}</b>{n.user.condominium && ` · ${n.user.condominium.name}`}</span>
                  <span>{fmtDateTime(n.createdAt)}</span>
                  <span>{n.read ? `Lida${n.readAt ? ` em ${fmtDateTime(n.readAt)}` : ""}` : "Não lida"}</span>
                </p>
              </div>
              <DeleteNotificationButton id={n.id} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={<Bell className="size-8" />} title="Nenhuma notificação" />
      )}
      <div className="border-t border-line px-5 py-3"><Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/admin/configuracoes", params, p)} /></div>
    </Card>
  );
}

async function EmailLogList({ sp, tipo, params }: { sp: SP; tipo?: string; params: SP }) {
  const where = tipo ? { type: tipo } : {};
  const total = await db.emailLog.count({ where });
  const page = pageParam(sp.page, total, PAGE);
  const rows = await db.emailLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE });
  return (
    <Card className="overflow-hidden">
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-5 py-3.5">
              {e.status === "sent" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-bad" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.subject}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <Badge tone="muted">{typeLabel(e.type)}</Badge>
                  <span className="break-all">Para <b className="font-medium text-fg-2">{e.to}</b></span>
                  <span>{fmtDateTime(e.createdAt)}</span>
                  {e.provider && <span>via {e.provider === "resend" ? "Resend" : "SMTP"}</span>}
                </p>
                {e.error && <p className="mt-1 text-xs text-bad">{e.error}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={<Mail className="size-8" />} title="Nenhum e-mail enviado ainda">Os e-mails passam a aparecer aqui a partir desta versão.</Empty>
      )}
      <div className="border-t border-line px-5 py-3"><Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/admin/configuracoes", params, p)} /></div>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Bell; label: string; value: number; tone?: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex size-9 items-center justify-center rounded-xl bg-bg-2 text-muted"><Icon className="size-4" /></span>
      <div>
        <p className={cx("font-num text-xl font-semibold", tone)}>{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </Card>
  );
}
