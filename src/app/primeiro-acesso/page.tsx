import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { Alert } from "@/components/ui";
import { setupAvailable, setupTokenConfigured } from "@/lib/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Primeiro acesso" };

export default async function FirstAccessPage() {
  const available = await setupAvailable();
  const configured = setupTokenConfigured();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-6 sm:p-12">
      <div className="w-full max-w-md animate-in">
        <div className="mb-10"><Logo /></div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-brand"><ShieldCheck className="size-4" />Instalação</p>
        <h1 className="font-display text-[28px] font-bold">Primeiro acesso</h1>

        {!available ? (
          <>
            <p className="mb-6 mt-2 text-sm text-muted">A conta de administrador já foi criada. Este passo não está mais disponível.</p>
            <Link href="/login" className="text-sm font-medium text-brand hover:underline">Ir para o login →</Link>
          </>
        ) : !configured ? (
          <div className="mt-4 space-y-4 text-sm text-fg-2">
            <p>Para criar a primeira conta de administrador com segurança, defina um código de instalação:</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Gere um código: <code className="rounded bg-bg-2 px-1.5 py-0.5 text-xs">openssl rand -base64 24</code></li>
              <li>Na Vercel, crie a variável <b>SETUP_TOKEN</b> com esse valor (mínimo 12 caracteres).</li>
              <li>Faça um novo deploy e volte a esta página.</li>
            </ol>
            <Alert tone="muted"><span className="flex items-center gap-2"><KeyRound className="size-4" />Depois de criar a conta, remova a variável SETUP_TOKEN.</span></Alert>
          </div>
        ) : (
          <>
            <p className="mb-8 mt-2 text-sm text-muted">Crie a conta de superadministrador da plataforma. Os planos de assinatura padrão também serão criados.</p>
            <SetupForm />
          </>
        )}
      </div>
    </main>
  );
}
