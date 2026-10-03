import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { notify } from "./notify";
import { unitLabel } from "./units";
import { ASSEMBLY_KINDS, fmtDateTimeBR, fmtMeeting, parseOptions, pct, tally, type AssemblyKind } from "./assembly";

// Assembleias: acesso, votantes, encerramento e rascunho da ata.
// Quem vota: proprietário da unidade (UserUnit "owner"), qualquer perfil — é a única ação de escrita do morador.

export type AssemblyAccess = { view: boolean; manage: boolean };

export function assemblyAccess(user: CurrentUser, condominiumId: string): AssemblyAccess {
  if (user.role === "superadmin") return { view: true, manage: true };
  if (user.condominiumId !== condominiumId || user.role === "provider") return { view: false, manage: false };
  return { view: true, manage: user.role === "syndic" };
}

/** Unidades em que a pessoa vota neste condomínio (é proprietária). */
export async function voterUnits(userId: string, condominiumId: string) {
  const links = await db.userUnit.findMany({
    where: { userId, role: "owner", unit: { building: { condominiumId } } },
    include: { unit: { include: { building: true } } },
  });
  return links.map((l) => ({ id: l.unitId, label: unitLabel(l.unit) }));
}

export const unitsCount = (condominiumId: string) => db.unit.count({ where: { building: { condominiumId } } });

type Full = NonNullable<Awaited<ReturnType<typeof loadAssembly>>>;

export function loadAssembly(id: string) {
  return db.assembly.findUnique({
    where: { id },
    include: {
      condominium: { select: { id: true, name: true, address: true, cnpj: true, logoUrl: true } },
      items: { orderBy: { position: "asc" }, include: { votes: { select: { option: true, unitId: true, userId: true, updatedAt: true } } } },
    },
  });
}

/** Rascunho da ata a partir da pauta e da apuração (o síndico revisa e completa). */
export function minutesDraft(a: Full, totalUnits: number, closedAt: Date) {
  const voted = new Set(a.items.flatMap((i) => i.votes.map((v) => v.unitId))).size;
  const lines = [
    `ATA DA ${ASSEMBLY_KINDS[a.kind as AssemblyKind]?.toUpperCase() ?? "ASSEMBLEIA"} DO ${a.condominium.name.toUpperCase()}`,
    "",
    `Realizada em ${fmtMeeting(a.meetingAt)}${a.location ? `, em ${a.location}` : ""}.`,
    `Votação online aberta de ${a.publishedAt ? fmtDateTimeBR(a.publishedAt) : "—"} a ${fmtDateTimeBR(closedAt)}.`,
    `Participaram da votação ${voted} de ${totalUnits} unidades (${pct(voted, totalUnits)}%).`,
    "",
    "ORDEM DO DIA E DELIBERAÇÕES",
  ];
  a.items.forEach((it, n) => {
    const opts = parseOptions(it.options);
    const t = tally(opts, it.votes);
    lines.push("", `${n + 1}. ${it.title}`);
    if (it.description) lines.push(it.description);
    lines.push(`Votos: ${opts.map((o, i) => `${o} ${t.counts[i]} (${pct(t.counts[i], t.total)}%)`).join("; ")}.`);
    lines.push(t.winner == null ? (t.total ? "Resultado: empate; o item deve ser deliberado novamente." : "Resultado: sem votos.") : `Resultado: prevaleceu “${opts[t.winner]}”.`);
  });
  lines.push("", "Nada mais havendo a tratar, encerrou-se a assembleia, lavrando-se a presente ata, que vai assinada pelo presidente e pelo secretário.");
  return lines.join("\n");
}

/** Encerra a votação (só se ainda estiver aberta), gera o rascunho da ata e avisa o condomínio. */
export async function closeAssembly(id: string) {
  const now = new Date();
  const claim = await db.assembly.updateMany({ where: { id, status: "open" }, data: { status: "closed", closedAt: now } });
  if (!claim.count) return false;
  const a = await loadAssembly(id);
  if (!a) return false;
  if (!a.minutes.trim()) await db.assembly.update({ where: { id }, data: { minutes: minutesDraft(a, await unitsCount(a.condominiumId), now) } });
  await notify(
    { condominiumId: a.condominiumId, roles: ["syndic", "council", "resident", "caretaker"] },
    { type: "assembly_closed", vars: { titulo: a.title }, referenceType: "assembly", referenceId: id },
  );
  return true;
}

/** Encerra as votações com prazo vencido (agendamento a cada 15 min e ao abrir as páginas). */
export async function closeExpiredAssemblies(nowMs: number, condominiumId?: string) {
  const due = await db.assembly.findMany({ where: { status: "open", votingEndsAt: { lte: new Date(nowMs) }, ...(condominiumId ? { condominiumId } : {}) }, select: { id: true } });
  for (const a of due) await closeAssembly(a.id).catch((e) => console.error(`[assembleia] ${a.id}`, e));
  return due.length;
}

// ───── Pedidos do superadmin (editar/excluir assembleia publicada) com aprovação do síndico

export type ProposedAssembly = {
  title: string; kind: string; description: string; location: string; meetingAt: string; votingEndsAt: string; showPartial: boolean;
  items: { id: string | null; title: string; description: string; options: string[] }[];
};

type Current = { title: string; kind: string; description: string; location: string; meetingAt: Date; votingEndsAt: Date; showPartial: boolean; status: string; items: { id: string; title: string; description: string; options: string; votes: unknown[] }[] };

const sameItem = (a: { title: string; description: string; options: string[] }, b: { title: string; description: string; options: string }) =>
  a.title === b.title && a.description === b.description && JSON.stringify(a.options) === JSON.stringify(parseOptions(b.options));

const votos = (n: number) => `${n} ${n === 1 ? "voto" : "votos"}`;

/** O que muda (em palavras) e quantos itens com votos perdem os votos. Encerrada: a pauta não muda. */
export function describeChange(cur: Current, next: ProposedAssembly) {
  const lines: string[] = [];
  if (cur.title !== next.title) lines.push(`Título: “${cur.title}” → “${next.title}”`);
  if (cur.kind !== next.kind) lines.push(`Tipo: ${ASSEMBLY_KINDS[cur.kind as AssemblyKind] ?? cur.kind} → ${ASSEMBLY_KINDS[next.kind as AssemblyKind] ?? next.kind}`);
  if (cur.location !== next.location) lines.push(`Local: “${cur.location || "—"}” → “${next.location || "—"}”`);
  if (cur.meetingAt.toISOString() !== new Date(next.meetingAt).toISOString()) lines.push(`Data: ${fmtDateTimeBR(cur.meetingAt)} → ${fmtDateTimeBR(next.meetingAt)}`);
  if (cur.votingEndsAt.toISOString() !== new Date(next.votingEndsAt).toISOString()) lines.push(`Fim da votação: ${fmtDateTimeBR(cur.votingEndsAt)} → ${fmtDateTimeBR(next.votingEndsAt)}`);
  if (cur.description !== next.description) lines.push("Edital / observações alterados");
  if (cur.showPartial !== next.showPartial) lines.push(next.showPartial ? "Passa a mostrar o resultado parcial" : "Deixa de mostrar o resultado parcial");
  let resetItems = 0;
  if (cur.status !== "closed") {
    const kept = new Set(next.items.map((i) => i.id).filter(Boolean));
    for (const it of cur.items.filter((i) => !kept.has(i.id))) {
      lines.push(`Item removido: “${it.title}”${it.votes.length ? ` (${votos(it.votes.length)} descartado${it.votes.length === 1 ? "" : "s"})` : ""}`);
      if (it.votes.length) resetItems++;
    }
    for (const it of next.items) {
      const old = it.id ? cur.items.find((c) => c.id === it.id) : undefined;
      if (!old) lines.push(`Item novo: “${it.title}”`);
      else if (!sameItem(it, old)) {
        lines.push(`Item alterado: “${old.title}”${old.votes.length ? ` (${votos(old.votes.length)} zerado${old.votes.length === 1 ? "" : "s"})` : ""}`);
        if (old.votes.length) resetItems++;
      }
    }
    const order = (l: (string | null)[]) => l.filter(Boolean).join(",");
    if (order(next.items.map((i) => i.id).filter((id) => cur.items.some((c) => c.id === id))) !== order(cur.items.map((c) => c.id).filter((id) => next.items.some((n) => n.id === id))))
      lines.push("Ordem dos itens alterada");
  }
  return { lines, resetItems };
}

/** Aplica a edição aprovada. Itens alterados (texto ou opções) perdem os votos; os iguais mantêm. Devolve os itens zerados. */
export async function applyAssemblyEdit(id: string, next: ProposedAssembly) {
  const cur = await db.assembly.findUnique({ where: { id }, include: { items: { include: { _count: { select: { votes: true } } } } } });
  if (!cur) return null;
  const closed = cur.status === "closed";
  const reset: string[] = [];
  await db.$transaction(async (tx) => {
    await tx.assembly.update({
      where: { id },
      data: { title: next.title, kind: next.kind, description: next.description, location: next.location, meetingAt: new Date(next.meetingAt), votingEndsAt: closed ? cur.votingEndsAt : new Date(next.votingEndsAt), showPartial: next.showPartial },
    });
    if (closed) return;
    const kept = new Set(next.items.map((i) => i.id).filter((x): x is string => !!x));
    for (const it of cur.items) if (!kept.has(it.id)) await tx.assemblyItem.delete({ where: { id: it.id } });
    for (const [position, it] of next.items.entries()) {
      const old = it.id ? cur.items.find((c) => c.id === it.id) : undefined;
      const data = { position, title: it.title, description: it.description, options: JSON.stringify(it.options) };
      if (!old) {
        await tx.assemblyItem.create({ data: { ...data, assemblyId: id } });
        continue;
      }
      if (!sameItem(it, old)) {
        await tx.assemblyVote.deleteMany({ where: { itemId: old.id } });
        if (old._count.votes) reset.push(it.title);
      }
      await tx.assemblyItem.update({ where: { id: old.id }, data });
    }
  });
  return { reset, status: cur.status, condominiumId: cur.condominiumId };
}
