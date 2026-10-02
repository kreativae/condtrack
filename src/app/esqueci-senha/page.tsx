import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-6 sm:p-12">
      <div className="w-full max-w-sm animate-in">
        <div className="mb-10"><Logo /></div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-brand"><KeyRound className="size-4" />Acesso</p>
        <h1 className="font-display text-[28px] font-bold">Esqueci minha senha</h1>
        <p className="mb-8 mt-2 text-sm text-muted">Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</p>
        <ForgotForm />
        <Link href="/login" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"><ArrowLeft className="size-4" />Voltar para o login</Link>
      </div>
    </main>
  );
}
