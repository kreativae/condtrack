import { describe, expect, it } from "vitest";
import { bookingRange, brt, brtParts, docKey, expectedToday, fitsOpening, grantSchedule, grantStatus, isGate, overlaps, parseGuests } from "../booking";

describe("reservas", () => {
  it("período no fuso de Brasília; fim antes do início vira o dia seguinte", () => {
    const r = bookingRange("2026-10-20", "20:00", "02:00");
    expect(r.startAt.toISOString()).toBe("2026-10-20T23:00:00.000Z");
    expect(r.endAt.toISOString()).toBe("2026-10-21T05:00:00.000Z");
    expect(brtParts(r.startAt)).toEqual({ day: "2026-10-20", hm: "20:00" });
  });

  it("confere o horário de funcionamento da área, inclusive o que vira a noite", () => {
    expect(fitsOpening("10:00", "14:00", "08:00", "22:00")).toBe(true);
    expect(fitsOpening("07:00", "10:00", "08:00", "22:00")).toBe(false);
    expect(fitsOpening("20:00", "23:00", "08:00", "22:00")).toBe(false);
    expect(fitsOpening("20:00", "01:00", "18:00", "02:00")).toBe(true);
    expect(fitsOpening("01:00", "02:00", "18:00", "02:00")).toBe(true);
    expect(fitsOpening("20:00", "03:00", "18:00", "02:00")).toBe(false);
    expect(fitsOpening("03:00", "05:00", null, null)).toBe(true);
  });

  it("sobreposição: encostar não conflita", () => {
    const a = bookingRange("2026-10-20", "14:00", "18:00");
    expect(overlaps(a, bookingRange("2026-10-20", "18:00", "22:00"))).toBe(false);
    expect(overlaps(a, bookingRange("2026-10-20", "17:00", "19:00"))).toBe(true);
    expect(overlaps(a, bookingRange("2026-10-20", "10:00", "23:00"))).toBe(true);
  });

  it("lista de convidados: um por linha, documento opcional, sem repetidos nem numeração", () => {
    expect(parseGuests("1. Ana Souza; 123\n- Bruno Lima\nana souza\n\n x\nCarla | RG 55")).toEqual([
      { name: "Ana Souza", document: "123" },
      { name: "Bruno Lima", document: null },
      { name: "Carla", document: "RG 55" },
    ]);
  });

  it("quem aprova: síndico, zelador, porteiro e superadmin", () => {
    expect(isGate("doorman")).toBe(true);
    expect(isGate("caretaker")).toBe(true);
    expect(isGate("resident")).toBe(false);
    expect(isGate("provider")).toBe(false);
  });

  it("mesmo documento escrito de jeitos diferentes = mesma pessoa", () => {
    expect(docKey("123.456.789-00")).toBe("12345678900");
    expect(docKey("rg 12.345.678-x")).toBe("RG12345678X");
    expect(docKey(" - ")).toBeNull();
  });
});

describe("calendário de reservas", () => {
  it("grade do mês começa no domingo e termina no sábado", async () => {
    const { monthGrid, shiftMonthKey } = await import("../booking");
    const g = monthGrid("2026-10");
    expect(g[0]).toBe("2026-09-27");
    expect(g.at(-1)).toBe("2026-10-31");
    expect(g.length % 7).toBe(0);
    expect(monthGrid("2026-02")[0]).toBe("2026-02-01");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
  });
});

describe("autorizações da portaria", () => {
  const base = { kind: "provider", validFrom: null, validUntil: null, weekdays: "", timeFrom: null, timeTo: null, createdAt: new Date("2026-01-01") };
  const tue = brt("2026-10-13", "10:00"); // terça
  const fri = brt("2026-10-16", "10:00"); // sexta

  it("dia da semana, prazo e início", () => {
    expect(grantStatus({ ...base, weekdays: "2" }, tue)).toBe("today");
    expect(grantStatus({ ...base, weekdays: "2" }, fri)).toBe("off_day");
    expect(grantStatus({ ...base, validUntil: brt("2026-10-13", "00:00") }, brt("2026-10-13", "23:30"))).toBe("today");
    expect(grantStatus({ ...base, validUntil: brt("2026-10-12", "00:00") }, tue)).toBe("expired");
    expect(grantStatus({ ...base, validFrom: brt("2026-10-20", "00:00") }, tue)).toBe("future");
  });

  it("esperado hoje: só o que é agendado ou recente; sempre liberado e morador não", () => {
    expect(expectedToday({ ...base, weekdays: "2,5" }, tue)).toBe(true);
    expect(expectedToday({ ...base, weekdays: "5" }, tue)).toBe(false);
    expect(expectedToday(base, tue)).toBe(false);
    expect(expectedToday({ ...base, createdAt: brt("2026-10-13", "08:00") }, tue)).toBe(true);
    expect(expectedToday({ ...base, kind: "resident", weekdays: "2" }, tue)).toBe(false);
    expect(expectedToday({ ...base, validFrom: brt("2026-10-13", "00:00"), validUntil: brt("2026-10-13", "00:00") }, tue)).toBe(true);
  });

  it("descrição legível do horário", () => {
    expect(grantSchedule({ ...base, weekdays: "2,5", timeFrom: "08:00", timeTo: "17:00", validUntil: brt("2026-12-31", "00:00") })).toBe("Terças e Sextas · 08:00–17:00 · até 31/12/2026");
    expect(grantSchedule({ ...base, validFrom: brt("2026-10-20", "00:00"), validUntil: brt("2026-10-20", "00:00") })).toBe("só em 20/10/2026");
    expect(grantSchedule(base)).toBe("Sempre liberado");
    expect(grantSchedule({ ...base, kind: "resident" })).toBe("Mora na unidade");
  });
});

describe("aviso de entrada na portaria", () => {
  it("a linha do alerta some quando a pessoa estava autorizada, sem apagar o texto principal", async () => {
    const { fill, templateDef } = await import("../messages");
    const t = templateDef("gate_entry")!;
    const msg = String(t.fields.find((f) => f.key === "message")?.default ?? "");
    const vars = { tipo: "Prestador", unidade: "Torre A · 202", autor: "João", hora: "13:08" };
    expect(fill(msg, { ...vars, aviso: "" })).toBe("Prestador para Torre A · 202, registrado por João às 13:08.");
    expect(fill(msg, { ...vars, aviso: "Não estava autorizado(a) para hoje." }).split("\n")).toHaveLength(2);
  });
});
