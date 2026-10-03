import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { adminScope } from "@/lib/admin-scope-server";
import { SuperadminDashboard } from "./superadmin";
import { SyndicDashboard } from "./syndic";
import { CaretakerDashboard } from "./caretaker";
import { ProviderDashboard } from "./provider";
import { CouncilDashboard } from "./council";
import { ResidentDashboard } from "./resident";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const welcome = (await searchParams)["bem-vindo"] === "1";
  // Quem mexe no financeiro e nas permissões: lembrete até ativar as duas etapas
  const remind = (user.role === "superadmin" || user.role === "syndic") && !user.totpEnabledAt && !user.impersonator;
  return (
    <>
      {remind && (
        <Link href="/perfil#duas-etapas" className="mb-6 flex items-center gap-3 rounded-2xl bg-warn/10 px-4 py-3 text-sm text-fg-2 ring-1 ring-inset ring-warn/15 hover:bg-warn/15">
          <ShieldCheck className="size-5 shrink-0 text-warn" />
          <span className="min-w-0 flex-1"><b className="text-fg">Proteja sua conta:</b> ative a verificação em duas etapas. Leva 1 minuto.</span>
          <span className="shrink-0 text-xs font-medium text-brand">Ativar →</span>
        </Link>
      )}
      {await board(user, welcome)}
    </>
  );
}

async function board(user: Awaited<ReturnType<typeof requireUser>>, welcome: boolean) {
  switch (user.role) {
    case "superadmin":
      return <SuperadminDashboard user={user} welcome={welcome} scope={await adminScope(user)} />;
    case "syndic":
      return <SyndicDashboard user={user} />;
    case "caretaker":
      return <CaretakerDashboard user={user} />;
    case "provider":
      return <ProviderDashboard user={user} />;
    case "council":
      return <CouncilDashboard user={user} />;
    case "resident":
      return <ResidentDashboard user={user} />;
  }
}
