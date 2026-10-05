import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import type { Section } from "@/lib/legal-texts";

/** Página pública de documento legal (Termos / Privacidade): leitura confortável, fora do layout do app. */
export function LegalDoc({ title, version, sections, other }: { title: string; version: string; sections: Section[]; other: { href: string; label: string } }) {
  return (
    <div className="min-h-dvh bg-bg px-4 py-10 text-fg">
      <article className="mx-auto max-w-2xl">
        <div className="mb-10 flex items-center justify-between gap-4">
          <Logo size={30} />
          <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-brand"><ArrowLeft className="size-3.5" />Voltar</Link>
        </div>
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">Versão de {version}</p>
        <div className="mt-8 space-y-8">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="font-display text-lg font-semibold">{s.title}</h2>
              <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-fg-2">{s.body.map((p, j) => <p key={j}>{p}</p>)}</div>
            </section>
          ))}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
          Veja também: <Link href={other.href} className="font-medium text-brand hover:underline">{other.label}</Link>
        </p>
      </article>
    </div>
  );
}
