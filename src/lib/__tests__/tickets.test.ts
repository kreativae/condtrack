import { describe, expect, it } from "vitest";
import { ageLabel, avgResponseLabel, canManageTickets, canOpenTicket, canTicket, canViewTicket, responseHours, statusAfterReply, ticketKind, ticketStatus } from "../tickets";

const author = { id: "m1", role: "resident" as const };
const other = { id: "m2", role: "resident" as const };
const syndic = { id: "s1", role: "syndic" as const };
const t = (status: string, closedAt: Date | null = null) => ({ status, createdById: "m1", closedAt });

describe("chamados", () => {
  it("morador e conselho abrem; síndico e superadmin atendem", () => {
    expect(canOpenTicket("resident")).toBe(true);
    expect(canOpenTicket("council")).toBe(true);
    expect(canOpenTicket("syndic")).toBe(false);
    expect(canManageTickets("syndic")).toBe(true);
    expect(canManageTickets("superadmin")).toBe(true);
    expect(canManageTickets("caretaker")).toBe(false);
    expect(canManageTickets("council")).toBe(false);
  });

  it("quem abriu vê só os próprios; o síndico vê os do condomínio dele; o superadmin, os do condomínio em foco", () => {
    const tk = { createdById: "m1", condominiumId: "c1" };
    expect(canViewTicket(tk, { ...author, condominiumId: "c1" })).toBe(true);
    expect(canViewTicket(tk, { ...other, condominiumId: "c1" })).toBe(false);
    expect(canViewTicket(tk, { id: "x", role: "council", condominiumId: "c1" })).toBe(false);
    expect(canViewTicket(tk, { ...syndic, condominiumId: "c1" })).toBe(true);
    expect(canViewTicket(tk, { ...syndic, condominiumId: "c2" })).toBe(false);
    expect(canViewTicket(tk, { id: "a", role: "superadmin", condominiumId: null }, "c1")).toBe(true);
    expect(canViewTicket(tk, { id: "a", role: "superadmin", condominiumId: null }, "c2")).toBe(false);
    expect(canViewTicket({ createdById: null, condominiumId: "c1" }, { ...author, condominiumId: "c1" })).toBe(false);
  });

  it("conversa: quem abriu e quem atende, até encerrar", () => {
    expect(canTicket("reply", t("open"), author)).toBe(true);
    expect(canTicket("reply", t("converted"), syndic)).toBe(true);
    expect(canTicket("reply", t("open"), other)).toBe(false);
    expect(canTicket("reply", t("resolved"), author)).toBe(false);
    expect(canTicket("reply", t("closed"), syndic)).toBe(false);
  });

  it("virar OS: só quem atende, com o chamado aberto ou em análise", () => {
    expect(canTicket("convert", t("open"), syndic)).toBe(true);
    expect(canTicket("convert", t("in_review"), syndic)).toBe(true);
    expect(canTicket("convert", t("converted"), syndic)).toBe(false);
    expect(canTicket("convert", t("resolved"), syndic)).toBe(false);
    expect(canTicket("convert", t("open"), author)).toBe(false);
  });

  it("resolver e encerrar: quem atende, enquanto não terminou (inclusive depois de virar OS)", () => {
    for (const a of ["resolve", "close"] as const) {
      expect(canTicket(a, t("open"), syndic)).toBe(true);
      expect(canTicket(a, t("converted"), syndic)).toBe(true);
      expect(canTicket(a, t("resolved"), syndic)).toBe(false);
      expect(canTicket(a, t("open"), author)).toBe(false);
    }
    expect(canTicket("review", t("open"), syndic)).toBe(true);
    expect(canTicket("review", t("in_review"), syndic)).toBe(false);
  });

  it("quem abriu cancela só enquanto ninguém tratou; reabre até 30 dias depois de encerrado", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    expect(canTicket("cancel", t("open"), author)).toBe(true);
    expect(canTicket("cancel", t("in_review"), author)).toBe(false);
    expect(canTicket("cancel", t("open"), other)).toBe(false);
    expect(canTicket("reopen", t("resolved", new Date("2026-10-20T12:00:00Z")), author, now)).toBe(true);
    expect(canTicket("reopen", t("closed", new Date("2026-09-01T12:00:00Z")), author, now)).toBe(false);
    expect(canTicket("reopen", t("resolved", new Date("2026-10-20T12:00:00Z")), syndic, now)).toBe(false);
    expect(canTicket("reopen", t("in_review"), author, now)).toBe(false);
  });

  it("resposta do síndico põe o chamado aberto em análise; a do morador não muda nada", () => {
    expect(statusAfterReply("open", true)).toBe("in_review");
    expect(statusAfterReply("open", false)).toBe("open");
    expect(statusAfterReply("converted", true)).toBe("converted");
  });

  it("tempo de resposta e idade", () => {
    const c = new Date("2026-10-01T10:00:00Z");
    expect(responseHours({ createdAt: c, answeredAt: null })).toBeNull();
    expect(responseHours({ createdAt: c, answeredAt: new Date("2026-10-01T13:00:00Z") })).toBe(3);
    expect(avgResponseLabel([])).toBe("—");
    expect(avgResponseLabel([{ createdAt: c, answeredAt: new Date("2026-10-01T12:00:00Z") }, { createdAt: c, answeredAt: new Date("2026-10-01T14:00:00Z") }])).toBe("3 h");
    expect(avgResponseLabel([{ createdAt: c, answeredAt: new Date("2026-10-05T10:00:00Z") }])).toBe("4 dias");
    expect(ageLabel(c, new Date("2026-10-01T10:30:00Z"))).toBe("agora há pouco");
    expect(ageLabel(c, new Date("2026-10-01T15:00:00Z"))).toBe("há 5 h");
    expect(ageLabel(c, new Date("2026-10-02T11:00:00Z"))).toBe("há 1 dia");
  });

  it("tipo e situação desconhecidos caem no padrão", () => {
    expect(ticketKind("xyz").short).toBe("Outro");
    expect(ticketStatus("xyz").label).toBe("Aberto");
  });
});
