import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmtVersion, getLegal } from "@/lib/legal";
import { acceptTerms } from "@/app/actions/privacy";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Termos e privacidade" };

export default async function AcceptPage({ searchParams }: PageProps<"/aceite">) {
  const user = await requireUser();
  const l = await getLegal();
  if (user.impersonator || user.termsVersion === l.version) redirect("/dashboard");
  const missing = (await searchParams).faltou === "1";
  const update = !!user.termsVersion;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-surface p-6 shadow-pop sm:p-8">
        <Logo size={30} />
        <h1 className="mt-8 font-display text-2xl font-bold">{update ? "Atualizamos os termos" : "Antes de começar"}</h1>
        <p className="mt-2 text-sm text-fg-2">
          {update ? "Os Termos de Uso e a Política de Privacidade mudaram. Leia e confirme para continuar." : `Olá, ${user.name.split(" ")[0]}. Para usar o Condtrack, leia e aceite os Termos de Uso e a Política de Privacidade.`}
        </p>
        <ul className="mt-5 space-y-2 rounded-2xl bg-bg-2 p-4 text-sm text-fg-2">
          <li>• Seus dados são usados para a gestão do condomínio e para a prestação de contas aos moradores.</li>
          <li>• Fotos dos serviços guardam data, hora e local de captura nos registros da OS.</li>
          <li>• Você pode baixar seus dados ou pedir a exclusão da conta em Meu perfil.</li>
          <li>• Não vendemos dados e não usamos cookies de publicidade.</li>
        </ul>
        <form action={acceptTerms} className="mt-6 space-y-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="agree" required className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span>
              Li e aceito os <Link href="/termos" target="_blank" className="font-medium text-brand hover:underline">Termos de Uso</Link> e a{" "}
              <Link href="/privacidade" target="_blank" className="font-medium text-brand hover:underline">Política de Privacidade</Link> (versão de {fmtVersion(l.version)}).
            </span>
          </label>
          {missing && <p className="text-sm text-bad">Marque a caixa para continuar.</p>}
          <button className={buttonClass("brand") + " w-full"}>Continuar</button>
        </form>
        <form action={logout} className="mt-3 text-center">
          <button className="text-xs text-muted hover:text-fg">Não aceito, sair</button>
        </form>
      </div>
    </div>
  );
}
