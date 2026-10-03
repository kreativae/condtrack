"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { applyAssemblyEdit, assemblyAccess, closeAssembly, describeChange, voterUnits, type ProposedAssembly } from "@/lib/assembly-server";
import { condoSyndics } from "@/lib/memberships";
import { fmtDateTimeBR, fmtMeeting, fromLocalInput, optionsFromText, parseOptions } from "@/lib/assembly";

export type AssemblyState = { error?: string; ok?: boolean; message?: string } | undefined;

async function managed(user: CurrentUser, id: string) {
  const a = await db.assembly.findUnique({ where: { id } });
  if (!a || !assemblyAccess(user, a.condominiumId).manage) return null;
  return a;
}

const schema = z.object({
  title: z.string().trim().min(3, "Informe o título.").max(150),
  kind: z.enum(["ordinary", "extraordinary"]),
  description: z.string().trim().max(4000).default(""),
  location: z.string().trim().max(200).default(""),
  meetingAt: z.string(),
  votingEndsAt: z.string(),
  showPartial: z.string().optional(),
});

type Parsed = { data: { title: string; kind: string; description: string; location: string; meetingAt: Date; votingEndsAt: Date; showPartial: boolean }; items: { id: string | null; title: string; description: string; options: string[] }[] };

/** Lê o formulário da assembleia (dados + pauta). Usado no rascunho e nos pedidos do superadmin. */
function parseAssemblyForm(form: FormData): Parsed | { error: string } {
  const parsed = schema.safeParse(Object.fromEntries([...form.entries()].filter(([k, v]) => !k.startsWith("item") && v !== "")));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const meetingAt = fromLocalInput(d.meetingAt);
  const votingEndsAt = fromLocalInput(d.votingEndsAt);
  if (!meetingAt) return { error: "Informe a data e a hora da assembleia." };
  if (!votingEndsAt) return { error: "Informe até quando vai a votação online." };

  // Pauta: título, descrição e opções (uma por linha) de cada item; itemId liga ao item já existente
  const ids = form.getAll("itemId").map((v) => String(v));
  const titles = form.getAll("itemTitle").map((v) => String(v).trim());
  const descs = form.getAll("itemDescription").map((v) => String(v).trim());
  const opts = form.getAll("itemOptions").map(String);
  const items: Parsed["items"] = [];
  for (let i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    const options = optionsFromText(opts[i] ?? "");
    if (!options) return { error: `Item “${titles[i].slice(0, 40)}”: use de 2 a 10 opções, uma por linha.` };
    items.push({ id: ids[i] || null, title: titles[i].slice(0, 200), description: (descs[i] ?? "").slice(0, 2000), options });
  }
  if (!items.length) return { error: "Inclua pelo menos um item na pauta." };
  if (items.length > 30) return { error: "No máximo 30 itens na pauta." };
  return { data: { title: d.title, kind: d.kind, description: d.description, location: d.location, meetingAt, votingEndsAt, showPartial: d.showPartial === "on" }, items };
}

/** Cria ou edita um rascunho (a pauta só muda enquanto é rascunho; publicada, só por pedido aprovado). */
export async function saveAssembly(id: string | null, _: AssemblyState, form: FormData): Promise<AssemblyState> {
  const user = await requireUser("superadmin", "syndic");
  const p = parseAssemblyForm(form);
  if ("error" in p) return { error: p.error };
  const { items } = p;

  const existing = id ? await managed(user, id) : null;
  if (id && !existing) return { error: "Assembleia não encontrada." };
  if (existing && existing.status !== "draft") return { error: "Depois de publicada, a pauta não muda. Use Prorrogar para mudar o prazo." };
  const condominiumId = existing?.condominiumId ?? (user.role === "superadmin" ? String(form.get("condominiumId") ?? "") : user.condominiumId);
  if (!condominiumId || !(await db.condominium.findUnique({ where: { id: condominiumId }, select: { id: true } }))) return { error: "Escolha o condomínio." };

  const data = p.data;
  const itemRows = items.map((it, position) => ({ position, title: it.title, description: it.description, options: JSON.stringify(it.options) }));
  const saved = existing
    ? await db.$transaction(async (tx) => {
        await tx.assemblyItem.deleteMany({ where: { assemblyId: existing.id } });
        return tx.assembly.update({ where: { id: existing.id }, data: { ...data, items: { create: itemRows } } });
      })
    : await db.assembly.create({ data: { ...data, condominiumId, createdById: user.id, items: { create: itemRows } } });
  await audit(user, existing ? "update" : "create", "assembly", saved.id, { new: { titulo: saved.title, itens: items.length }, condominiumId });
  revalidatePath("/assembleias");
  redirect(`/assembleias/${saved.id}`);
}

/** Publica a convocação: abre a votação, cria o comunicado e avisa todo o condomínio. */
export async function publishAssembly(id: string): Promise<AssemblyState> {
  const user = await requireUser("superadmin", "syndic");
  const a = await managed(user, id);
  if (!a || a.status !== "draft") return { error: "Só rascunhos podem ser publicados." };
  if (a.votingEndsAt <= new Date()) return { error: "O fim da votação já passou. Edite o prazo antes de publicar." };
  if (!(await db.assemblyItem.count({ where: { assemblyId: id } }))) return { error: "Inclua pelo menos um item na pauta." };

  const claim = await db.assembly.updateMany({ where: { id, status: "draft" }, data: { status: "open", publishedAt: new Date() } });
  if (!claim.count) return { error: "A assembleia já foi publicada." };
  const local = a.location ? `, ${a.location}` : "";
  await db.announcement.create({
    data: {
      condominiumId: a.condominiumId,
      authorId: user.id,
      title: `Convocação: ${a.title}`,
      content: `${fmtMeeting(a.meetingAt)}${local}.\n\nA votação online fica aberta até ${fmtDateTimeBR(a.votingEndsAt)}. Proprietários votam pelo Condtrack, em Assembleias.${a.description ? `\n\n${a.description}` : ""}`,
      category: "event",
      priority: "high",
    },
  });
  await notify(
    { condominiumId: a.condominiumId, roles: ["syndic", "council", "resident", "caretaker"], exclude: user.id },
    { type: "assembly_called", vars: { titulo: a.title, quando: fmtMeeting(a.meetingAt), local, prazo: fmtDateTimeBR(a.votingEndsAt) }, referenceType: "assembly", referenceId: id },
  );
  await audit(user, "publish", "assembly", id, { new: { titulo: a.title, fimVotacao: a.votingEndsAt }, condominiumId: a.condominiumId });
  revalidatePath(`/assembleias/${id}`);
  return { ok: true, message: "Convocação publicada. Todos foram avisados." };
}

/**
 * Voto de uma unidade em todos os itens respondidos (pode mudar até o encerramento).
 * Só o proprietário da unidade, no condomínio da assembleia, com a votação aberta e no prazo.
 */
export async function castVote(id: string, _: AssemblyState, form: FormData): Promise<AssemblyState> {
  const user = await requireUser();
  if (user.impersonator) return { error: "Em modo de visualização não é possível votar." };
  const a = await db.assembly.findUnique({ where: { id }, include: { items: true } });
  if (!a || !assemblyAccess(user, a.condominiumId).view) return { error: "Assembleia não encontrada." };
  if (a.status !== "open" || a.votingEndsAt <= new Date()) return { error: "A votação está encerrada." };

  const unitId = String(form.get("unitId") ?? "");
  const units = await voterUnits(user.id, a.condominiumId);
  const unit = units.find((u) => u.id === unitId);
  if (!unit) return { error: "Só o proprietário da unidade pode votar." };

  const votes: { itemId: string; option: number }[] = [];
  for (const it of a.items) {
    const raw = form.get(`item_${it.id}`);
    if (raw == null || raw === "") continue;
    const option = Number(raw);
    if (!Number.isInteger(option) || option < 0 || option >= parseOptions(it.options).length) return { error: "Opção inválida." };
    votes.push({ itemId: it.id, option });
  }
  if (!votes.length) return { error: "Escolha uma opção em pelo menos um item." };

  await db.$transaction(
    votes.map((v) =>
      db.assemblyVote.upsert({
        where: { itemId_unitId: { itemId: v.itemId, unitId } },
        create: { assemblyId: id, itemId: v.itemId, unitId, userId: user.id, option: v.option },
        update: { option: v.option, userId: user.id },
      }),
    ),
  );
  await audit(user, "assembly_vote", "assembly", id, { new: { unidade: unit.label, votos: votes.length }, condominiumId: a.condominiumId });
  revalidatePath(`/assembleias/${id}`);
  return { ok: true, message: `Voto da ${unit.label} registrado. Dá para mudar até o fim da votação.` };
}

/** Novo prazo para a votação (só com a votação aberta). */
export async function extendVoting(id: string, _: AssemblyState, form: FormData): Promise<AssemblyState> {
  const user = await requireUser("superadmin", "syndic");
  const a = await managed(user, id);
  if (!a || a.status !== "open") return { error: "Só votações abertas podem ser prorrogadas." };
  const until = fromLocalInput(String(form.get("votingEndsAt") ?? ""));
  if (!until || until <= new Date()) return { error: "Escolha uma data e hora no futuro." };
  await db.assembly.update({ where: { id }, data: { votingEndsAt: until } });
  await audit(user, "update", "assembly", id, { old: { fimVotacao: a.votingEndsAt }, new: { fimVotacao: until }, condominiumId: a.condominiumId });
  revalidatePath(`/assembleias/${id}`);
  return { ok: true, message: `Votação prorrogada até ${fmtDateTimeBR(until)}.` };
}

export async function closeVoting(id: string) {
  const user = await requireUser("superadmin", "syndic");
  const a = await managed(user, id);
  if (!a || a.status !== "open") return;
  if (await closeAssembly(id)) await audit(user, "close", "assembly", id, { condominiumId: a.condominiumId });
  revalidatePath(`/assembleias/${id}`);
}

export async function saveMinutes(id: string, _: AssemblyState, form: FormData): Promise<AssemblyState> {
  const user = await requireUser("superadmin", "syndic");
  const a = await managed(user, id);
  if (!a || a.status !== "closed") return { error: "A ata é escrita depois do encerramento." };
  const minutes = String(form.get("minutes") ?? "").slice(0, 50_000);
  await db.assembly.update({ where: { id }, data: { minutes, minutesUpdatedAt: new Date() } });
  await audit(user, "minutes", "assembly", id, { new: { caracteres: minutes.length }, condominiumId: a.condominiumId });
  revalidatePath(`/assembleias/${id}`);
  return { ok: true, message: "Ata salva." };
}

/** Só rascunhos (assembleias publicadas ficam para o histórico). */
export async function deleteAssembly(id: string) {
  const user = await requireUser("superadmin", "syndic");
  const a = await managed(user, id);
  if (!a || a.status !== "draft") return;
  await db.assembly.delete({ where: { id } });
  await audit(user, "delete", "assembly", id, { old: { titulo: a.title }, condominiumId: a.condominiumId });
  revalidatePath("/assembleias");
  redirect("/assembleias");
}

// ───── Pedidos do superadmin com aprovação do síndico (assembleia já publicada)

async function openRequestGuard(id: string) {
  const user = await requireUser("superadmin");
  const a = await db.assembly.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" }, include: { votes: { select: { id: true } } } } } });
  if (!a) return { error: "Assembleia não encontrada." } as const;
  if (a.status === "draft") return { error: "Rascunhos são editados direto." } as const;
  if (await db.assemblyChange.findFirst({ where: { assemblyId: id, status: "pending" } })) return { error: "Já há um pedido aguardando o síndico. Cancele-o antes de fazer outro." } as const;
  const syndics = await condoSyndics(a.condominiumId);
  if (!syndics.length) return { error: "Este condomínio não tem síndico para aprovar o pedido." } as const;
  return { user, a, syndics } as const;
}

async function notifySyndics(a: { id: string; condominiumId: string; title: string }, syndics: { id: string }[], autor: string, acao: string) {
  await notify(
    { condominiumId: a.condominiumId, userIds: syndics.map((s) => s.id) },
    { type: "assembly_change_request", vars: { titulo: a.title, autor, acao }, referenceType: "assembly", referenceId: a.id },
  );
}

/** Superadmin propõe uma edição; nada muda até o síndico aprovar. */
export async function requestAssemblyEdit(id: string, _: AssemblyState, form: FormData): Promise<AssemblyState> {
  const g = await openRequestGuard(id);
  if ("error" in g) return { error: g.error };
  const p = parseAssemblyForm(form);
  if ("error" in p) return { error: p.error };
  const { user, a, syndics } = g;
  if (a.status === "open" && p.data.votingEndsAt <= new Date()) return { error: "O novo fim da votação precisa ser no futuro." };
  const payload: ProposedAssembly = { ...p.data, meetingAt: p.data.meetingAt.toISOString(), votingEndsAt: p.data.votingEndsAt.toISOString(), items: p.items };
  const { lines } = describeChange(a, payload);
  if (!lines.length) return { error: "Nada foi alterado." };
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  const c = await db.assemblyChange.create({ data: { assemblyId: id, kind: "edit", payload: JSON.stringify(payload), reason, requestedById: user.id, requestedBy: user.name } });
  await audit(user, "assembly_change_request", "assembly", id, { new: { pedido: c.id, tipo: "edição", mudancas: lines }, condominiumId: a.condominiumId });
  await notifySyndics(a, syndics, user.name, "editar");
  revalidatePath(`/assembleias/${id}`);
  redirect(`/assembleias/${id}`);
}

/** Superadmin pede a exclusão; só acontece com a aprovação do síndico. */
export async function requestAssemblyDelete(id: string, _: AssemblyState, form: FormData): Promise<AssemblyState> {
  const g = await openRequestGuard(id);
  if ("error" in g) return { error: g.error };
  const { user, a, syndics } = g;
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (reason.length < 5) return { error: "Explique o motivo da exclusão para o síndico." };
  const c = await db.assemblyChange.create({ data: { assemblyId: id, kind: "delete", reason, requestedById: user.id, requestedBy: user.name } });
  await audit(user, "assembly_change_request", "assembly", id, { new: { pedido: c.id, tipo: "exclusão", motivo: reason }, condominiumId: a.condominiumId });
  await notifySyndics(a, syndics, user.name, "excluir");
  revalidatePath(`/assembleias/${id}`);
  return { ok: true, message: "Pedido enviado ao síndico." };
}

/** Superadmin desiste do pedido. */
export async function cancelAssemblyChange(changeId: string) {
  const user = await requireUser("superadmin");
  const c = await db.assemblyChange.findUnique({ where: { id: changeId }, include: { assembly: { select: { condominiumId: true } } } });
  if (!c || c.status !== "pending") return;
  await db.assemblyChange.update({ where: { id: changeId }, data: { status: "cancelled", decidedById: user.id, decidedBy: user.name, decidedAt: new Date() } });
  await audit(user, "assembly_change_cancel", "assembly", c.assemblyId, { new: { pedido: c.id }, condominiumId: c.assembly.condominiumId });
  revalidatePath(`/assembleias/${c.assemblyId}`);
}

/** Síndico aprova ou recusa o pedido do superadmin. */
export async function decideAssemblyChange(changeId: string, _: AssemblyState, form: FormData): Promise<AssemblyState> {
  const user = await requireUser("syndic");
  // O botão clicado diz a decisão (Aprovar / Recusar)
  const approve = form.get("decision") === "approve";
  if (user.impersonator) return { error: "Em modo de visualização não é possível decidir o pedido." };
  const c = await db.assemblyChange.findUnique({ where: { id: changeId }, include: { assembly: true } });
  if (!c || c.assembly.condominiumId !== user.condominiumId) return { error: "Pedido não encontrado." };
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  // Reserva a decisão: só uma pessoa decide, uma vez
  const claim = await db.assemblyChange.updateMany({
    where: { id: changeId, status: "pending" },
    data: { status: approve ? "approved" : "rejected", decidedById: user.id, decidedBy: user.name, decisionNote: note, decidedAt: new Date() },
  });
  if (!claim.count) return { error: "Este pedido já foi decidido." };
  const a = c.assembly;
  const tell = (decisao: string) =>
    notify(
      { condominiumId: a.condominiumId, userIds: [c.requestedById] },
      { type: "assembly_change_decided", vars: { titulo: a.title, decisao, autor: user.name, comentario: note }, referenceType: "assembly", referenceId: a.id },
    );

  if (!approve) {
    await audit(user, "assembly_change_reject", "assembly", a.id, { new: { pedido: c.id, motivo: note }, condominiumId: a.condominiumId });
    await tell("recusado");
    revalidatePath(`/assembleias/${a.id}`);
    return { ok: true, message: "Pedido recusado. Nada foi alterado." };
  }

  if (c.kind === "delete") {
    const votes = await db.assemblyVote.count({ where: { assemblyId: a.id } });
    await audit(user, "delete", "assembly", a.id, { old: { titulo: a.title, status: a.status, votos: votes, pedidoDe: c.requestedBy, motivo: c.reason }, condominiumId: a.condominiumId });
    await tell("aprovado (assembleia excluída)");
    await db.assembly.delete({ where: { id: a.id } });
    revalidatePath("/assembleias");
    redirect("/assembleias");
  }

  const next = JSON.parse(c.payload) as ProposedAssembly;
  if (a.status === "open" && new Date(next.votingEndsAt) <= new Date()) {
    await db.assemblyChange.update({ where: { id: changeId }, data: { status: "rejected", decisionNote: "O novo fim da votação já passou." } });
    return { error: "O novo fim da votação proposto já passou. O pedido foi encerrado; peça um novo ao superadmin." };
  }
  const r = await applyAssemblyEdit(a.id, next);
  await audit(user, "assembly_change_approve", "assembly", a.id, { new: { pedido: c.id, pedidoDe: c.requestedBy, itensZerados: r?.reset ?? [] }, condominiumId: a.condominiumId });
  await tell("aprovado");
  // Itens com votos zerados: proprietários votam de novo
  if (r?.reset.length && r.status === "open") {
    await notify(
      { condominiumId: a.condominiumId, roles: ["syndic", "council", "resident", "caretaker"], exclude: user.id },
      { type: "assembly_revote", vars: { titulo: next.title, itens: r.reset.length, prazo: fmtDateTimeBR(next.votingEndsAt) }, referenceType: "assembly", referenceId: a.id },
    );
  }
  revalidatePath(`/assembleias/${a.id}`);
  return { ok: true, message: r?.reset.length ? `Alteração aplicada. ${r.reset.length} ${r.reset.length === 1 ? "item teve" : "itens tiveram"} os votos zerados e todos foram avisados.` : "Alteração aplicada." };
}
