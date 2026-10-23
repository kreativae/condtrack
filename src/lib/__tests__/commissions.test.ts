import { describe, expect, it } from "vitest";
import { DEFAULT_COMMISSION_SETTINGS, commissionFor, monthsBetween, normalizeCode, parseCommissionSettings, releasedStatus, ruleFor, ruleLabel, suggestCode } from "../commissions";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const seller = DEFAULT_COMMISSION_SETTINGS.rules.seller;

describe("comissões de parceiros", () => {
  it("meses completos contam o dia do mês", () => {
    expect(monthsBetween(d("2026-01-10"), d("2026-02-09"))).toBe(0);
    expect(monthsBetween(d("2026-01-10"), d("2026-02-10"))).toBe(1);
    expect(monthsBetween(d("2026-01-10"), d("2027-01-10"))).toBe(12);
  });

  it("vendedor: 20% nos primeiros 12 meses e 5% depois", () => {
    expect(commissionFor(48000, d("2026-01-10"), d("2026-01-10"), seller, 0)).toEqual({ phase: "first", pct: 20, baseCents: 48000, amountCents: 9600 });
    expect(commissionFor(48000, d("2026-12-10"), d("2026-01-10"), seller, 0)?.pct).toBe(20);
    expect(commissionFor(48000, d("2027-01-10"), d("2026-01-10"), seller, 0)).toEqual({ phase: "after", pct: 5, baseCents: 48000, amountCents: 2400 });
  });

  it("indicador: nada depois dos 12 meses; administradora: sem prazo", () => {
    const r = DEFAULT_COMMISSION_SETTINGS.rules;
    expect(commissionFor(48000, d("2027-02-10"), d("2026-01-10"), r.referrer, 0)).toBeNull();
    expect(commissionFor(48000, d("2030-02-10"), d("2026-01-10"), r.agency, 0)?.amountCents).toBe(9600);
  });

  it("desconto de impostos e taxas sai da base antes da %", () => {
    expect(commissionFor(10000, d("2026-01-10"), d("2026-01-10"), seller, 10)).toEqual({ phase: "first", pct: 20, baseCents: 9000, amountCents: 1800 });
    expect(commissionFor(0, d("2026-01-10"), d("2026-01-10"), seller, 0)).toBeNull();
  });

  it("carência: a pagar só a partir do 2º pagamento", () => {
    expect(releasedStatus(1, 2)).toBe("pending");
    expect(releasedStatus(2, 2)).toBe("due");
    expect(releasedStatus(1, 0)).toBe("due");
  });

  it("regra própria do parceiro tem prioridade sobre a do tipo", () => {
    const s = DEFAULT_COMMISSION_SETTINGS;
    expect(ruleFor({ kind: "seller", firstPct: null, firstMonths: null, afterPct: null }, s)).toEqual({ ...seller, custom: false });
    expect(ruleFor({ kind: "seller", firstPct: 25, firstMonths: null, afterPct: null }, s)).toEqual({ pct: 25, months: 12, afterPct: 5, custom: true });
    expect(ruleFor({ kind: "xyz", firstPct: null, firstMonths: null, afterPct: null }, s).pct).toBe(20);
    expect(ruleLabel(seller)).toBe("20% por 12 meses e 5% depois");
    expect(ruleLabel(s.rules.agency)).toBe("20% enquanto o condomínio pagar");
  });

  it("Setting salvo: valores fora do lugar voltam ao padrão", () => {
    expect(parseCommissionSettings(null)).toEqual(DEFAULT_COMMISSION_SETTINGS);
    expect(parseCommissionSettings("quebrado")).toEqual(DEFAULT_COMMISSION_SETTINGS);
    const s = parseCommissionSettings('{"rules":{"seller":{"pct":30,"months":-1}},"holdPayments":1,"deductPct":150}');
    expect(s.rules.seller).toEqual({ pct: 30, months: 12, afterPct: 5 });
    expect(s.holdPayments).toBe(1);
    expect(s.deductPct).toBe(0);
  });

  it("código do parceiro: maiúsculas e números, 4 a 16 caracteres", () => {
    expect(normalizeCode(" joão-27 ")).toBe("JOAO27");
    expect(normalizeCode("ab")).toBeNull();
    expect(suggestCode("Maria Souza", () => 0.5)).toBe("MARIA55");
    expect(suggestCode("Li", () => 0)).toBe("LIXX10");
  });
});
