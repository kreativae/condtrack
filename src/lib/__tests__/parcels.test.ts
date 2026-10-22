import { describe, expect, it } from "vitest";
import { brt } from "../booking";
import { CARRIERS, PARCEL_LIST_MAX, locationSuggestions, normalizeLocation, parcelCarriers, parcelLocations, parcelOverdue, parcelWaitDays, parseParcelList, waitLabel } from "../parcels";

describe("encomendas", () => {
  it("dias de espera contam pelo calendário de Brasília", () => {
    const now = brt("2026-10-21", "09:00");
    expect(parcelWaitDays(brt("2026-10-21", "08:00"), now)).toBe(0);
    expect(parcelWaitDays(brt("2026-10-20", "23:50"), now)).toBe(1);
    expect(waitLabel(brt("2026-10-20", "23:50"), now)).toBe("ontem");
    expect(waitLabel(brt("2026-10-16", "10:00"), now)).toBe("há 5 dias");
  });

  it("parada há 7 dias ou mais fica em destaque", () => {
    const now = brt("2026-10-21", "09:00");
    expect(parcelOverdue(brt("2026-10-15", "10:00"), now)).toBe(false);
    expect(parcelOverdue(brt("2026-10-14", "10:00"), now)).toBe(true);
  });

  it("locais: limpa espaços e junta grafias diferentes, do mais usado ao menos usado", () => {
    expect(normalizeLocation("  Armário   3 ")).toBe("Armário 3");
    expect(normalizeLocation("   ")).toBeNull();
    expect(locationSuggestions(["Armário 3", "armario 3", "Prateleira B", null, "ARMÁRIO 3", "Prateleira B", "Geladeira"])).toEqual(["Armário 3", "Prateleira B", "Geladeira"]);
  });
});

describe("aviso de encomenda", () => {
  it("destinatário e local vazios somem sem apagar a linha principal", async () => {
    const { fill, templateDef } = await import("../messages");
    const msg = String(templateDef("parcel_received")!.fields.find((f) => f.key === "message")?.default ?? "");
    const base = { volumes: "1 volume", unidade: "Torre A · 101", descricao: "Correios" };
    expect(fill(msg, { ...base, destinatario: "", local: "" })).toBe("1 volume para Torre A · 101: Correios\nRetire na portaria.");
    expect(fill(msg, { ...base, destinatario: "Ana", local: "Armário 3" }).split("\n")).toHaveLength(4);
  });
});

describe("listas das encomendas (Estrutura)", () => {
  it("um item por linha, sem vazios nem repetidos (maiúsculas e acentos não contam)", () => {
    expect(parseParcelList("Armário 1\n\n  armario   1 \r\nPrateleira A\nARMÁRIO 1\n")).toEqual(["Armário 1", "Prateleira A"]);
    expect(parseParcelList("")).toEqual([]);
    expect(parseParcelList(Array.from({ length: 60 }, (_, i) => `Local ${i}`).join("\n"))).toHaveLength(PARCEL_LIST_MAX);
  });

  it("sem lista própria usa o padrão; com lista, só ela", () => {
    expect(parcelCarriers([])).toEqual([...CARRIERS]);
    expect(parcelCarriers(["Correios", "Loggi"])).toEqual(["Correios", "Loggi"]);
    expect(parcelLocations([], ["Geladeira", "Armário 3", "armario 3"])).toEqual(["Armário 3", "Geladeira"]);
    expect(parcelLocations(["Armário 1"], ["Geladeira"])).toEqual(["Armário 1"]);
  });
});
