import { describe, expect, it } from "vitest";
import { landingPlans } from "../landing";

const row = (over: Partial<Parameters<typeof landingPlans>[0][number]> = {}) => ({
  key: "essencial", name: "Essencial", description: "Para condomínios de até 100 unidades", maxUnits: 100, monthlyPrice: 15000, yearlyPrice: 165000, features: '["Até 100 unidades","OS ilimitadas"]', ...over,
});

describe("landingPlans", () => {
  it("preço sem centavos redondos e economia do anual em meses", () => {
    const [p] = landingPlans([row()]);
    expect(p.monthly.replace(/\s/g, " ")).toBe("R$ 150");
    expect(p.yearly?.replace(/\s/g, " ")).toBe("R$ 1.650 no plano anual (1 mês grátis)");
    expect(p.features).toEqual(["Até 100 unidades", "OS ilimitadas"]);
  });
  it("mantém os centavos quando existem", () => {
    expect(landingPlans([row({ monthlyPrice: 14990 })])[0].monthly.replace(/\s/g, " ")).toBe("R$ 149,90");
  });
  it("anual que não economiza fica de fora", () => {
    expect(landingPlans([row({ yearlyPrice: 180000 })])[0].yearly).toBeNull();
  });
  it("sem descrição usa as unidades; recursos quebrados viram lista vazia", () => {
    const [a, b] = landingPlans([row({ description: null }), row({ description: " ", maxUnits: null, features: "x" })]);
    expect(a.size).toBe("Até 100 unidades");
    expect(b.size).toBe("Unidades ilimitadas");
    expect(b.features).toEqual([]);
  });
  it("o segundo de três fica em destaque", () => {
    expect(landingPlans([row(), row(), row()]).map((p) => p.featured)).toEqual([false, true, false]);
    expect(landingPlans([row(), row()]).some((p) => p.featured)).toBe(false);
  });
});
