import { describe, expect, it } from "vitest";
import { DEFAULT_LEGAL_TEXTS, cleanMessages, cleanSections, fillVars } from "../legal-texts";

describe("textos da LGPD", () => {
  it("preenche as variáveis conhecidas e mantém as desconhecidas", () => {
    expect(fillVars("{empresa}, CNPJ {cnpj} {outra}", { empresa: "ACME", cnpj: "1" })).toBe("ACME, CNPJ 1 {outra}");
  });

  it("os padrões só usam variáveis previstas", () => {
    const all = JSON.stringify(DEFAULT_LEGAL_TEXTS);
    const used = new Set([...all.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    for (const v of used) expect(["empresa", "cnpj", "endereco", "encarregado", "email_encarregado", "foro", "nome", "data"]).toContain(v);
  });

  it("limpa seções: descarta vazias e textos que não são string", () => {
    expect(cleanSections([{ title: " A ", body: ["x", "", 3] }, { title: "", body: [] }])).toEqual([{ title: "A", body: ["x"] }]);
    expect(cleanSections("nada")).toBeNull();
    expect(cleanSections([null])).toBeNull();
  });

  it("aceita só as chaves de mensagem conhecidas", () => {
    expect(cleanMessages({ acceptTitleNew: " Oi ", hack: "x", deletionDone: 1 })).toEqual({ acceptTitleNew: "Oi" });
  });
});
