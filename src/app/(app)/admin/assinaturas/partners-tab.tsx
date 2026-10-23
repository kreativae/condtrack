import Link from "next/link";
import { Building2, Handshake, Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { brl } from "@/lib/billing-shared";
import { partnerKind, ruleFor, ruleLabel } from "@/lib/commissions";
import { getCommissionSettings } from "@/lib/commissions-server";
import { CopyCode } from "@/components/billing/partner-forms";
import { Badge, Card, Empty, Input, LinkButton, cx } from "@/components/ui";

/** Aba Parceiros: cartões com código, tipo, regra, condomínios e valores. */
export async function PartnersTab({ q }: { q: string }) {
  const term = q.trim().slice(0, 80);
  const [partners, sums, settings] = await Promise.all([
    db.partner.findMany({
      where: term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { code: { contains: term.toUpperCase() } }] } : {},
      include: { _count: { select: { condominiums: { where: { deletedAt: null } } } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    db.commission.groupBy({ by: ["partnerId", "status"], _sum: { amountCents: true } }),
    getCommissionSettings(),
  ]);
  const sum = (id: string, st: string) => sums.find((x) => x.partnerId === id && x.status === st)?._sum.amountCents ?? 0;

  return (
    <div className="space-y-5">
      <form className="relative max-w-sm">
        <input type="hidden" name="aba" value="parceiros" />
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input name="q" defaultValue={term} placeholder="Buscar nome ou código" className="pl-9" />
      </form>
      {partners.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {partners.map((p) => {
            const rule = ruleFor(p, settings);
            const due = sum(p.id, "due");
            return (
              <Card key={p.id} className={cx("flex flex-col p-5", !p.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Handshake className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/assinaturas/parceiros/${p.id}`} className="block truncate font-display font-semibold hover:text-brand">{p.name}</Link>
                    <p className="text-xs text-muted">{partnerKind(p.kind).label}{!p.active && " · inativo"}</p>
                  </div>
                  <CopyCode code={p.code} />
                </div>
                <p className="mt-3 text-xs text-fg-2">{ruleLabel(rule)}{rule.custom && <Badge tone="info" className="ml-1.5">própria</Badge>}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
                  <div><dt className="text-muted">Condomínios</dt><dd className="mt-0.5 flex items-center gap-1 font-num text-sm font-semibold"><Building2 className="size-3.5 text-muted" />{p._count.condominiums}</dd></div>
                  <div><dt className="text-muted">A pagar</dt><dd className={cx("mt-0.5 font-num text-sm font-semibold", due ? "text-warn" : "")}>{brl(due)}</dd></div>
                  <div><dt className="text-muted">Já pago</dt><dd className="mt-0.5 font-num text-sm font-semibold">{brl(sum(p.id, "paid"))}</dd></div>
                </dl>
                <Link href={`/admin/assinaturas/parceiros/${p.id}`} className="mt-4 text-xs font-medium text-brand hover:underline">Abrir ficha</Link>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty icon={<Handshake className="size-8" />} title={term ? "Nenhum parceiro encontrado" : "Nenhum parceiro ainda"}>
            {term ? "Tente outro nome ou código." : (
              <span className="flex flex-col items-center gap-3">
                Cadastre quem vende ou indica o Condtrack. Cada um ganha um código para o síndico informar na assinatura.
                <LinkButton href="/admin/assinaturas/parceiros/novo" size="sm"><Plus className="size-4" />Novo parceiro</LinkButton>
              </span>
            )}
          </Empty>
        </Card>
      )}
    </div>
  );
}
