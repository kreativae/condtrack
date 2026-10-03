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
