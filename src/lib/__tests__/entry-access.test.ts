import { describe, expect, it } from "vitest";
import { entryBlockReason } from "../entry-access";

describe("entryBlockReason", () => {
  it("superadmin entra sem condomínio", () => {
    expect(entryBlockReason({ role: "superadmin", activeCondoArchived: null, linksArchived: [] })).toBeNull();
  });

  it("síndico com condomínio ativo entra", () => {
    expect(entryBlockReason({ role: "syndic", activeCondoArchived: false, linksArchived: [] })).toBeNull();
  });

  it("vínculo ativo arquivado, mas outro vínculo ativo: entra (passa para o outro)", () => {
    expect(entryBlockReason({ role: "syndic", activeCondoArchived: true, linksArchived: [true, false] })).toBeNull();
  });

  it("síndico sem nenhum condomínio não entra e recebe a explicação", () => {
    expect(entryBlockReason({ role: "syndic", activeCondoArchived: null, linksArchived: [] })).toMatch(/não está vinculada/);
  });

  it("só condomínios arquivados: não entra", () => {
    expect(entryBlockReason({ role: "resident", activeCondoArchived: true, linksArchived: [true] })).toMatch(/não está mais na plataforma/);
    expect(entryBlockReason({ role: "provider", activeCondoArchived: null, linksArchived: [true, true] })).toMatch(/não está mais na plataforma/);
  });
});
