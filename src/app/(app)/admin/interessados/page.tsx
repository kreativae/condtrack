import type { Metadata } from "next";
import Link from "next/link";
import { Building2, FlaskConical, Mail, MessageCircle, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Card, Empty, Field, LinkButton, PageHeader, Select, Textarea, cx, tabClass, tabRowClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/format";
import { whatsappNumber } from "@/lib/demo-trial";
import { REQUEST_STATUS, isRequestStatus, profileLabel } from "@/lib/demo-request";
import { updateDemoRequest } from "@/app/actions/demo-request";

export const metadata: Metadata = { title: "Interessados" };

/** Pedidos de demonstração feitos na página inicial. Daqui sai a demonstração externa, já com o contato preenchido. */
export default async function LeadsPage({ searchParams }: PageProps<"/admin/interessados">) {
  await requireUser("superadmin");
  const sp = await searchParams;
  const tab = typeof sp.status === "string" && (sp.status === "todos" || isRequestStatus(sp.status)) ? sp.status : "abertos";
  const where = tab === "todos" ? {} : tab === "abertos" ? { status: { in: ["new", "contacted", "demo"] } } : { status: tab };
  const [rows, counts] = await Promise.all([
    db.demoRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    db.demoRequest.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const condos = await db.condominium.findMany({ where: { id: { in: rows.map((r) => r.condominiumId).filter((x): x is string => !!x) }, deletedAt: null }, select: { id: true, name: true } });
  const tabs = [
    { key: "abertos", label: "Em aberto", n: count("new") + count("contacted") + count("demo") },
    ...Object.entries(REQUEST_STATUS).map(([key, s]) => ({ key, label: s.label, n: count(key) })),
    { key: "todos", label: "Todos", n: counts.reduce((a, c) => a + c._count, 0) },
  ];

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        eyebrow="Site"
        title="Interessados"
        description="Pedidos do formulário “Agende sua demonstração” da página inicial. Crie a demonstração externa a partir do pedido: o contato já vem preenchido."
        actions={<LinkButton href="/" target="_blank" variant="outline">Ver a página inicial</LinkButton>}
      />
      <nav className={tabRowClass}>
        {tabs.map((t) => (
          <Link key={t.key} href={t.key === "abertos" ? "/admin/interessados" : `/admin/interessados?status=${t.key}`} className={tabClass(tab === t.key)}>
            {t.label} <span className="ml-1 opacity-60">{t.n}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Empty title="Nenhum pedido aqui" icon={<UserPlus className="size-6" />}>Os pedidos feitos na página inicial aparecem nesta lista, e você recebe um aviso a cada novo.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => {
            const st = isRequestStatus(r.status) ? REQUEST_STATUS[r.status] : REQUEST_STATUS.new;
            const wa = whatsappNumber(r.phone);
            const condo = condos.find((c) => c.id === r.condominiumId);
            return (
              <Card key={r.id} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold">{r.name}</p>
                    <p className="text-sm text-fg-2">{profileLabel(r.profile)} · {fmtDateTime(r.createdAt)}</p>
                  </div>
                  <Badge tone={st.tone} dot>{st.label}</Badge>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-bg-2 px-4 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand"><Building2 className="size-5" /></span>
                  <span className="min-w-0">
                    <b className="block truncate">{r.condoName}</b>
                    <span className="text-sm text-fg-2">{r.units ? `${r.units} unidades` : "Unidades não informadas"}</span>
                  </span>
                </div>
                {r.message && <p className="whitespace-pre-line rounded-2xl border border-line px-4 py-3 text-sm text-fg-2">{r.message}</p>}
                <div className="flex flex-wrap gap-2">
                  {wa && (
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ok/12 px-3.5 text-sm font-semibold text-ok hover:bg-ok/20">
                      <MessageCircle className="size-4" />{r.phone}
                    </a>
                  )}
                  <a href={`mailto:${r.email}`} className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-info/12 px-3.5 text-sm font-semibold text-info hover:bg-info/20">
                    <Mail className="size-4 shrink-0" /><span className="truncate">{r.email}</span>
                  </a>
                </div>
                <form action={updateDemoRequest.bind(null, r.id)} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                  <Field label="Situação">
                    <Select name="status" defaultValue={r.status}>
                      {Object.entries(REQUEST_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Anotação interna">
                    <Textarea name="note" rows={1} defaultValue={r.note ?? ""} placeholder="Ex.: ligar na segunda à tarde" />
                  </Field>
                  <div className={cx("flex flex-wrap items-center gap-2 sm:col-span-2", "justify-between")}>
                    {condo ? (
                      <LinkButton href={`/admin/condominios/${condo.id}`} variant="outline" size="sm"><FlaskConical className="size-4" />{condo.name}</LinkButton>
                    ) : (
                      <LinkButton href={`/admin/condominios?pedido=${r.id}`} variant="outline" size="sm"><FlaskConical className="size-4" />Criar demonstração</LinkButton>
                    )}
                    <SubmitButton size="sm" pendingText="Salvando…">Salvar</SubmitButton>
                  </div>
                </form>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
