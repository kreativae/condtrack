import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERIOD_PRESETS, todayBR } from "@/lib/report";
import { showFinanceNav } from "@/lib/finance-server";
import { adminScope } from "@/lib/admin-scope-server";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { ReportForm } from "./report-form";
import { FinanceReportPanel } from "../financeiro/report-dialog";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage() {
  const user = await requireUser("superadmin", "syndic", "council");
  const admin = user.role === "superadmin";
  // Superadmin escolhe o condomínio; os demais, sempre o próprio
  const condos = admin ? await db.condominium.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : null;
  // Financeiro: superadmin e síndico; conselho só com o acesso liberado
  const finance = showFinanceNav(user);
  const cats = finance
    ? await db.financeEntry.findMany({
        where: { deletedAt: null, ...(admin ? {} : { condominiumId: user.condominiumId ?? "__none__" }) },
        distinct: ["condominiumId", "category"],
        select: { condominiumId: true, category: true },
        orderBy: { category: "asc" },
      })
    : [];
  const catsOf = (id: string) => cats.filter((c) => c.condominiumId === id).map((c) => c.category);
  const today = todayBR();
  const scope = admin ? await adminScope(user) : null;

  return (
    <div className="animate-in">
      <PageHeader eyebrow="Prestação de contas" title="Relatórios" description="Relatórios do período para apresentar em assembleia ou enviar aos moradores." />
      {/* Serviços e financeiro lado a lado em telas largas */}
      <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Relatório de serviços" subtitle="Resumo em números, serviços entregues com antes e depois, por categoria e por prestador." />
        <ReportForm presets={PERIOD_PRESETS} condos={condos} today={today} defaultCondo={scope?.id} />
        <p className="border-t border-line px-5 py-4 text-xs text-muted sm:px-6">
          O relatório abre numa nova aba. Clique em <b>Salvar em PDF</b> e, na janela de impressão, escolha <b>Salvar como PDF</b> como destino.
          No celular, a opção de salvar em PDF aparece na tela de impressão.
        </p>
      </Card>

      {finance && (
        <Card>
          <CardHeader title="Relatório financeiro" subtitle="Receitas, despesas, saldo e lançamentos do período, com filtros por tipo, situação e categoria." />
          {admin ? (
            <FinanceReportPanel condos={condos!.map((c) => ({ ...c, categories: catsOf(c.id) }))} initialCondo={scope?.id} today={today} />
          ) : (
            <FinanceReportPanel categories={catsOf(user.condominiumId!)} today={today} />
          )}
        </Card>
      )}
      </div>
    </div>
  );
}
