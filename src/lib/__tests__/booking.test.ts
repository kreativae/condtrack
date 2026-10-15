import { describe, expect, it } from "vitest";
import { bookingRange, brtParts, fitsOpening, isGate, overlaps, parseGuests, personValid } from "../booking";

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

  it("visitante vale até o fim do dia autorizado; morador não vence", () => {
    const until = new Date("2026-10-20T03:00:00Z");
    expect(personValid({ kind: "visitor", validUntil: until }, new Date("2026-10-20T20:00:00Z"))).toBe(true);
    expect(personValid({ kind: "visitor", validUntil: until }, new Date("2026-10-21T04:00:00Z"))).toBe(false);
    expect(personValid({ kind: "resident", validUntil: until }, new Date("2030-01-01"))).toBe(true);
  });
});
