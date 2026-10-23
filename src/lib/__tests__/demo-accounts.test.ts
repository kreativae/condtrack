import { describe, expect, it } from "vitest";
import { DEMO_DEFAULT_ACCOUNTS, externalDemoAccounts, nextExternalNumber, normalizeDemoAccounts, parseDemoAccounts } from "../demo-accounts";

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

  it("o Setting salvo só vale para os perfis conhecidos; o que faltar vem das contas de teste", () => {
    // Perfil sem e-mail salvo (ou inválido) volta com a conta de teste padrão
    expect(parseDemoAccounts('{"syndic":"s@x.co","caretaker":"nada","outro":"o@x.co"}')).toEqual({ ...DEMO_DEFAULT_ACCOUNTS, syndic: "s@x.co" });
    expect(parseDemoAccounts("quebrado")).toEqual(DEMO_DEFAULT_ACCOUNTS);
    // Nada salvo ainda: as contas de teste padrão (uma por perfil, sem repetir)
    expect(parseDemoAccounts(null)).toEqual(DEMO_DEFAULT_ACCOUNTS);
    expect(normalizeDemoAccounts(DEMO_DEFAULT_ACCOUNTS).error).toBeUndefined();
  });
});

describe("demonstração externa (contas numeradas)", () => {
  it("gera uma série por número, uma conta por perfil", () => {
    const a = externalDemoAccounts(2);
    expect(a).toEqual({
      syndic: "sindico2@condtrack.app",
      caretaker: "zelador2@condtrack.app",
      doorman: "porteiro2@condtrack.app",
      council: "conselho2@condtrack.app",
      resident: "morador2@condtrack.app",
      provider: "prestador2@condtrack.app",
    });
    expect(normalizeDemoAccounts(a).error).toBeUndefined();
  });

  it("o próximo número é o menor sem nenhuma conta da série, ignorando as contas internas e outros domínios", () => {
    expect(nextExternalNumber([])).toBe(1);
    expect(nextExternalNumber(["sindico@condtrack.app", "zelador@condtrack.app", "morador1@outro.com", "sindicox1@condtrack.app"])).toBe(1);
    expect(nextExternalNumber(["sindico1@condtrack.app", "zelador1@condtrack.app", "Prestador2@condtrack.app"])).toBe(3);
    // Já existe uma conta da série 2 (de outro uso): pula a série inteira
    expect(nextExternalNumber(["sindico2@condtrack.app"])).toBe(1);
    expect(nextExternalNumber(["conselho1@condtrack.app", "sindico2@condtrack.app", "morador4@condtrack.app"])).toBe(3);
  });
});
