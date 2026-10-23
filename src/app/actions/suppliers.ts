"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { DAY_RE, dayToDate, fmtBRL, parseBRL } from "@/lib/finance";
import { SUPPLIER_ROLES, canChangeQuote, canDecideQuote, canManageGroup, parseRating, quoteKey } from "@/lib/suppliers";
import { loadGroupFor, loadQuoteFor, loadSupplierFor, supplierCondo } from "@/lib/suppliers-server";
import { deleteFile } from "@/lib/storage";

export type SupplierState = { error?: string; ok?: boolean; id?: string } | undefined;

const clip = (v: FormDataEntryValue | null, n: number) => String(v ?? "").trim().replace(/[ \t]+/g, " ").slice(0, n) || null;
const READONLY = { error: "Indisponível em modo de visualização." };

function refresh(supplierId?: string, quoteId?: string, groupId?: string | null) {
  revalidatePath("/fornecedores");
  if (supplierId) revalidatePath(`/fornecedores/${supplierId}`);
  if (quoteId) revalidatePath(`/fornecedores/orcamento/${quoteId}`);
  if (groupId) revalidatePath(`/fornecedores/cotacao/${groupId}`);
}

/* ───────────── Fornecedores ───────────── */

/** Cadastra (id vazio) ou edita um fornecedor. Zelador, síndico e superadmin. */
export async function saveSupplier(id: string | null, _prev: SupplierState, form: FormData): Promise<SupplierState> {
  const user = await requireUser(...SUPPLIER_ROLES);
  if (user.impersonator) return READONLY;
  const name = clip(form.get("name"), 120);
  if (!name || name.length < 2) return { error: "Informe o nome do fornecedor." };
  const email = clip(form.get("email"), 160)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-mail inválido." };
  const data = {
    name,
    category: clip(form.get("category"), 60),
    contactName: clip(form.get("contactName"), 120),
    phone: clip(form.get("phone"), 40),
    email,
    document: clip(form.get("document"), 30),
    address: clip(form.get("address"), 200),
    notes: String(form.get("notes") ?? "").trim().slice(0, 2000) || null,
    rating: parseRating(form.get("rating")),
  };

  if (id) {
    const old = await loadSupplierFor(user, id);
    if (!old) return { error: "Fornecedor não encontrado." };
    await db.supplier.update({ where: { id }, data });
    await audit(user, "update", "supplier", id, { old: { nome: old.name, ramo: old.category, telefone: old.phone }, new: { nome: data.name, ramo: data.category, telefone: data.phone }, condominiumId: old.condominiumId });
    refresh(id);
    redirect(`/fornecedores/${id}`);
  }

  const condoId = await supplierCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  const s = await db.supplier.create({ data: { ...data, condominiumId: condoId, createdById: user.id, createdByName: user.name } });
  await audit(user, "create", "supplier", s.id, { new: { nome: s.name, ramo: s.category }, condominiumId: condoId });
  refresh();
  redirect(`/fornecedores/${s.id}`);
}

/** Arquiva (some da agenda e da escolha no orçamento) ou restaura. Os orçamentos ficam. Síndico e superadmin. */
export async function setSupplierArchived(id: string, archived: boolean) {
  const user = await requireUser("superadmin", "syndic");
  if (user.impersonator) return;
  const s = await loadSupplierFor(user, id);
  if (!s) return;
  await db.supplier.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await audit(user, archived ? "archive" : "restore", "supplier", id, { new: { nome: s.name }, condominiumId: s.condominiumId });
  refresh(id);
}

/* ───────────── Orçamentos ───────────── */

/**
 * Cadastra ou edita um orçamento (os arquivos sobem depois, pela rota de anexos).
 * Devolve o id para a tela enviar os anexos e abrir o orçamento.
 */
export async function saveQuote(id: string | null, _prev: SupplierState, form: FormData): Promise<SupplierState> {
  const user = await requireUser(...SUPPLIER_ROLES);
  if (user.impersonator) return READONLY;
  const title = clip(form.get("title"), 140);
  if (!title || title.length < 2) return { error: "Informe o serviço ou material orçado." };
  const amountCents = parseBRL(String(form.get("amount") ?? ""));
  if (amountCents === null || amountCents <= 0) return { error: "Informe o valor do orçamento." };
  if (amountCents > 100_000_000_00) return { error: "Valor muito alto." };
  const validRaw = String(form.get("validUntil") ?? "");
  if (validRaw && !DAY_RE.test(validRaw)) return { error: "Data de validade inválida." };
  const data = {
    title,
    description: String(form.get("description") ?? "").trim().slice(0, 3000) || null,
    amountCents,
    validUntil: validRaw ? dayToDate(validRaw) : null,
    deadline: clip(form.get("deadline"), 80),
    paymentTerms: clip(form.get("paymentTerms"), 120),
  };

  if (id) {
    const old = await loadQuoteFor(user, id);
    if (!old) return { error: "Orçamento não encontrado." };
    if (!canChangeQuote(old, user)) return { error: "Este orçamento não pode mais ser alterado." };
    await db.supplierQuote.update({ where: { id }, data });
    await audit(user, "update", "supplier_quote", id, {
      old: { servico: old.title, valor: fmtBRL(old.amountCents) },
      new: { servico: data.title, valor: fmtBRL(data.amountCents) },
      condominiumId: old.condominiumId,
    });
    refresh(old.supplierId, id, old.groupId);
    return { ok: true, id };
  }

  const condoId = await supplierCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  const supplier = await db.supplier.findFirst({ where: { id: String(form.get("supplierId") ?? ""), condominiumId: condoId, archivedAt: null } });
  if (!supplier) return { error: "Escolha o fornecedor." };
  const group = await resolveGroup(user, condoId, title, String(form.get("groupId") ?? ""));
  if (!group) return { error: "Esta cotação já foi encerrada. Reabra a cotação ou cadastre em outra." };
  const q = await db.supplierQuote.create({ data: { ...data, title: group.title, groupId: group.id, condominiumId: condoId, supplierId: supplier.id, createdById: user.id, createdByName: user.name } });
  await audit(user, "create", "supplier_quote", q.id, { new: { fornecedor: supplier.name, servico: q.title, valor: fmtBRL(q.amountCents), cotacao: group.title }, condominiumId: condoId });
  refresh(supplier.id, q.id, group.id);

  // Quem decide fica sabendo; se a cotação já tem outros orçamentos aguardando, a mensagem sugere comparar
  const same = await db.supplierQuote.count({ where: { groupId: group.id, status: "pending" } });
  await notify(
    { condominiumId: condoId, roles: ["syndic"], exclude: user.id },
    {
      type: "quote_created",
      vars: { servico: q.title, fornecedor: supplier.name, valor: fmtBRL(q.amountCents), autor: user.name, comparar: same > 1 ? `${same} orçamentos para este serviço: compare antes de decidir.` : "" },
      referenceType: "supplier_quote",
      referenceId: q.id,
    },
  );
  return { ok: true, id: q.id };
}

/**
 * Cotação do orçamento novo: a escolhida (precisa estar aberta), senão a aberta com o mesmo serviço
 * (mesmo nome sem acento/caixa), senão uma nova com esse nome. null = a escolhida já foi encerrada.
 */
async function resolveGroup(user: CurrentUser, condoId: string, title: string, groupId: string) {
  if (groupId) {
    const g = await db.quoteGroup.findFirst({ where: { id: groupId, condominiumId: condoId } });
    return g && g.status === "open" && !g.archivedAt ? g : null;
  }
  const open = await db.quoteGroup.findMany({ where: { condominiumId: condoId, status: "open", archivedAt: null }, orderBy: { createdAt: "desc" } });
  const same = open.find((g) => quoteKey(g.title) === quoteKey(title));
  if (same) return same;
  const g = await db.quoteGroup.create({ data: { condominiumId: condoId, title, createdById: user.id, createdByName: user.name } });
  await audit(user, "create", "quote_group", g.id, { new: { cotacao: g.title }, condominiumId: condoId });
  return g;
}

/** Síndico ou superadmin aprova ou recusa (recusa pede o motivo). A decisão é reservada: só vale uma vez. */
export async function decideQuote(id: string, _prev: SupplierState, form: FormData): Promise<SupplierState> {
  const user = await requireUser("superadmin", "syndic");
  if (user.impersonator) return READONLY;
  if (!canDecideQuote(user.role)) return { error: "Só o síndico decide." };
  const q = await loadQuoteFor(user, id);
  if (!q) return { error: "Orçamento não encontrado." };
  const approve = form.get("decision") === "approve";
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  if (!approve && !note) return { error: "Escreva o motivo da recusa." };
  const status = approve ? "approved" : "rejected";
  const { count } = await db.supplierQuote.updateMany({
    where: { id, status: "pending" },
    data: { status, decidedById: user.id, decidedByName: user.name, decidedAt: new Date(), decisionNote: note },
  });
  if (!count) return { error: "Este orçamento já foi decidido ou cancelado." };
  await audit(user, approve ? "approve" : "reject", "supplier_quote", id, { new: { fornecedor: q.supplier.name, servico: q.title, valor: fmtBRL(q.amountCents), motivo: note }, condominiumId: q.condominiumId });
  if (q.createdById) {
    await notify(
      { condominiumId: q.condominiumId, userIds: [q.createdById], exclude: user.id },
      {
        type: "quote_decided",
        vars: { servico: q.title, fornecedor: q.supplier.name, valor: fmtBRL(q.amountCents), autor: user.name, decisao: approve ? "aprovado" : "recusado", comentario: note ?? "", comparar: "" },
        referenceType: "supplier_quote",
        referenceId: id,
      },
    );
  }
  refresh(q.supplierId, id, q.groupId);
  return { ok: true };
}

/** Cancela um orçamento que ainda aguarda (o fornecedor desistiu, foi cadastrado errado…). */
export async function cancelQuote(id: string) {
  const user = await requireUser(...SUPPLIER_ROLES);
  if (user.impersonator) return;
  const q = await loadQuoteFor(user, id);
  if (!q || !canChangeQuote(q, user)) return;
  const { count } = await db.supplierQuote.updateMany({ where: { id, status: "pending" }, data: { status: "cancelled", decidedById: user.id, decidedByName: user.name, decidedAt: new Date() } });
  if (count) await audit(user, "cancel", "supplier_quote", id, { new: { fornecedor: q.supplier.name, servico: q.title }, condominiumId: q.condominiumId });
  refresh(q.supplierId, id, q.groupId);
}

/** Tira um arquivo do orçamento (só enquanto aguarda a decisão). */
export async function removeQuoteFile(fileId: string) {
  const user = await requireUser(...SUPPLIER_ROLES);
  if (user.impersonator) return;
  const f = await db.supplierQuoteFile.findUnique({ where: { id: fileId } });
  if (!f) return;
  const q = await loadQuoteFor(user, f.quoteId);
  if (!q || !canChangeQuote(q, user)) return;
  await db.supplierQuoteFile.delete({ where: { id: fileId } });
  await deleteFile(f.url).catch(() => null);
  await audit(user, "remove_file", "supplier_quote", q.id, { old: { arquivo: f.fileName }, condominiumId: q.condominiumId });
  refresh(q.supplierId, q.id, q.groupId);
}

/** Cadastro rápido de dentro do orçamento: só nome, ramo e telefone. Devolve o fornecedor para já ficar escolhido. */
export async function quickSupplier(input: { name: string; category?: string; phone?: string }): Promise<{ error?: string; supplier?: { id: string; name: string; category: string | null } }> {
  const user = await requireUser(...SUPPLIER_ROLES);
  if (user.impersonator) return READONLY;
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) return { error: "Informe o nome do fornecedor." };
  const condoId = await supplierCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  // Mesmo nome já cadastrado: usa o que existe (volta para a agenda se estava arquivado)
  const same = await db.supplier.findFirst({ where: { condominiumId: condoId, name: { equals: name, mode: "insensitive" } } });
  if (same) {
    if (same.archivedAt) await db.supplier.update({ where: { id: same.id }, data: { archivedAt: null } });
    return { supplier: { id: same.id, name: same.name, category: same.category } };
  }
  const s = await db.supplier.create({
    data: {
      condominiumId: condoId, name,
      category: input.category?.trim().slice(0, 60) || null,
      phone: input.phone?.trim().slice(0, 40) || null,
      createdById: user.id, createdByName: user.name,
    },
  });
  await audit(user, "create", "supplier", s.id, { new: { nome: s.name, ramo: s.category }, condominiumId: condoId });
  refresh();
  return { supplier: { id: s.id, name: s.name, category: s.category } };
}

/* ───────────── Cotações ───────────── */

/** Cria (id vazio) ou renomeia uma cotação. Nova cotação pode começar vazia, para pedir os orçamentos depois. */
export async function saveGroup(id: string | null, _prev: SupplierState, form: FormData): Promise<SupplierState> {
  const user = await requireUser(...SUPPLIER_ROLES);
  if (user.impersonator) return READONLY;
  const title = clip(form.get("title"), 140);
  if (!title || title.length < 2) return { error: "Dê um nome à cotação (o serviço ou material)." };
  const description = String(form.get("description") ?? "").trim().slice(0, 2000) || null;
  if (id) {
    const g = await loadGroupFor(user, id);
    if (!g) return { error: "Cotação não encontrada." };
    await db.$transaction([
      db.quoteGroup.update({ where: { id }, data: { title, description } }),
      // O nome do serviço dos orçamentos acompanha a cotação
      db.supplierQuote.updateMany({ where: { groupId: id }, data: { title } }),
    ]);
    await audit(user, "update", "quote_group", id, { old: { cotacao: g.title }, new: { cotacao: title }, condominiumId: g.condominiumId });
    refresh(undefined, undefined, id);
    return { ok: true, id };
  }
  const condoId = await supplierCondo(user);
  if (!condoId) return { error: "Escolha um condomínio no menu." };
  const g = await db.quoteGroup.create({ data: { condominiumId: condoId, title, description, createdById: user.id, createdByName: user.name } });
  await audit(user, "create", "quote_group", g.id, { new: { cotacao: g.title }, condominiumId: condoId });
  refresh();
  return { ok: true, id: g.id };
}

/**
 * Encerra a cotação: com o orçamento contratado (aprovado agora, se ainda aguardava) ou sem contratação.
 * `rejectOthers` recusa os que ainda aguardam, com o motivo; cada pessoa que cadastrou é avisada.
 */
export async function closeGroup(id: string, _prev: SupplierState, form: FormData): Promise<SupplierState> {
  const user = await requireUser("superadmin", "syndic");
  if (user.impersonator) return READONLY;
  if (!canManageGroup(user.role)) return { error: "Só o síndico encerra a cotação." };
  const g = await loadGroupFor(user, id);
  if (!g) return { error: "Cotação não encontrada." };
  if (g.status !== "open") return { error: "Esta cotação já foi encerrada." };
  const chosenId = String(form.get("chosenQuoteId") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
  const rejectOthers = form.get("rejectOthers") === "on";
  const chosen = chosenId ? g.quotes.find((q) => q.id === chosenId) : null;
  if (chosenId && (!chosen || chosen.status === "rejected" || chosen.status === "cancelled")) return { error: "Escolha um orçamento que esteja aguardando ou aprovado." };
  if (!chosen && !note) return { error: "Encerrando sem contratar, escreva o motivo (fica no histórico)." };

  // Reserva o encerramento antes de mexer nos orçamentos (dois cliques não encerram duas vezes)
  const { count } = await db.quoteGroup.updateMany({
    where: { id, status: "open" },
    data: { status: "closed", chosenQuoteId: chosen?.id ?? null, closedAt: new Date(), closedById: user.id, closedByName: user.name, closingNote: note },
  });
  if (!count) return { error: "Esta cotação já foi encerrada." };

  if (chosen?.status === "pending") {
    const f = new FormData();
    f.set("decision", "approve");
    if (note) f.set("note", note);
    await decideQuote(chosen.id, undefined, f);
  }
  if (rejectOthers) {
    const reason = chosen ? `Escolhido outro fornecedor: ${chosen.supplier.name} (${fmtBRL(chosen.amountCents)}).` : `Cotação encerrada sem contratação: ${note}`;
    for (const o of g.quotes.filter((q) => q.status === "pending" && q.id !== chosen?.id)) {
      const f = new FormData();
      f.set("decision", "reject");
      f.set("note", reason.slice(0, 1000));
      await decideQuote(o.id, undefined, f);
    }
  }
  await audit(user, "close", "quote_group", id, {
    new: { cotacao: g.title, contratado: chosen ? `${chosen.supplier.name} · ${fmtBRL(chosen.amountCents)}` : "sem contratação", motivo: note },
    condominiumId: g.condominiumId,
  });
  refresh(undefined, undefined, id);
  return { ok: true };
}

/** Reabre uma cotação encerrada (não arquivada). Os orçamentos ficam como estão; o contratado sai. */
export async function reopenGroup(id: string) {
  const user = await requireUser("superadmin", "syndic");
  if (user.impersonator) return;
  const g = await loadGroupFor(user, id);
  if (!g || g.status !== "closed" || g.archivedAt) return;
  await db.quoteGroup.update({ where: { id }, data: { status: "open", chosenQuoteId: null, closedAt: null, closedById: null, closedByName: null, closingNote: null } });
  await audit(user, "reopen", "quote_group", id, { old: { cotacao: g.title, motivo: g.closingNote }, condominiumId: g.condominiumId });
  refresh(undefined, undefined, id);
}

/** Arquiva (vai para o histórico) ou devolve uma cotação encerrada. */
export async function setGroupArchived(id: string, archived: boolean) {
  const user = await requireUser("superadmin", "syndic");
  if (user.impersonator) return;
  const g = await loadGroupFor(user, id);
  if (!g || g.status !== "closed") return;
  await db.quoteGroup.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await audit(user, archived ? "archive" : "restore", "quote_group", id, { new: { cotacao: g.title }, condominiumId: g.condominiumId });
  refresh(undefined, undefined, id);
}
