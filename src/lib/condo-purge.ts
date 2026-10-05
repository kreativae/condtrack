import "server-only";
import { db } from "./db";
import { deleteFile, deleteFolder, readStored } from "./storage";
import { zip, type ZipEntry } from "./zip";

// Exclusão definitiva de um condomínio arquivado. Antes, o superadmin baixa o backup completo
// (JSON com todos os dados + notas fiscais/boletos/comprovantes); a exclusão exige um backup recente.

export const BACKUP_VALID_HOURS = 24;
const USER_SELECT = { id: true, name: true, email: true, phone: true, cpf: true, role: true, status: true, company: true, specialty: true, createdAt: true, lastLoginAt: true } as const;

/** Todos os dados do condomínio, sem senhas nem segredos. */
export async function condoBackupData(id: string) {
  const where = { condominiumId: id };
  const [condominium, buildings, memberships, categories, commonAreas, serviceOrders, announcements, assemblies, financeEntries, financeBudgets, maintenancePlans, checklistItems, checklistNotes, subscription, payments, auditLogs] = await Promise.all([
    db.condominium.findUnique({ where: { id } }),
    db.building.findMany({ where, include: { units: { include: { residents: true } } } }),
    db.membership.findMany({ where, include: { user: { select: USER_SELECT } } }),
    db.serviceCategory.findMany({ where }),
    db.commonArea.findMany({ where }),
    db.serviceOrder.findMany({ where, include: { media: true, events: true } }),
    db.announcement.findMany({ where }),
    db.assembly.findMany({ where, include: { items: true, votes: true } }),
    db.financeEntry.findMany({ where, include: { attachments: true, logs: true } }),
    db.financeBudget.findMany({ where }),
    db.maintenancePlan.findMany({ where }),
    db.checklistItem.findMany({ where, include: { checks: true } }),
    db.checklistNote.findMany({ where }),
    db.subscription.findUnique({ where }),
    db.payment.findMany({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "asc" } }),
  ]);
  return { condominium, buildings, memberships, categories, commonAreas, serviceOrders, announcements, assemblies, financeEntries, financeBudgets, maintenancePlans, checklistItems, checklistNotes, subscription, payments, auditLogs };
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 120);

async function readAll(url: string) {
  const parts = url.replace(/^\/api\/media\//, "").split("/");
  const f = await readStored(parts);
  if (!f) return null;
  if (f.body instanceof Uint8Array) return f.body;
  return new Uint8Array(await new Response(f.body).arrayBuffer());
}

/** .zip com dados.json e os anexos do Financeiro. Fotos e vídeos das OS ficam de fora (só os dados de cada um). */
export async function condoBackupZip(id: string) {
  const data = await condoBackupData(id);
  if (!data.condominium) return null;
  const entries: ZipEntry[] = [];
  const missing: string[] = [];
  for (const e of data.financeEntries) {
    for (const a of e.attachments) {
      const bytes = await readAll(a.url).catch(() => null);
      const name = `financeiro/${e.date.toISOString().slice(0, 10)} ${safeName(e.description).slice(0, 60)} (${a.id.slice(-6)})/${safeName(a.fileName)}`;
      if (bytes) entries.push({ name, data: bytes });
      else missing.push(name);
    }
  }
  const readme = [
    `Backup do condomínio ${data.condominium.name}`,
    `Gerado em ${new Date().toISOString()}`,
    "",
    "dados.json: todos os registros (cadastro, estrutura, pessoas e vínculos, OS com linha do tempo, comunicados,",
    "assembleias com votos, financeiro com histórico, orçamento, manutenção, checklist, assinatura e auditoria).",
    "financeiro/: notas fiscais, boletos e comprovantes de cada lançamento.",
    "Fotos e vídeos das OS não entram no arquivo; os dados de captura de cada mídia estão em dados.json.",
    ...(missing.length ? ["", "Arquivos não encontrados no armazenamento:", ...missing] : []),
  ].join("\n");
  entries.unshift({ name: "LEIA-ME.txt", data: readme }, { name: "dados.json", data: JSON.stringify(data, null, 2) });
  return { name: data.condominium.name, bytes: zip(entries), files: entries.length - 2 };
}

/** Apaga o condomínio e tudo dele, inclusive arquivos e as contas que só tinham vínculo com ele. */
export async function purgeCondominiumData(id: string) {
  const c = await db.condominium.findUnique({ where: { id }, select: { id: true, name: true, logoUrl: true } });
  if (!c) return null;
  const orders = await db.serviceOrder.findMany({ where: { condominiumId: id }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);

  // Contas sem vínculo com outro condomínio (nunca superadmin)
  const only = await db.user.findMany({
    where: { role: { not: "superadmin" }, memberships: { some: { condominiumId: id }, every: { condominiumId: id } } },
    select: { id: true, avatarUrl: true },
  });

  for (const o of orderIds) await deleteFolder(o).catch(() => null);
  await deleteFolder(`fin-${id}`).catch(() => null);
  await deleteFolder(`checklist-${id}`).catch(() => null);
  if (c.logoUrl?.startsWith("/api/media/")) await deleteFile(c.logoUrl).catch(() => null);

  await db.$transaction([
    db.notification.deleteMany({ where: { referenceType: "service_order", referenceId: { in: orderIds } } }),
    db.condominium.delete({ where: { id } }),
  ]);

  // Uma conta presa a registros de fora fica desativada em vez de apagada
  let deleted = 0;
  let deactivated = 0;
  for (const u of only) {
    try {
      await db.user.delete({ where: { id: u.id } });
      if (u.avatarUrl?.startsWith("/api/media/")) await deleteFile(u.avatarUrl).catch(() => null);
      deleted++;
    } catch {
      await db.user.update({ where: { id: u.id }, data: { status: "inactive", condominiumId: null } }).catch(() => null);
      deactivated++;
    }
  }
  return { name: c.name, orders: orderIds.length, deleted, deactivated };
}
