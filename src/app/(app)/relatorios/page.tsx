import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PERIOD_PRESETS, todayBR } from "@/lib/report";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage() {
  const user = await requireUser("superadmin", "syndic", "council");
  // Superadmin escolhe o condomínio; os demais, sempre o próprio
  const condos = user.role === "superadmin" ? await db.condominium.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : null;
  return (
    <div className="mx-auto max-w-2xl animate-in">
      <PageHeader eyebrow="Prestação de contas" title="Relatórios" description="Relatório dos serviços do período para apresentar em assembleia ou enviar aos moradores." />
      <Card>
        <CardHeader title="Relatório de serviços" subtitle="Resumo em números, serviços entregues com antes e depois, por categoria e por prestador." />
        <ReportForm presets={PERIOD_PRESETS} condos={condos} today={todayBR()} />
        <p className="border-t border-line px-5 py-4 text-xs text-muted sm:px-6">
          O relatório abre numa nova aba. Clique em <b>Salvar em PDF</b> e, na janela de impressão, escolha <b>Salvar como PDF</b> como destino.
          No celular, a opção de salvar em PDF aparece na tela de impressão.
        </p>
      </Card>
    </div>
  );
}
