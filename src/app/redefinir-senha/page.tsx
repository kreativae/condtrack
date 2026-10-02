import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { findValidReset } from "@/lib/password-reset";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Criar nova senha" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const { token } = await searchParams;
  const t = typeof token === "string" ? token : "";
  const reset = await findValidReset(t);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-6 sm:p-12">
      <div className="w-full max-w-sm animate-in">
        <div className="mb-10"><Logo /></div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-brand"><KeyRound className="size-4" />Acesso</p>
        <h1 className="font-display text-[28px] font-bold">Criar nova senha</h1>
        {reset ? (
          <>
            <p className="mb-8 mt-2 text-sm text-muted">Olá, {reset.user.name.split(" ")[0]}! Escolha uma nova senha com pelo menos 8 caracteres.</p>
            <ResetForm token={t} />
          </>
        ) : (
          <>
            <p className="mb-6 mt-2 text-sm text-muted">Este link é inválido, já foi usado ou venceu (ele vale por 1 hora).</p>
            <Link href="/esqueci-senha" className="text-sm font-medium text-brand hover:underline">Pedir um novo link →</Link>
          </>
        )}
      </div>
    </main>
  );
}
