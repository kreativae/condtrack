import { describe, expect, it } from "vitest";
import { averageDays, averageRating, monthOf, periodStart, resolvedIn, workTime } from "../feed";

const at = (s: string) => new Date(s);

describe("feed de serviços", () => {
  it("tempo até a entrega pelo calendário de Brasília", () => {
    expect(resolvedIn(at("2026-10-20T09:00:00-03:00"), at("2026-10-20T18:00:00-03:00"))).toBe("no mesmo dia");
    // 23h de um dia e 1h do seguinte: já é outro dia
    expect(resolvedIn(at("2026-10-20T23:00:00-03:00"), at("2026-10-21T01:00:00-03:00"))).toBe("em 1 dia");
    expect(resolvedIn(at("2026-10-01T10:00:00-03:00"), at("2026-10-13T10:00:00-03:00"))).toBe("em 12 dias");
    expect(resolvedIn(at("2026-10-01T10:00:00-03:00"), null)).toBeNull();
  });

  it("horas de trabalho", () => {
    expect(workTime(45)).toBe("45 min");
    expect(workTime(120)).toBe("2 h");
    expect(workTime(150)).toBe("2h30");
    expect(workTime(0)).toBeNull();
    expect(workTime(null)).toBeNull();
  });

  it("médias de dias e de nota ignoram o que falta", () => {
    expect(averageDays([
      { createdAt: at("2026-10-01T10:00:00Z"), approvedAt: at("2026-10-03T10:00:00Z") },
      { createdAt: at("2026-10-01T10:00:00Z"), approvedAt: at("2026-10-02T10:00:00Z") },
      { createdAt: at("2026-10-01T10:00:00Z"), approvedAt: null },
    ])).toBe(1.5);
    expect(averageDays([])).toBeNull();
    expect(averageRating([{ rating: 5 }, { rating: 4 }, { rating: null }])).toBe(4.5);
    expect(averageRating([{ rating: null }])).toBeNull();
  });

  it("mês de Brasília (a virada do mês às 23h não muda o mês)", () => {
    expect(monthOf(at("2026-10-31T23:30:00-03:00"))).toEqual({ key: "2026-10", label: "Outubro de 2026" });
  });

  it("início do período", () => {
    const now = at("2026-10-23T12:00:00-03:00").getTime();
    expect(periodStart("tudo", now)).toBeNull();
    expect(periodStart("ano", now)?.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(periodStart("30d", now)?.toISOString()).toBe("2026-09-23T15:00:00.000Z");
  });
});
