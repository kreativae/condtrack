import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { financeAccess, financeCondo, financeLog, financePeriod } from "@/lib/finance-server";
import { ATTACHMENT_KINDS, FIN_STATUS, FIN_TYPES, fmtDayBR } from "@/lib/finance";

// Planilha (CSV, separador ;) dos lançamentos do período, para contador ou conselho.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const condo = await financeCondo(user, sp.condo);
  if (!condo || !financeAccess(user, condo).view) return new NextResponse("Not found", { status: 404 });
  const p = financePeriod(sp);

  const rows = await db.financeEntry.findMany({
    where: { condominiumId: condo.id, deletedAt: null, date: { gte: p.from, lt: p.to } },
    include: { attachments: { where: { deletedAt: null }, select: { kind: true } }, createdBy: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const head = ["Competência", "Tipo", "Categoria", "Descrição", "Fornecedor/pagador", "Documento", "Valor (R$)", "Vencimento", "Pagamento", "Situação", "Forma de pagamento", "Anexos", "Lançado por"];
  const lines = rows.map((e) => [
    fmtDayBR(e.date), FIN_TYPES[e.type as keyof typeof FIN_TYPES] ?? e.type, e.category, e.description, e.counterparty, e.document,
    (e.type === "expense" ? "-" : "") + money(e.amountCents), e.dueDate ? fmtDayBR(e.dueDate) : "", e.paidAt ? fmtDayBR(e.paidAt) : "",
    FIN_STATUS[e.status as keyof typeof FIN_STATUS]?.label ?? e.status, e.paymentMethod,
    e.attachments.map((a) => ATTACHMENT_KINDS[a.kind as keyof typeof ATTACHMENT_KINDS] ?? a.kind).join(", "), e.createdBy?.name ?? "",
  ].map(cell).join(";"));
  await financeLog(user, { condominiumId: condo.id, action: "exported", changes: { periodo: p.key, linhas: rows.length } });

  // BOM para o Excel reconhecer os acentos
  const csv = "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n");
  const slug = condo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeiro-${slug}-${p.key}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
