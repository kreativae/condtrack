"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { assemblyAccess, closeAssembly, voterUnits } from "@/lib/assembly-server";
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

/** Cria ou edita um rascunho (a pauta só muda enquanto é rascunho). */
export async function saveAssembly(id: string | null, _: AssemblyState, form: FormData): Promise<AssemblyState> {
  const user = await requireUser("superadmin", "syndic");
  const parsed = schema.safeParse(Object.fromEntries([...form.entries()].filter(([k, v]) => !k.startsWith("item") && v !== "")));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const meetingAt = fromLocalInput(d.meetingAt);
  const votingEndsAt = fromLocalInput(d.votingEndsAt);
  if (!meetingAt) return { error: "Informe a data e a hora da assembleia." };
  if (!votingEndsAt) return { error: "Informe até quando vai a votação online." };

  // Pauta: título, descrição e opções (uma por linha) de cada item
  const titles = form.getAll("itemTitle").map((v) => String(v).trim());
  const descs = form.getAll("itemDescription").map((v) => String(v).trim());
  const opts = form.getAll("itemOptions").map(String);
  const items: { title: string; description: string; options: string[] }[] = [];
  for (let i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    const options = optionsFromText(opts[i] ?? "");
    if (!options) return { error: `Item “${titles[i].slice(0, 40)}”: use de 2 a 10 opções, uma por linha.` };
    items.push({ title: titles[i].slice(0, 200), description: (descs[i] ?? "").slice(0, 2000), options });
  }
  if (!items.length) return { error: "Inclua pelo menos um item na pauta." };
  if (items.length > 30) return { error: "No máximo 30 itens na pauta." };

  const existing = id ? await managed(user, id) : null;
  if (id && !existing) return { error: "Assembleia não encontrada." };
  if (existing && existing.status !== "draft") return { error: "Depois de publicada, a pauta não muda. Use Prorrogar para mudar o prazo." };
  const condominiumId = existing?.condominiumId ?? (user.role === "superadmin" ? String(form.get("condominiumId") ?? "") : user.condominiumId);
  if (!condominiumId || !(await db.condominium.findUnique({ where: { id: condominiumId }, select: { id: true } }))) return { error: "Escolha o condomínio." };

  const data = { title: d.title, kind: d.kind, description: d.description, location: d.location, meetingAt, votingEndsAt, showPartial: d.showPartial === "on" };
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
