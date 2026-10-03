import type { Metadata } from "next";
import { fmtVersion, getLegal, termsOfUse } from "@/lib/legal";
import { LegalDoc } from "@/components/legal/legal-doc";

export const metadata: Metadata = { title: "Termos de Uso" };

export default async function TermsPage() {
  const l = await getLegal();
  return <LegalDoc title="Termos de Uso" version={fmtVersion(l.version)} sections={termsOfUse(l)} other={{ href: "/privacidade", label: "Política de Privacidade" }} />;
}
