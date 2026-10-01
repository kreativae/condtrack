import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { financeAccess, financeCondo } from "@/lib/finance-server";
import { dateToDay } from "@/lib/finance";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { EntryForm } from "../entry-form";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewFinanceEntryPage({ searchParams }: PageProps<"/financeiro/novo">) {
  const user = await requireUser("superadmin", "syndic");
  const sp = await searchParams;
  const condo = await financeCondo(user, sp.condo);
  if (!condo || !financeAccess(user, condo).edit) redirect("/financeiro");
  const back = user.role === "superadmin" ? `/financeiro?condo=${condo.id}` : "/financeiro";
  const today = dateToDay(new Date());
  return (
    <div className="mx-auto max-w-3xl animate-in">
      <Link href={back} className={buttonClass("ghost", "sm")}><ArrowLeft className="size-4" />Financeiro</Link>
      <PageHeader eyebrow={condo.name} title="Novo lançamento" description="Registre uma receita ou despesa. Quem lançou e cada alteração ficam no histórico." />
      <Card className="p-5 sm:p-6">
        <EntryForm
          condominiumId={condo.id}
          today={today}
          initial={{ type: "expense", category: "", description: "", counterparty: "", document: "", amount: "", date: today, dueDate: "", paidAt: "", status: "pending", paymentMethod: "", notes: "" }}
        />
      </Card>
    </div>
  );
}
