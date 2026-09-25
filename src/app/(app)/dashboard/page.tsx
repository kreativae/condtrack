import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
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
  switch (user.role) {
    case "superadmin":
      return <SuperadminDashboard welcome={welcome} />;
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
