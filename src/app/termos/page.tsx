import type { Metadata } from "next";
import { fmtVersion, legalDocument } from "@/lib/legal";
import { LegalDoc } from "@/components/legal/legal-doc";

export const metadata: Metadata = { title: "Termos de Uso" };

export default async function TermsPage() {
  const { legal, sections } = await legalDocument("terms");
  return <LegalDoc title="Termos de Uso" version={fmtVersion(legal.version)} sections={sections} other={{ href: "/privacidade", label: "Política de Privacidade" }} />;
}
