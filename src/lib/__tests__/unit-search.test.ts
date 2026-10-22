import { describe, expect, it } from "vitest";
import { matchUnits } from "../unit-search";

const u = (id: string, building: string, number: string) => ({ id, building, number, label: `${building} · ${number}` });
const units = [
  u("a502", "Torre Aurora", "502"), u("h502", "Torre Horizonte", "502"), u("a50", "Torre Aurora", "50"),
  u("a1502", "Torre Aurora", "1502"), u("bb204", "Bloco B", "204"), u("ba204", "Bloco A", "204"), u("c12", "Quadra 3", "12"),
];
const ids = (q: string) => matchUnits(q, units).map((x) => x.id);

describe("busca de unidade digitando", () => {
  it("número exato primeiro, depois os que começam com ele", () => {
    expect(ids("502").slice(0, 2).sort()).toEqual(["a502", "h502"]);
    expect(ids("50")[0]).toBe("a50");
    expect(ids("50")).toContain("a502");
    expect(ids("502")).not.toContain("a1502");
  });

  it("letra ou nome da torre desempata: a502, a 502, aurora 502, hor 502", () => {
    expect(ids("a502")).toEqual(["a502"]);
    expect(ids("a 502")).toEqual(["a502"]);
    expect(ids("aurora 502")).toEqual(["a502"]);
    expect(ids("Hor 502")).toEqual(["h502"]);
    expect(ids("torre aurora apto 502")).toEqual(["a502"]);
  });

  it("bloco com letra e quadra com número", () => {
    expect(ids("b204")).toEqual(["bb204"]);
    expect(ids("bloco a 204")).toEqual(["ba204"]);
    expect(ids("204")).toHaveLength(2);
    expect(ids("casa 12")).toEqual(["c12"]);
  });

  it("só o nome da torre lista as unidades dela; texto vazio não lista nada", () => {
    expect(ids("horizonte")).toEqual(["h502"]);
    expect(ids("  ")).toEqual([]);
    expect(ids("xyz 502")).toEqual([]);
  });
});
