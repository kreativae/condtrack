import { describe, expect, it } from "vitest";
import { condoState, entryBlockReason } from "../entry-access";

describe("entryBlockReason", () => {
  it("superadmin entra sem condomínio", () => {
    expect(entryBlockReason({ role: "superadmin", activeCondo: null, links: [] })).toBeNull();
  });

  it("síndico com condomínio liberado entra", () => {
    expect(entryBlockReason({ role: "syndic", activeCondo: "ok", links: [] })).toBeNull();
  });

  it("vínculo ativo arquivado, mas outro vínculo liberado: entra (passa para o outro)", () => {
    expect(entryBlockReason({ role: "syndic", activeCondo: "archived", links: ["archived", "ok"] })).toBeNull();
  });

  it("síndico sem nenhum condomínio não entra e recebe a explicação", () => {
    expect(entryBlockReason({ role: "syndic", activeCondo: null, links: [] })).toMatch(/não está vinculada/);
  });

  it("só condomínios arquivados: não entra", () => {
    expect(entryBlockReason({ role: "resident", activeCondo: "archived", links: ["archived"] })).toMatch(/não está mais na plataforma/);
    expect(entryBlockReason({ role: "provider", activeCondo: null, links: ["archived", "archived"] })).toMatch(/não está mais na plataforma/);
  });

  it("demonstração com o prazo vencido: não entra e a mensagem fala do teste", () => {
    expect(entryBlockReason({ role: "syndic", activeCondo: "expired", links: ["expired"] })).toMatch(/período de teste/);
  });

  it("conta real com outro condomínio liberado continua entrando depois do fim do teste", () => {
    expect(entryBlockReason({ role: "syndic", activeCondo: "expired", links: ["expired", "ok"] })).toBeNull();
  });
});

describe("condoState", () => {
  const now = Date.UTC(2026, 9, 26, 12);
  it("arquivado vem antes do prazo", () => {
    expect(condoState({ deletedAt: new Date(now - 1), demoExpiresAt: new Date(now + 1) }, now)).toBe("archived");
  });
  it("prazo vencido (inclusive no instante exato) = expired; sem prazo ou no prazo = ok", () => {
    expect(condoState({ deletedAt: null, demoExpiresAt: new Date(now) }, now)).toBe("expired");
    expect(condoState({ deletedAt: null, demoExpiresAt: new Date(now + 1000) }, now)).toBe("ok");
    expect(condoState({ deletedAt: null, demoExpiresAt: null }, now)).toBe("ok");
  });
});
