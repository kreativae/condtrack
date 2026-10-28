import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getLegal } from "@/lib/legal";
import { turnstileSiteKey } from "@/lib/turnstile";
import { TRIAL_DAYS } from "@/lib/billing-shared";
import { landingPlans } from "@/lib/landing";
import { appUrl } from "@/lib/url";
import { Landing } from "@/components/landing/landing";

// Página inicial para quem não entrou (quem tem sessão vai para o painel pelo proxy). Planos de Assinaturas → Planos;
// razão social e CNPJ de Configurações → Dados legais (só aparecem depois de preenchidos).
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await appUrl()),
    title: { absolute: "condtrack · Gestão condominial do pedido à aprovação" },
    description:
      "Ordens de serviço com foto do antes e do depois, portaria, encomendas, financeiro, assembleias e reservas. Síndico, zelador, portaria, conselho, prestadores e moradores, cada um com o seu acesso.",
    openGraph: {
      title: "condtrack · Cada demanda do condomínio, do pedido à aprovação",
      description: "O síndico vê tudo o que está aberto, quem está cuidando e o que já foi conferido.",
      images: ["/demo/servicos/entrada-2.jpg"],
      locale: "pt_BR",
      type: "website",
    },
  };
}

export default async function Home() {
  const [rows, legal, siteKey] = await Promise.all([
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }).catch(() => []),
    getLegal(),
    turnstileSiteKey(),
  ]);
  const filled = (v: string) => (v.startsWith("[") ? null : v);
  return (
    <Landing
      plans={landingPlans(rows)}
      trialDays={TRIAL_DAYS}
      legal={{ companyName: filled(legal.companyName), cnpj: filled(legal.cnpj) }}
      turnstileSiteKey={siteKey}
    />
  );
}
