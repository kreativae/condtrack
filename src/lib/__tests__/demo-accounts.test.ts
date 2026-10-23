import { describe, expect, it } from "vitest";
import { normalizeDemoAccounts, parseDemoAccounts } from "../demo-accounts";

describe("contas reais na demonstração", () => {
  it("limpa os e-mails e ignora os perfis em branco", () => {
    const r = normalizeDemoAccounts({ syndic: " Sindico@Condtrack.app ", caretaker: "", resident: "morador@condtrack.app" });
    expect(r.error).toBeUndefined();
    expect(r.accounts).toEqual({ syndic: "sindico@condtrack.app", resident: "morador@condtrack.app" });
  });

  it("exige o síndico, recusa e-mail inválido e a mesma conta em dois perfis", () => {
    expect(normalizeDemoAccounts({ caretaker: "zelador@condtrack.app" }).error).toMatch(/síndico/);
    expect(normalizeDemoAccounts({ syndic: "sindico@condtrack.app", doorman: "porteiro" }).error).toMatch(/Porteiro/);
    expect(normalizeDemoAccounts({ syndic: "a@b.co", council: "A@b.co" }).error).toMatch(/um[a]? conta por perfil/);
  });

  it("o Setting salvo só devolve e-mails dos perfis conhecidos", () => {
    expect(parseDemoAccounts('{"syndic":"s@x.co","caretaker":"nada","outro":"o@x.co"}')).toEqual({ syndic: "s@x.co" });
    expect(parseDemoAccounts("quebrado")).toEqual({});
    expect(parseDemoAccounts(null)).toEqual({});
  });
});
