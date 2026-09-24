import Link from "next/link";
import { Building2, ChevronDown, LayoutGrid, Pencil, Tags, Users } from "lucide-react";
import { db } from "@/lib/db";
import { categoryIcon } from "@/lib/category-icons";
import {
  createBuilding, createUnit, deleteArea, deleteBuilding, deleteCategory, deleteUnit, generateUnits, renameBuilding, saveArea, saveCategory, updateUnit,
} from "@/app/actions/structure";
import { Badge, Card, CardHeader, Empty, cx } from "@/components/ui";
import { AreaForm, BuildingCreateForm, CategoryForm, DeleteButton, RenameForm, UnitCreateForm, UnitEditForm, UnitGenerateForm } from "./forms";

export const STRUCTURE_TABS = [
  { key: "torres", label: "Torres e unidades", icon: Building2 },
  { key: "areas", label: "Áreas comuns", icon: LayoutGrid },
  { key: "categorias", label: "Categorias de serviço", icon: Tags },
] as const;
export type StructureTab = (typeof STRUCTURE_TABS)[number]["key"];

const TYPE_LABEL: Record<string, string> = { apartment: "Apto", house: "Casa", commercial: "Sala", other: "Outro" };

export async function StructureManager({ condominiumId, basePath, tab }: { condominiumId: string; basePath: string; tab: StructureTab }) {
  const [buildings, areas, categories] = await Promise.all([
    db.building.findMany({
      where: { condominiumId },
      orderBy: { name: "asc" },
      include: { units: { orderBy: [{ floor: "asc" }, { number: "asc" }], include: { _count: { select: { residents: true, orders: true } } } } },
    }),
    db.commonArea.findMany({ where: { condominiumId }, orderBy: { name: "asc" }, include: { _count: { select: { orders: true } } } }),
    db.serviceCategory.findMany({ where: { condominiumId }, orderBy: { name: "asc" }, include: { _count: { select: { orders: true } } } }),
  ]);
  const totalUnits = buildings.reduce((a, b) => a + b.units.length, 0);
  const counts: Record<StructureTab, string> = {
    torres: `${buildings.length} · ${totalUnits} unid.`,
    areas: String(areas.length),
    categorias: String(categories.length),
  };

  return (
    <div>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {STRUCTURE_TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`${basePath}?tab=${key}`}
            className={cx("-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition", tab === key ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}
          >
            <Icon className="size-4" />
            {label}
            <span className="rounded-full bg-bg-2 px-1.5 text-[11px] text-muted">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      {tab === "torres" && (
        <div className="space-y-6">
          {buildings.map((b) => {
            const floors = [...new Set(b.units.map((u) => u.floor))];
            return (
              <Card key={b.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand"><Building2 className="size-4" /></span>
                    <div>
                      <h3 className="font-display text-[15px] font-semibold">{b.name}</h3>
                      <p className="text-xs text-muted">{b.units.length} unidade(s) · {floors.filter((f) => f != null).length} andar(es)</p>
                    </div>
                  </div>
                  <DeleteButton action={deleteBuilding.bind(null, condominiumId, b.id)} confirmText={b.units.length ? `Excluir ${b.name} e suas ${b.units.length} unidade(s)?` : `Excluir ${b.name}?`} label="Excluir torre" />
                </div>

                <div className="space-y-4 p-5">
                  <details className="group rounded-xl border border-line px-4 py-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-fg-2"><Pencil className="size-3.5" />Renomear / adicionar unidades<ChevronDown className="ml-auto size-4 transition group-open:rotate-180" /></summary>
                    <div className="mt-4 space-y-5">
                      <RenameForm action={renameBuilding.bind(null, condominiumId, b.id)} name={b.name} />
                      <div className="border-t border-line pt-4">
                        <p className="mb-2 text-[13px] font-semibold">Adicionar uma unidade</p>
                        <UnitCreateForm action={createUnit.bind(null, condominiumId, b.id)} />
                      </div>
                      <div className="border-t border-line pt-4">
                        <p className="mb-2 text-[13px] font-semibold">Gerar em lote</p>
                        <p className="mb-3 text-xs text-muted">Numeração andar + posição (ex.: 1001, 1002…). Unidades já existentes são ignoradas.</p>
                        <UnitGenerateForm action={generateUnits.bind(null, condominiumId, b.id)} />
                      </div>
                    </div>
                  </details>

                  {b.units.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {b.units.map((u) => (
                        <details key={u.id} className="group relative rounded-xl border border-line bg-surface-2 open:col-span-2 open:bg-surface open:shadow-pop sm:open:col-span-4 lg:open:col-span-6">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span className="font-num font-semibold">{u.number}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-muted">
                              {u._count.residents > 0 && <span className="flex items-center gap-0.5" title="Moradores vinculados"><Users className="size-3" />{u._count.residents}</span>}
                              {TYPE_LABEL[u.type] ?? u.type}
                            </span>
                          </summary>
                          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line px-3 py-3">
                            <UnitEditForm action={updateUnit.bind(null, condominiumId, u.id)} number={u.number} floor={u.floor} type={u.type} />
                            <DeleteButton action={deleteUnit.bind(null, condominiumId, u.id)} confirmText={`Excluir a unidade ${u.number}?`} label="Excluir" />
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Nenhuma unidade. Use “Adicionar unidades” acima.</p>
                  )}
                </div>
              </Card>
            );
          })}
          <Card>
            <CardHeader title="Nova torre / bloco" subtitle="Informe andares e unidades por andar para gerar as unidades automaticamente." />
            <div className="p-5"><BuildingCreateForm action={createBuilding.bind(null, condominiumId)} /></div>
          </Card>
        </div>
      )}

      {tab === "areas" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Card className="divide-y divide-line self-start">
            {areas.length ? areas.map((a) => (
              <details key={a.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand"><LayoutGrid className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted">
                      {[a.capacity && `${a.capacity} pessoas`, a._count.orders && `${a._count.orders} OS`, a.description].filter(Boolean).join(" · ") || "Sem descrição"}
                    </p>
                  </div>
                  {a.reservable && <Badge tone="info">Reservável</Badge>}
                  <ChevronDown className="size-4 text-muted transition group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-line bg-surface-2 px-5 py-5">
                  <AreaForm action={saveArea.bind(null, condominiumId, a.id)} area={a} submit="Salvar alterações" />
                  <div className="flex justify-end border-t border-line pt-3">
                    <DeleteButton action={deleteArea.bind(null, condominiumId, a.id)} confirmText={`Excluir a área ${a.name}?`} label="Excluir área" />
                  </div>
                </div>
              </details>
            )) : <Empty icon={<LayoutGrid />} title="Nenhuma área comum cadastrada" />}
          </Card>
          <Card className="self-start">
            <CardHeader title="Nova área comum" />
            <div className="p-5"><AreaForm action={saveArea.bind(null, condominiumId, null)} submit="Adicionar área" /></div>
          </Card>
        </div>
      )}

      {tab === "categorias" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Card className="divide-y divide-line self-start">
            {categories.length ? categories.map((c) => {
              const Icon = categoryIcon(c.icon);
              return (
                <details key={c.id} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
                    <span className="flex size-9 items-center justify-center rounded-xl text-white" style={{ background: c.color }}><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted">{c._count.orders ? `${c._count.orders} OS` : "Nenhuma OS ainda"}</p>
                    </div>
                    <ChevronDown className="size-4 text-muted transition group-open:rotate-180" />
                  </summary>
                  <div className="space-y-4 border-t border-line bg-surface-2 px-5 py-5">
                    <CategoryForm action={saveCategory.bind(null, condominiumId, c.id)} category={c} submit="Salvar alterações" />
                    <div className="flex justify-end border-t border-line pt-3">
                      <DeleteButton action={deleteCategory.bind(null, condominiumId, c.id)} confirmText={`Excluir a categoria ${c.name}?`} label="Excluir categoria" />
                    </div>
                  </div>
                </details>
              );
            }) : <Empty icon={<Tags />} title="Nenhuma categoria cadastrada" />}
          </Card>
          <Card className="self-start">
            <CardHeader title="Nova categoria" subtitle="Aparece ao abrir OS e nos relatórios." />
            <div className="p-5"><CategoryForm action={saveCategory.bind(null, condominiumId, null)} submit="Adicionar categoria" /></div>
          </Card>
        </div>
      )}
    </div>
  );
}
