import type { Metadata } from "next";
import { fmtVersion, legalDocument } from "@/lib/legal";
import { LegalDoc } from "@/components/legal/legal-doc";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default async function PrivacyPage() {
  const { legal, sections } = await legalDocument("privacy");
  return <LegalDoc title="Política de Privacidade" version={fmtVersion(legal.version)} sections={sections} other={{ href: "/termos", label: "Termos de Uso" }} />;
}
