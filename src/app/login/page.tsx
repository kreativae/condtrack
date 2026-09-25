import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";
import { LoginScreen } from "@/components/login-screen";
import { passkeyConfig } from "@/lib/passkeys";
import { turnstileSiteKey } from "@/lib/turnstile";
import { setupAvailable } from "@/lib/setup";
import { getLoginAppearance } from "@/lib/login-appearance-server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLoginAppearance()).pageTitle };
}

const DEMO = [
  ["Superadmin", "admin@condtrack.app"],
  ["Síndico", "sindico@condtrack.app"],
  ["Zelador", "zelador@condtrack.app"],
  ["Prestador", "prestador@condtrack.app"],
  ["Conselho", "conselho@condtrack.app"],
  ["Morador", "morador@condtrack.app"],
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const [pk, turnstile, firstAccess, a] = await Promise.all([passkeyConfig(), turnstileSiteKey(), setupAvailable(), getLoginAppearance()]);
  return (
    <LoginScreen
      a={a}
      form={
        <>
          {firstAccess && (
            <Link href="/primeiro-acesso" className="mb-6 block rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand hover:bg-brand/10">
              <b>Primeiro acesso?</b> Nenhum administrador cadastrado ainda — crie a conta de superadmin →
            </Link>
          )}
          <LoginForm next={typeof next === "string" ? next : undefined} passkeys={pk.enabled} turnstileSiteKey={turnstile} a={a} />
        </>
      }
    >
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
    </LoginScreen>
  );
}
