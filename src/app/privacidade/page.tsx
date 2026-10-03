import type { Metadata } from "next";
import { fmtVersion, getLegal, privacyPolicy } from "@/lib/legal";
import { LegalDoc } from "@/components/legal/legal-doc";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default async function PrivacyPage() {
  const l = await getLegal();
  return <LegalDoc title="Política de Privacidade" version={fmtVersion(l.version)} sections={privacyPolicy(l)} other={{ href: "/termos", label: "Termos de Uso" }} />;
}
