import type { PrismaClient } from "@prisma/client";

// Planos padrão da plataforma (valores em centavos, BRL). Anual = 11 × mensal
// (1 mês grátis). Usado pelo seed e pelo primeiro acesso; editáveis depois em
// Assinaturas → Planos.
export const DEFAULT_PLANS = [
  { key: "essencial", name: "Essencial", description: "Para condomínios de até 100 unidades", maxUnits: 100, monthlyPrice: 15000, sortOrder: 1,
    features: ["Até 100 unidades", "Ordens de serviço ilimitadas", "Registro antes/depois", "Feed para moradores"] },
  { key: "profissional", name: "Profissional", description: "Para condomínios de até 150 unidades", maxUnits: 150, monthlyPrice: 20000, sortOrder: 2,
    features: ["Até 150 unidades", "Tudo do Essencial", "Relatórios e indicadores", "Comunicados com confirmação de leitura"] },
  { key: "premium", name: "Premium", description: "Unidades ilimitadas", maxUnits: null, monthlyPrice: 40000, sortOrder: 3,
    features: ["Unidades ilimitadas", "Tudo do Profissional", "Suporte prioritário", "Personalização visual"] },
];

/** Cria os planos que ainda não existem (não altera planos já editados). */
export async function ensureDefaultPlans(db: Pick<PrismaClient, "plan">) {
  for (const p of DEFAULT_PLANS) {
    const data = { ...p, yearlyPrice: p.monthlyPrice * 11, features: JSON.stringify(p.features) };
    await db.plan.upsert({ where: { key: p.key }, create: data, update: {} });
  }
}
