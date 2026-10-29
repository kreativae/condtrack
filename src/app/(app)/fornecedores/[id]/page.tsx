import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, User } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtBRL } from "@/lib/finance";
import { fmtDate, fmtRelative } from "@/lib/format";
import { SUPPLIER_ROLES, canDecideQuote, quoteStatus, whatsappNumber } from "@/lib/suppliers";
import { loadSupplierFor } from "@/lib/suppliers-server";
import { setSupplierArchived } from "@/app/actions/suppliers";
import { Badge, Card, CardHeader, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { Stars } from "../stars";
import { CategoryIcon } from "@/components/suppliers/look";

export const metadata: Metadata = { title: "Fornecedor" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(...SUPPLIER_ROLES);
  const { id } = await params;
  const s = await loadSupplierFor(user, id);
  if (!s) notFound();
  const quotes = await db.supplierQuote.findMany({ where: { supplierId: id }, orderBy: { createdAt: "desc" }, include: { _count: { select: { files: true } } } });
  const approved = quotes.filter((q) => q.status === "approved");
  const decidedCount = quotes.filter((q) => q.status === "approved" || q.status === "rejected").length;
  const wa = whatsappNumber(s.phone);
  const manage = canDecideQuote(user.role);

  const rows: [typeof Phone, string, string | null, string | undefined][] = [
    [User, "Contato", s.contactName, undefined],
    [Phone, "Telefone", s.phone, s.phone ? `tel:${s.phone.replace(/[^\d+]/g, "")}` : undefined],
    [Mail, "E-mail", s.email, s.email ? `mailto:${s.email}` : undefined],
    [MapPin, "Endereço", s.address, s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}` : undefined],
  ];

  return (
    <div className="animate-in">
      <Link href="/fornecedores?aba=agenda" className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" /> Agenda de fornecedores</Link>
      <PageHeader
        eyebrow={s.category ?? "Fornecedor"}
        title={<span className="flex flex-wrap items-center gap-3"><CategoryIcon category={s.category} size="lg" />{s.name}{s.archivedAt && <Badge>arquivado</Badge>}</span>}
        description={<Stars value={s.rating} size="size-4" />}
        actions={
          <>
            <LinkButton href={`/fornecedores/${id}/editar`} variant="outline"><Pencil className="size-4" />Editar</LinkButton>
            {!s.archivedAt && <LinkButton href={`/fornecedores/orcamento/novo?fornecedor=${id}`}><Plus className="size-4" />Orçamento</LinkButton>}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Orçamentos", String(quotes.length), quotes.length ? `${quotes.filter((q) => q.status === "pending").length} aguardando` : "nenhum ainda"],
          ["Aprovado no total", fmtBRL(approved.reduce((n, q) => n + q.amountCents, 0)), `${approved.length} serviço${approved.length === 1 ? "" : "s"}`],
          ["Taxa de aprovação", decidedCount ? `${Math.round((approved.length / decidedCount) * 100)}%` : "—", decidedCount ? `de ${decidedCount} decidido${decidedCount === 1 ? "" : "s"}` : "nada decidido"],
          ["Último orçamento", quotes[0] ? fmtRelative(quotes[0].createdAt) : "—", quotes[0]?.title ?? ""],
        ].map(([label, value, hint]) => (
          <Card key={label} className="min-w-0 p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 truncate font-display text-xl font-semibold tabular-nums">{value}</p>
            <p className="truncate text-[11px] text-muted">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <dl className="space-y-3">
              {rows.filter(([, , v]) => v).map(([Icon, label, value, href]) => (
                <div key={label} className="flex gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted">{label}</dt>
                    <dd className="break-words text-sm">{href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="hover:text-brand hover:underline">{value}</a> : value}</dd>
                  </div>
                </div>
              ))}
              {s.document && (
                <div className="flex gap-3"><span className="mt-0.5 w-4 shrink-0 text-center text-[10px] font-semibold text-muted">ID</span><div><dt className="text-[11px] text-muted">CNPJ/CPF</dt><dd className="text-sm tabular-nums">{s.document}</dd></div></div>
              )}
              {!rows.some(([, , v]) => v) && !s.document && <p className="text-sm text-muted">Sem dados de contato. <Link href={`/fornecedores/${id}/editar`} className="text-brand hover:underline">Completar</Link></p>}
            </dl>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={buttonClass("success") + " mt-4 w-full"}><MessageCircle className="size-4" />Conversar no WhatsApp</a>
            )}
          </Card>

          {s.notes && (
            <Card className="p-5">
              <p className="mb-1 text-xs font-medium text-muted">Observações</p>
              <p className="whitespace-pre-line text-sm text-fg-2">{s.notes}</p>
            </Card>
          )}

          <p className="text-xs text-muted">Cadastrado por {s.createdByName} em {fmtDate(s.createdAt)}.</p>
          {manage && (
            <form action={setSupplierArchived.bind(null, id, !s.archivedAt)}>
              <button className={buttonClass("ghost", "sm")}>
                {s.archivedAt ? <><ArchiveRestore className="size-4" />Voltar para a agenda</> : <><Archive className="size-4" />Arquivar (some da agenda; os orçamentos ficam)</>}
              </button>
            </form>
          )}
        </div>

        <Card>
          <CardHeader
            title="Orçamentos"
            subtitle={approved.length ? `${approved.length} aprovado${approved.length > 1 ? "s" : ""} · ${fmtBRL(approved.reduce((n, q) => n + q.amountCents, 0))} no total` : `${quotes.length} orçamento${quotes.length === 1 ? "" : "s"}`}
          />
          {!quotes.length ? (
            <p className="px-5 pb-5 text-sm text-muted">Nenhum orçamento deste fornecedor ainda.</p>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {quotes.map((q) => {
                const st = quoteStatus(q.status);
                return (
                  <Link key={q.id} href={`/fornecedores/orcamento/${q.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-bg-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{q.title}</p>
                      <p className="text-xs text-muted">{fmtRelative(q.createdAt)}{q._count.files ? ` · ${q._count.files} arquivo${q._count.files > 1 ? "s" : ""}` : ""}</p>
                    </div>
                    <Badge tone={st.tone} dot>{st.short}</Badge>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtBRL(q.amountCents)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
