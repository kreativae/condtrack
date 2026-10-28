"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { verifyTurnstile } from "@/lib/turnstile";
import { REQUEST_LIMITS, isRequestStatus, parseDemoRequest, profileLabel, type DemoRequestErrors } from "@/lib/demo-request";

export type DemoRequestState = { ok?: boolean; error?: string; errors?: DemoRequestErrors; values?: Record<string, string> } | null;

const FIELDS = ["name", "email", "phone", "condoName", "units", "profile", "message"] as const;

/**
 * Formulário "Agende sua demonstração" da página inicial (aberto, sem login). Grava o pedido em Interessados e avisa
 * os superadmins. O campo escondido `website` pega robôs; acima do limite por IP ou e-mail a resposta é a mesma de
 * sucesso, sem gravar (não ensina o robô a contornar).
 */
export async function requestDemo(_prev: DemoRequestState, form: FormData): Promise<DemoRequestState> {
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? "")]));
  if (String(form.get("website") ?? "")) return { ok: true };
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? "")))) return { error: "Confirme que você não é um robô e tente de novo.", values };

  const parsed = parseDemoRequest(values);
  if ("errors" in parsed) return { errors: parsed.errors, values };
  const d = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const [byIp, byEmail] = await Promise.all([
    ip ? db.demoRequest.count({ where: { ipAddress: ip, createdAt: { gte: new Date(Date.now() - 3600_000) } } }) : 0,
    db.demoRequest.count({ where: { email: d.email, createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);
  if (byIp >= REQUEST_LIMITS.perIpPerHour || byEmail >= REQUEST_LIMITS.perEmailPerDay) return { ok: true };

  const row = await db.demoRequest.create({ data: { ...d, ipAddress: ip } });
  const admins = await db.user.findMany({ where: { role: "superadmin", status: "active" }, select: { id: true } });
  // Sem condomínio: o aviso vai direto para os superadmins
  await notify(
    { condominiumId: "", userIds: admins.map((a) => a.id) },
    {
      type: "demo_request",
      vars: { nome: d.name, perfil: profileLabel(d.profile), predio: d.condoName, unidades: d.units ? `, ${d.units} unidades` : "", contato: `${d.phone} · ${d.email}` },
      referenceType: "demo_request",
      referenceId: row.id,
    },
  );
  await audit(null, "demo_request", "demo_request", row.id, { new: { nome: d.name, email: d.email, condominio: d.condoName }, condominiumId: null });
  revalidatePath("/admin/interessados");
  return { ok: true };
}

/** Superadmin: muda a situação do pedido e guarda a anotação interna. */
export async function updateDemoRequest(id: string, form: FormData) {
  const me = await requireUser("superadmin");
  const status = String(form.get("status") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 2000) || null;
  const old = await db.demoRequest.findUnique({ where: { id }, select: { status: true, note: true } });
  if (!old || !isRequestStatus(status)) return;
  await db.demoRequest.update({ where: { id }, data: { status, note } });
  await audit(me, "update", "demo_request", id, { old, new: { status, note }, condominiumId: null });
  revalidatePath("/admin/interessados");
}
