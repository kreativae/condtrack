import { describe, expect, it } from "vitest";
import { fmtBRL, parseBRL } from "@/lib/finance";
import { advance, daysBetween, planStatus } from "@/lib/maintenance";
import { fromLocalInput, optionsFromText, parseOptions, tally, toLocalInput, DEFAULT_OPTIONS } from "@/lib/assembly";
import { base32Decode, base32Encode, consumeRecoveryCode, currentStep, hotp, newRecoveryCodes, verifyTotp } from "@/lib/totp";
import { elapsedMonths } from "@/lib/budget";
import { fakeCnpj, rng } from "@/lib/demo-data";

describe("financeiro: valores", () => {
  it.each([
    ["1.234,56", 123456], ["1234.56", 123456], ["1234", 123400], ["120.000", 12000000], ["1.234.567", 123456700],
    ["R$ 2.000,00", 200000], ["0,99", 99], ["abc", null], ["1.2345", null],
  ])("parseBRL(%s) = %s", (input, cents) => expect(parseBRL(input)).toBe(cents));

  it("valor negativo usa o sinal de menos que não quebra linha", () => expect(fmtBRL(-1550)).toContain("−"));
});

describe("orçamento: meses corridos", () => {
  it("ano passado conta 12, ano futuro 0, ano atual até o mês", () => {
    expect(elapsedMonths(2025, "2026-10-03")).toBe(12);
    expect(elapsedMonths(2027, "2026-10-03")).toBe(0);
    expect(elapsedMonths(2026, "2026-10-03")).toBe(10);
  });
});

describe("manutenção preventiva: datas", () => {
  it.each([
    ["2026-01-31", 1, "month", "2026-02-28"], ["2028-01-31", 1, "month", "2028-02-29"], ["2026-10-15", 6, "month", "2027-04-15"],
    ["2026-12-28", 1, "week", "2027-01-04"], ["2028-02-29", 1, "year", "2029-02-28"],
  ])("advance(%s, %i %s) = %s", (d, n, u, out) => expect(advance(d, n as number, u as string)).toBe(out));

  it("situação do documento", () => {
    expect(daysBetween("2026-10-03", "2026-09-30")).toBe(-3);
    expect(planStatus({ kind: "document", nextDue: "2026-10-20", leadDays: 30, active: true }, "2026-10-03").label).toBe("Vence em 17 dias");
    expect(planStatus({ kind: "document", nextDue: "2026-09-30", leadDays: 30, active: true }, "2026-10-03").tone).toBe("bad");
    expect(planStatus({ kind: "service", nextDue: "2026-12-01", leadDays: 7, active: false }, "2026-10-03").label).toBe("Pausado");
  });
});

describe("assembleias: apuração", () => {
  const v = (...o: number[]) => o.map((option) => ({ option }));
  it("vitória, empate e abstenção que não vence", () => {
    expect(tally(DEFAULT_OPTIONS, v(0, 0, 1)).winner).toBe(0);
    expect(tally(DEFAULT_OPTIONS, v(0, 1)).winner).toBeNull();
    expect(tally(DEFAULT_OPTIONS, v(2, 2, 2, 0)).winner).toBe(0);
    expect(tally(DEFAULT_OPTIONS, v(2, 2)).winner).toBeNull();
    expect(tally(DEFAULT_OPTIONS, []).winner).toBeNull();
  });
  it("opções da pauta", () => {
    expect(optionsFromText("")).toEqual(DEFAULT_OPTIONS);
    expect(optionsFromText("Sim\nNão\nSim")).toEqual(["Sim", "Não"]);
    expect(optionsFromText("Só uma")).toBeNull();
    expect(parseOptions("lixo")).toEqual(DEFAULT_OPTIONS);
  });
  it("data e hora no fuso de Brasília", () => {
    expect(toLocalInput(fromLocalInput("2026-10-12T19:30")!)).toBe("2026-10-12T19:30");
    expect(fromLocalInput("2026-10-12")).toBeNull();
  });
});

describe("duas etapas (TOTP)", () => {
  const key = Buffer.from("12345678901234567890");
  it.each([[59, "94287082"], [1111111109, "07081804"], [1234567890, "89005924"], [2000000000, "69279037"]])("vetor RFC 6238 em t=%i", (t, code) => {
    expect(hotp(key, Math.floor((t as number) / 30), 8)).toBe(code);
  });
  it("base32 ida e volta", () => expect(base32Decode(base32Encode(key)).equals(key)).toBe(true));
  it("aceita o código atual e não aceita o mesmo duas vezes", () => {
    const secret = base32Encode(key);
    const now = Date.now();
    const step = verifyTotp(secret, hotp(key, currentStep(now)), null, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, hotp(key, currentStep(now)), step, now)).toBeNull();
  });
  it("código de recuperação vale uma vez", () => {
    const r = newRecoveryCodes();
    const left = consumeRecoveryCode(r.stored, r.codes[0].toUpperCase());
    expect(left?.split(",")).toHaveLength(9);
    expect(consumeRecoveryCode(left!, r.codes[0])).toBeNull();
  });
});

describe("demonstração", () => {
  it("mesma semente repete o sorteio", () => expect(rng(42).int(0, 1e9)).toBe(rng(42).int(0, 1e9)));
  it("CNPJ fictício com dígitos verificadores válidos", () => {
    const valid = (c: string) => {
      const n = c.replace(/\D/g, "").split("").map(Number);
      const dv = (nums: number[], w: number[]) => { const s = nums.reduce((a, x, i) => a + x * w[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
      return dv(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n[12] && dv(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n[13];
    };
    const r = rng(7);
    for (let i = 0; i < 50; i++) expect(valid(fakeCnpj(r))).toBe(true);
  });
});
