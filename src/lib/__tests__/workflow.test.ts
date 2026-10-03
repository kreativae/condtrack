import { describe, expect, it } from "vitest";
import { can, canView, type OrderAction } from "@/lib/workflow";
import type { Role } from "@/lib/roles";

// Regras de quem pode fazer o quê em cada etapa da OS (fonte única da UI e das server actions)
const order = (status: string, extra: Partial<{ assignedToId: string | null; requestedById: string | null; rating: number | null; condominiumId: string }> = {}) => ({
  status, condominiumId: "c1", assignedToId: "prov", requestedById: "req", rating: null, ...extra,
});
const user = (role: Role, id = "u", condominiumId: string | null = "c1") => ({ id, role, condominiumId });

describe("fluxo da OS", () => {
  it("só síndico e superadmin atribuem", () => {
    expect(can("assign", order("open"), user("syndic"))).toBe(true);
    expect(can("assign", order("open"), user("superadmin", "sa", null))).toBe(true);
    for (const r of ["caretaker", "provider", "council", "resident"] as Role[]) expect(can("assign", order("open"), user(r))).toBe(false);
  });

  it("só o prestador atribuído inicia, e só depois de atribuída", () => {
    expect(can("start", order("assigned"), user("provider", "prov"))).toBe(true);
    expect(can("start", order("assigned"), user("provider", "outro"))).toBe(false);
    expect(can("start", order("open"), user("provider", "prov"))).toBe(false);
    expect(can("start", order("rejected"), user("provider", "prov"))).toBe(true);
  });

  it("concluir exige estar em andamento", () => {
    expect(can("complete", order("in_progress"), user("provider", "prov"))).toBe(true);
    expect(can("complete", order("assigned"), user("provider", "prov"))).toBe(false);
  });

  it("zelador valida ou devolve só OS concluída", () => {
    expect(can("validate", order("completed"), user("caretaker"))).toBe(true);
    expect(can("return", order("completed"), user("caretaker"))).toBe(true);
    expect(can("validate", order("in_progress"), user("caretaker"))).toBe(false);
    expect(can("validate", order("completed"), user("council"))).toBe(false);
  });

  it("aprovar só com OS validada e só por quem gerencia", () => {
    expect(can("approve", order("validated"), user("syndic"))).toBe(true);
    expect(can("approve", order("completed"), user("syndic"))).toBe(false);
    expect(can("approve", order("validated"), user("caretaker"))).toBe(false);
  });

  it("morador nunca age sobre a OS", () => {
    const actions: OrderAction[] = ["assign", "upload_before", "start", "upload_after", "complete", "validate", "return", "approve", "reject", "cancel"];
    for (const a of actions) for (const s of ["open", "assigned", "in_progress", "completed", "validated"]) expect(can(a, order(s), user("resident"))).toBe(false);
  });

  it("ninguém age em OS de outro condomínio (menos o superadmin)", () => {
    expect(can("approve", order("validated", { condominiumId: "c2" }), user("syndic"))).toBe(false);
    expect(can("approve", order("validated", { condominiumId: "c2" }), user("superadmin", "sa", null))).toBe(true);
  });

  it("quem abriu cancela só enquanto aberta; avalia só a aprovada, uma vez", () => {
    expect(can("cancel", order("open"), user("council", "req"))).toBe(true);
    expect(can("cancel", order("assigned"), user("council", "req"))).toBe(false);
    expect(can("rate", order("approved"), user("council", "req"))).toBe(true);
    expect(can("rate", order("approved", { rating: 5 }), user("council", "req"))).toBe(false);
  });
});

describe("quem vê a OS", () => {
  it("prestador só vê as dele; morador só as aprovadas; conselho as dele e as aprovadas", () => {
    expect(canView(order("assigned"), user("provider", "prov"))).toBe(true);
    expect(canView(order("assigned"), user("provider", "outro"))).toBe(false);
    expect(canView(order("open"), user("resident"))).toBe(false);
    expect(canView(order("approved"), user("resident"))).toBe(true);
    expect(canView(order("open"), user("council", "req"))).toBe(true);
    expect(canView(order("open"), user("council", "outro"))).toBe(false);
  });
});
