import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

// LGPD (art. 18): cópia dos dados pessoais da própria pessoa, em JSON. Sem senhas nem segredos de segurança.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.impersonator) return NextResponse.json({ error: "Indisponível em modo de visualização." }, { status: 403 });
  const id = me.id;
  const [user, memberships, units, requested, executed, comments, votes, checks, notes, notifications, devices, passkeys, logins] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: { name: true, email: true, phone: true, cpf: true, role: true, status: true, company: true, specialty: true, createdAt: true, lastLoginAt: true, termsAcceptedAt: true, termsVersion: true, totpEnabledAt: true },
    }),
    db.membership.findMany({ where: { userId: id }, select: { role: true, createdAt: true, condominium: { select: { name: true } } } }),
    db.userUnit.findMany({ where: { userId: id }, select: { role: true, unit: { select: { number: true, building: { select: { name: true } } } } } }),
    db.serviceOrder.findMany({ where: { requestedById: id }, select: { protocol: true, title: true, status: true, createdAt: true, rating: true, ratingComment: true } }),
    db.serviceOrder.findMany({ where: { assignedToId: id }, select: { protocol: true, title: true, status: true, completedAt: true, serviceReport: true } }),
    db.serviceEvent.findMany({ where: { userId: id, type: "comment" }, select: { comment: true, createdAt: true, serviceOrder: { select: { protocol: true } } } }),
    db.assemblyVote.findMany({ where: { userId: id }, select: { option: true, createdAt: true, item: { select: { title: true, options: true } }, assembly: { select: { title: true } } } }),
    db.checklistCheck.findMany({ where: { userId: id }, select: { date: true, status: true, note: true, item: { select: { title: true } } } }),
    db.checklistNote.findMany({ where: { userId: id }, select: { date: true, text: true } }),
    db.notification.findMany({ where: { userId: id }, select: { title: true, message: true, createdAt: true, read: true } }),
    db.pushDevice.findMany({ where: { userId: id }, select: { name: true, createdAt: true, lastUsedAt: true } }),
    db.passkey.findMany({ where: { userId: id }, select: { name: true, createdAt: true, lastUsedAt: true } }),
    db.auditLog.findMany({ where: { userId: id, action: { in: ["login", "login_failed", "logout"] } }, select: { action: true, ipAddress: true, userAgent: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  await audit(me, "privacy_export", "user", id);
  const body = {
    geradoEm: new Date().toISOString(),
    aviso: "Cópia dos seus dados pessoais no Condtrack (LGPD, art. 18). Dados de outras pessoas e segredos de segurança não entram.",
    conta: user,
    condominios: memberships.map((m) => ({ condominio: m.condominium.name, perfil: m.role, desde: m.createdAt })),
    unidades: units.map((u) => ({ unidade: `${u.unit.building.name} · ${u.unit.number}`, vinculo: u.role })),
    ordensAbertasPorVoce: requested,
    ordensExecutadasPorVoce: executed,
    comentarios: comments.map((c) => ({ os: c.serviceOrder.protocol, comentario: c.comment, em: c.createdAt })),
    votos: votes.map((v) => ({ assembleia: v.assembly.title, item: v.item.title, voto: (JSON.parse(v.item.options) as string[])[v.option] ?? v.option, em: v.createdAt })),
    checklist: checks.map((c) => ({ dia: c.date, item: c.item.title, situacao: c.status, observacao: c.note })),
    anotacoes: notes,
    notificacoes: notifications,
    aparelhosComNotificacao: devices,
    biometria: passkeys,
    acessos: logins,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="condtrack-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
