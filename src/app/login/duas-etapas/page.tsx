import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { getLoginAppearance } from "@/lib/login-appearance-server";
import { PENDING_2FA_COOKIE, verifyPending2fa } from "@/lib/session-token";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function TwoFactorLoginPage() {
  // Só chega aqui quem acabou de acertar a senha (cookie de 5 minutos)
  if (!(await verifyPending2fa((await cookies()).get(PENDING_2FA_COOKIE)?.value))) redirect("/login?expirou=1");
  const a = await getLoginAppearance();
  return <LoginScreen a={a} form={<CodeForm />} />;
}
