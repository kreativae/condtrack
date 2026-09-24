import type { Metadata } from "next";
import { Check, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";
import { passkeyConfig } from "@/lib/passkeys";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = { title: "Entrar" };

const DEMO = [
  ["Superadmin", "admin@condtrack.app"],
  ["Síndico", "sindico@condtrack.app"],
  ["Zelador", "zelador@condtrack.app"],
  ["Prestador", "prestador@condtrack.app"],
  ["Conselho", "conselho@condtrack.app"],
  ["Morador", "morador@condtrack.app"],
];

const STEPS = ["Aberta", "Em execução", "Validada", "Aprovada"];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const [pk, turnstile] = await Promise.all([passkeyConfig(), turnstileSiteKey()]);
  return (
    <main className="grid min-h-dvh bg-surface lg:grid-cols-[1fr_1.05fr]">
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm animate-in">
          <div className="mb-12">
            <Logo />
          </div>
          <h1 className="font-display text-[28px] font-bold">Bem-vindo de volta</h1>
          <p className="mb-8 mt-2 text-sm text-muted">Entre para acompanhar os serviços do seu condomínio.</p>
          <LoginForm next={typeof next === "string" ? next : undefined} passkeys={pk.enabled} turnstileSiteKey={turnstile} />

          {process.env.NODE_ENV !== "production" && (
            <div className="mt-10 rounded-2xl bg-bg-2 p-4 text-xs text-muted">
              <p className="mb-2 font-semibold text-fg-2">
                Contas de demonstração · senha <code className="rounded bg-surface px-1.5 py-0.5 text-brand">condtrack123</code>
              </p>
              <ul className="space-y-1">
                {DEMO.map(([r, e]) => (
                  <li key={e} className="flex justify-between gap-2">
                    <span>{r}</span>
                    <code className="text-fg-2">{e}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="logo-mark relative m-3 hidden overflow-hidden rounded-[28px] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-[#14a89a]/40 blur-3xl" />

        <div className="relative flex items-center gap-2 text-sm font-medium text-white/80">
          <Sparkles className="size-4" /> Transparência em cada serviço
        </div>

        {/* Prévia do produto */}
        <div className="relative mx-auto w-full max-w-md">
          <div className="rounded-2xl bg-white p-5 text-[#0f172a] shadow-[0_30px_60px_-20px_rgb(15_23_42/0.45)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#5b5bd6]">OS-2026-00012</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16a34a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#16a34a]">
                <span className="size-1.5 rounded-full bg-current" /> Aprovada
              </span>
            </div>
            <p className="font-display text-lg font-bold">Repintura do hall de entrada</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#8b8577,#5f5a50)]">
                <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white">Antes</span>
              </div>
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#eef0fe,#c7c9f5)]">
                <span className="absolute left-2 top-2 rounded-full bg-[#5b5bd6] px-2 py-0.5 text-[10px] font-semibold text-white">Depois</span>
              </div>
            </div>
            <ol className="mt-5 flex items-center">
              {STEPS.map((s, i) => (
                <li key={s} className="flex flex-1 items-center last:flex-none">
                  <span className="flex flex-col items-center gap-1.5">
                    <span className="flex size-6 items-center justify-center rounded-full bg-[#5b5bd6] text-white"><Check className="size-3.5" strokeWidth={3} /></span>
                    <span className="whitespace-nowrap text-[10px] font-medium text-[#64748b]">{s}</span>
                  </span>
                  {i < STEPS.length - 1 && <span className="mx-1.5 mb-5 h-0.5 flex-1 rounded-full bg-[#5b5bd6]" />}
                </li>
              ))}
            </ol>
          </div>
          <div className="absolute -bottom-3 left-10 flex translate-y-1/2 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[#0f172a] shadow-[0_20px_40px_-16px_rgb(15_23_42/0.5)]">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#0e9384]/10 text-[#0e9384]"><ShieldCheck className="size-5" /></span>
            <div className="text-xs">
              <p className="font-semibold">Validado pelo zelador</p>
              <p className="flex items-center gap-1 text-[#64748b]"><Clock className="size-3" /> há 2 horas</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-[34px] font-bold leading-[1.15]">Cada serviço do condomínio, do chamado à aprovação.</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            Fotos de antes e depois, validação do zelador e aprovação do síndico — visível para todos os moradores.
          </p>
        </div>
      </section>
    </main>
  );
}
