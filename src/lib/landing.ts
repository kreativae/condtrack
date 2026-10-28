// Página inicial (site de vendas): planos vindos de Assinaturas → Planos. Seguro para client e server.
import { fmtBRL } from "./finance";

type PlanRow = { key: string; name: string; description: string | null; maxUnits: number | null; monthlyPrice: number; yearlyPrice: number; features: string };

export type LandingPlan = { key: string; name: string; size: string; monthly: string; yearly: string | null; features: string[]; featured: boolean };

const reais = (cents: number) => fmtBRL(cents).replace(/,00$/, "");

/**
 * Planos ativos, na ordem de Assinaturas → Planos. Com três ou mais, o segundo fica em destaque. O anual aparece
 * quando sai mais barato que 12 mensalidades, com a economia em meses ("2 meses grátis").
 */
export function landingPlans(rows: PlanRow[]): LandingPlan[] {
  return rows.map((p, i) => {
    let features: string[] = [];
    try {
      const v = JSON.parse(p.features);
      if (Array.isArray(v)) features = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
    } catch {}
    const months = p.monthlyPrice > 0 ? Math.round((p.monthlyPrice * 12 - p.yearlyPrice) / p.monthlyPrice) : 0;
    const yearly = p.yearlyPrice > 0 && months >= 1 ? `${reais(p.yearlyPrice)} no plano anual (${months === 1 ? "1 mês grátis" : `${months} meses grátis`})` : null;
    return {
      key: p.key,
      name: p.name,
      size: p.description?.trim() || (p.maxUnits ? `Até ${p.maxUnits} unidades` : "Unidades ilimitadas"),
      monthly: reais(p.monthlyPrice),
      yearly,
      features,
      featured: rows.length >= 3 && i === 1,
    };
  });
}
