import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { CalendarClock, FileCheck2, Pause, Pencil, Play, Plus, Sparkles, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { spNow } from "@/lib/checklist";
import { nowMs } from "@/lib/format";
import { everyLabel, fmtDay, planStatus } from "@/lib/maintenance";
import { runMaintenance } from "@/lib/maintenance-server";
import { addSuggestedPlans, openPlanOrderNow, renewDocument, togglePlan } from "@/app/actions/maintenance";
import { Badge, Card, CardHeader, Empty, LinkButton, PageHeader, buttonClass, cx } from "@/components/ui";
import { RenewButton } from "./renew-button";

export const metadata: Metadata = { title: "Manutenção preventiva" };

export default async function MaintenancePage() {
  const user = await requireUser("superadmin", "syndic", "caretaker");
  const scope = await adminScope(user);
  const condoId = user.role === "superadmin" ? scope?.id : user.condominiumId;
  const manage = user.role === "superadmin" || user.role === "syndic";

  if (!condoId) {
    return (
      <div className="animate-in">
        <PageHeader eyebrow="Manutenção" title="Manutenção preventiva" />
        <Card><Empty icon={<CalendarClock className="size-8" />} title="Escolha um condomínio">Use o cartão do condomínio no menu para ver e criar os planos dele.</Empty></Card>
      </div>
    );
  }

  // Abre o que já entrou na antecedência (o agendamento também faz isso a cada 15 min)
  after(() => runMaintenance(nowMs(), condoId).catch((e) => console.error("[manutenção]", e)));

  const today = spNow(nowMs()).date;
  const plans = await db.maintenancePlan.findMany({
    where: { condominiumId: condoId },
    include: { provider: { select: { name: true } }, commonArea: { select: { name: true } }, category: { select: { name: true } } },
    orderBy: [{ active: "desc" }, { nextDue: "asc" }],
  });
  const orderIds = plans.map((p) => p.lastOrderId).filter((x): x is string => !!x);
  const orders = orderIds.length ? await db.serviceOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, protocol: true, status: true } }) : [];
  const orderOf = (id: string | null) => orders.find((o) => o.id === id);

  const services = plans.filter((p) => p.kind === "service");
  const documents = plans.filter((p) => p.kind === "document");
  const attention = plans.filter((p) => p.active && ["warn", "bad"].includes(planStatus(p, today).tone)).length;

  return (
    <div className="animate-in">
      <PageHeader
        eyebrow={scope?.name ?? "Manutenção"}
        title="Manutenção preventiva"
        description="Serviços que se repetem abrem a OS sozinhos, e documentos avisam antes de vencer."
        actions={manage && (
          <>
            <form action={addSuggestedPlans.bind(null, condoId)}>
              <button className={buttonClass("outline")}><Sparkles className="size-4" />Sugestões</button>
            </form>
            <LinkButton href="/manutencao/novo"><Plus className="size-4" />Novo plano</LinkButton>
          </>
        )}
      />

      {!plans.length ? (
        <Card>
          <Empty icon={<CalendarClock className="size-8" />} title="Nenhum plano ainda">
            {manage ? "Comece pelas sugestões (caixa d’água, extintores, AVCB, seguro…): elas entram pausadas para você conferir as datas." : "O síndico ainda não cadastrou planos."}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-6">
          {attention > 0 && (
            <p className="rounded-2xl bg-warn/10 px-4 py-3 text-sm text-fg-2 ring-1 ring-inset ring-warn/15">
              <b className="text-fg">{attention}</b> {attention === 1 ? "plano pede atenção" : "planos pedem atenção"}: documento perto de vencer ou vencido.
            </p>
          )}
          {[
            { key: "service", title: "Serviços recorrentes", subtitle: "A OS abre sozinha na antecedência e já vai para o prestador do plano.", icon: Wrench, list: services },
            { key: "document", title: "Documentos e laudos", subtitle: "O síndico recebe aviso antes de vencer e no dia do vencimento.", icon: FileCheck2, list: documents },
          ].map((g) => (
            <Card key={g.key}>
              <CardHeader title={g.title} subtitle={g.subtitle} />
              {g.list.length ? (
                <ul className="divide-y divide-line">
                  {g.list.map((p) => {
                    const st = planStatus(p, today);
                    const last = orderOf(p.lastOrderId);
                    return (
                      <li key={p.id} className={cx("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center", !p.active && "opacity-70")}>
                        <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-brand sm:flex"><g.icon className="size-5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 font-medium">
                            {p.title}
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {everyLabel(p.every, p.unit)} · {p.kind === "document" ? "vence" : "próxima"} em {fmtDay(p.nextDue)}
                            {p.kind === "service" && p.leadDays > 0 && ` · abre ${p.leadDays} ${p.leadDays === 1 ? "dia" : "dias"} antes`}
                            {p.provider && ` · ${p.provider.name}`}
                            {p.commonArea && ` · ${p.commonArea.name}`}
                          </p>
                          {last && (
                            <Link href={`/os/${last.id}`} className="mt-1 inline-block text-xs font-medium text-brand hover:underline">Última OS: {last.protocol}</Link>
                          )}
                        </div>
                        {manage && (
                          <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                            {p.kind === "service" && p.active && (
                              <form action={openPlanOrderNow.bind(null, p.id)}>
                                <button className={buttonClass("outline", "sm")} title="Abre a OS do próximo ciclo agora">Abrir OS agora</button>
                              </form>
                            )}
                            {p.kind === "document" && <RenewButton action={renewDocument.bind(null, p.id)} />}
                            <form action={togglePlan.bind(null, p.id)}>
                              <button className={buttonClass("ghost", "sm")} title={p.active ? "Pausar" : "Ativar"}>
                                {p.active ? <Pause className="size-4" /> : <Play className="size-4" />}{p.active ? "Pausar" : "Ativar"}
                              </button>
                            </form>
                            <Link href={`/manutencao/${p.id}`} className={buttonClass("ghost", "sm")}><Pencil className="size-4" />Editar</Link>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-muted">Nenhum plano deste tipo.</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
