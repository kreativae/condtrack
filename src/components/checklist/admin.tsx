import Link from "next/link";
import { ChevronDown, ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { frequencyLabel } from "@/lib/checklist";
import { deleteChecklistItem, moveChecklistItem, saveChecklistItem, saveChecklistSettings, toggleChecklistItem } from "@/app/actions/checklist";
import { Badge, Card, CardHeader, Empty, cx } from "@/components/ui";
import { ChecklistItemActions, ChecklistItemForm, ChecklistSettingsForm } from "./forms";

/** Gestão do checklist do zelador (aba de Estrutura — síndico e superadmin). */
export async function ChecklistAdmin({ condominiumId, historyHref }: { condominiumId: string; historyHref: string }) {
  const [items, areas, condo] = await Promise.all([
    db.checklistItem.findMany({ where: { condominiumId }, include: { commonArea: { select: { name: true } }, _count: { select: { checks: true } } }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    db.commonArea.findMany({ where: { condominiumId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.condominium.findUniqueOrThrow({ where: { id: condominiumId }, select: { checklistDeadline: true } }),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card className="self-start">
        <CardHeader
          title="Itens do checklist"
          subtitle={`${items.filter((i) => i.active).length} ativo(s) · o zelador confere no painel “Meu dia”`}
          action={<Link href={historyHref} className="text-xs font-medium text-brand hover:underline">Ver histórico</Link>}
        />
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.map((i, n) => (
              <li key={i.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5">
                    <div className={cx("min-w-0 flex-1", !i.active && "opacity-50")}>
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {i.title}
                        {!i.active && <Badge tone="muted">Pausado</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted">{[frequencyLabel(i), i.commonArea?.name, i.description].filter(Boolean).join(" · ")}</p>
                    </div>
                    <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" />
                  </summary>
                  <div className="space-y-4 border-t border-line bg-surface-2 px-5 py-4">
                    <ChecklistItemForm action={saveChecklistItem.bind(null, condominiumId, i.id)} item={i} areas={areas} submit="Salvar alterações" />
                    <div className="flex items-center justify-between border-t border-line pt-3">
                      <p className="text-xs text-muted">{i._count.checks} conferência(s) registradas</p>
                      <ChecklistItemActions
                        title={i.title}
                        active={i.active}
                        first={n === 0}
                        last={n === items.length - 1}
                        move={moveChecklistItem.bind(null, condominiumId, i.id)}
                        toggle={toggleChecklistItem.bind(null, condominiumId, i.id)}
                        remove={deleteChecklistItem.bind(null, condominiumId, i.id)}
                      />
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<ListChecks className="size-8" />} title="Nenhum item ainda">Adicione o que o zelador deve conferir.</Empty>
        )}
      </Card>
      <div className="space-y-6 self-start">
        <Card>
          <CardHeader title="Novo item" />
          <div className="p-5"><ChecklistItemForm action={saveChecklistItem.bind(null, condominiumId, null)} areas={areas} submit="Adicionar item" /></div>
        </Card>
        <Card>
          <CardHeader title="Alerta de atraso" subtitle="Se o checklist não estiver completo neste horário, síndico e zelador são avisados (uma vez por dia)." />
          <div className="p-5"><ChecklistSettingsForm action={saveChecklistSettings.bind(null, condominiumId)} deadline={condo.checklistDeadline} /></div>
        </Card>
      </div>
    </div>
  );
}
