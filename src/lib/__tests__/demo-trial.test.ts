import { describe, expect, it } from "vitest";
import { DEMO_TRIAL_DEFAULT_DAYS, inviteAccountLines, parseTrialDays, trialEnd, trialLabel, trialStatus, whatsappNumber } from "../demo-trial";

const DAY = 86400_000;
const now = Date.UTC(2026, 9, 26, 12);

describe("parseTrialDays", () => {
  it("vazio = padrão; aceita '15' e '15 dias'", () => {
    expect(parseTrialDays("")).toEqual({ days: DEMO_TRIAL_DEFAULT_DAYS });
    expect(parseTrialDays("15")).toEqual({ days: 15 });
    expect(parseTrialDays("15 dias")).toEqual({ days: 15 });
    expect(parseTrialDays("1 dia")).toEqual({ days: 1 });
  });
  it("fora de 1–90 ou quebrado = erro", () => {
    for (const v of ["0", "91", "2.5", "abc", "-3"]) expect(parseTrialDays(v).error).toBeTruthy();
  });
});

describe("trialEnd", () => {
  it("conta a partir de agora", () => {
    expect(trialEnd(7, now).getTime()).toBe(now + 7 * DAY);
  });
  it("prorrogar soma ao fim atual quando ainda não venceu", () => {
    expect(trialEnd(7, now, new Date(now + 2 * DAY)).getTime()).toBe(now + 9 * DAY);
  });
  it("prorrogar depois de vencido conta de agora", () => {
    expect(trialEnd(7, now, new Date(now - 3 * DAY)).getTime()).toBe(now + 7 * DAY);
  });
});

describe("trialStatus e trialLabel", () => {
  it("sem prazo", () => {
    expect(trialStatus(null, now)).toEqual({ kind: "none" });
    expect(trialLabel(null, now)).toBeNull();
  });
  it("dias restantes arredondados para cima", () => {
    expect(trialStatus(new Date(now + 1.2 * DAY), now)).toEqual({ kind: "active", daysLeft: 2 });
    expect(trialLabel(new Date(now + 0.5 * DAY), now)).toBe("Termina em 1 dia");
    expect(trialLabel(new Date(now + 5 * DAY), now)).toBe("Termina em 5 dias");
  });
  it("vencido", () => {
    expect(trialStatus(new Date(now), now)).toEqual({ kind: "expired" });
    expect(trialLabel(new Date(now - DAY), now)).toBe("Teste encerrado");
  });
});

describe("whatsappNumber", () => {
  it("põe o 55 em número brasileiro e ignora o que não é telefone", () => {
    expect(whatsappNumber("(11) 98422-1180")).toBe("5511984221180");
    expect(whatsappNumber("+55 11 98422-1180")).toBe("5511984221180");
    expect(whatsappNumber("123")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
});

describe("inviteAccountLines", () => {
  const labels = { syndic: "Síndico", caretaker: "Zelador", resident: "Morador", provider: "Prestador" };
  const test = (e: string) => e.endsWith("@condtrack.app");
  it("ordena pelos perfis, tira contas reais e repetidas", () => {
    expect(
      inviteAccountLines(
        [
          { role: "provider", email: "prestador3@condtrack.app" },
          { role: "syndic", email: "sindico3@condtrack.app" },
          { role: "resident", email: "fulano@gmail.com" },
          { role: "caretaker", email: "zelador3@condtrack.app" },
          { role: "provider", email: "zelador3@condtrack.app" },
        ],
        labels,
        test,
      ),
    ).toEqual(["Síndico: sindico3@condtrack.app", "Zelador: zelador3@condtrack.app", "Prestador: prestador3@condtrack.app"]);
  });
});
