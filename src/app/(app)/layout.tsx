import Link from "next/link";
import { cookies } from "next/headers";
import { AlertTriangle, Bell, Building2, LogOut, Eye } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nowMs } from "@/lib/format";
import { NAV } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/roles";
import { logout, stopImpersonating } from "@/app/actions/auth";
import { SideNav, BottomNav } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui";
import { unitLabel } from "@/lib/units";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unread = user.role === "resident" ? 0 : await db.notification.count({ where: { userId: user.id, read: false } });
  const items = NAV[user.role];
  const unit = user.units[0]?.unit;
  const theme = (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
  const place = user.condominium?.name ?? "Todos os condomínios";

  // Aviso de cobrança para o síndico (pagamento falhou ou teste acabando)
  // full: notebook/desktop · short: celular (a faixa tem altura fixa de uma linha)
  let billingNotice: { full: string; short: string } | null = null;
  if (user.role === "syndic" && user.condominiumId) {
    const sub = await db.subscription.findUnique({ where: { condominiumId: user.condominiumId } });
    if (sub && ["past_due", "unpaid"].includes(sub.status)) billingNotice = { full: "Não conseguimos cobrar a assinatura. Atualize a forma de pagamento para evitar a suspensão.", short: "Falha na cobrança da assinatura." };
    else if (sub?.status === "trialing" && sub.trialEnd && !sub.cancelAtPeriodEnd) {
      const days = Math.ceil((sub.trialEnd.getTime() - nowMs()) / 86400_000);
      if (days <= 3) billingNotice = { full: `Seu período de teste termina em ${Math.max(days, 0)} dia(s).`, short: `Teste termina em ${Math.max(days, 0)} dia(s).` };
    } else if (!sub?.stripeSubscriptionId || ["canceled", "incomplete_expired"].includes(sub.status)) {
      billingNotice = { full: "Este condomínio não tem uma assinatura ativa.", short: "Sem assinatura ativa." };
    }
  }

  return (
    // --chrome: altura das faixas de aviso, usada pelas páginas "congeladas" (components/frozen.tsx)
    <div
      className="min-h-dvh lg:grid lg:grid-cols-[252px_1fr]"
      style={{ "--chrome": `${((user.impersonator ? 1 : 0) + (billingNotice ? 1 : 0)) * 2}rem` } as React.CSSProperties}
    >
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <Link href="/dashboard" className="px-3">
          <Logo />
        </Link>

        <div className="mx-1 mb-4 mt-6 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Building2 className="size-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{place}</p>
            <p className="truncate text-[11px] text-muted">{user.condominium ? ROLE_LABEL[user.role] : "Plataforma"}</p>
          </div>
        </div>

        <SideNav items={items} />

        <div className="mt-auto space-y-1 border-t border-line pt-3">
          <Link href="/perfil" className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-bg-2">
            <Avatar name={user.name} src={user.avatarUrl} size={34} />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted">
                {ROLE_LABEL[user.role]}
                {unit && ` · ${unitLabel(unit, true)}`}
              </p>
            </div>
          </Link>
          <form action={logout}>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-bg-2 hover:text-fg">
              <LogOut className="size-4" /> Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {user.impersonator && (
          // Faixas de aviso sempre em uma linha (h-8): a altura entra no --chrome
          <div className="flex h-8 items-center justify-center gap-3 overflow-hidden whitespace-nowrap bg-brand px-4 text-xs font-medium text-brand-ink">
            <Eye className="size-4 shrink-0" />
            <span className="truncate">Visualizando como {user.name} ({ROLE_LABEL[user.role]}) — sessão de {user.impersonator.name}</span>
            <form action={stopImpersonating}>
              <button className="rounded-md bg-black/15 px-2 py-0.5 hover:bg-black/25">Encerrar</button>
            </form>
          </div>
        )}
        {billingNotice && (
          <Link href="/assinatura" className="flex h-8 items-center justify-center gap-2 overflow-hidden whitespace-nowrap bg-warn/15 px-4 text-xs font-medium text-warn hover:bg-warn/20">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="truncate sm:hidden">{billingNotice.short}</span><span className="hidden truncate sm:inline">{billingNotice.full}</span> <span className="shrink-0 underline">Ver assinatura</span>
          </Link>
        )}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-8">
          <div className="lg:hidden">
            <Logo tagline={false} size={30} />
          </div>
          <p className="hidden text-sm text-muted lg:block">
            {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date())}
          </p>
          <div className="flex items-center gap-1">
            <ThemeToggle initial={theme} />
{user.role !== "resident" && (
            <Link href="/notificacoes" aria-label="Notificações" className="relative inline-flex size-9 items-center justify-center rounded-xl text-fg-2 transition hover:bg-bg-2 hover:text-fg">
              <Bell className="size-[18px]" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-bad px-1 font-num text-[10px] font-bold text-white ring-2 ring-bg">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            )}
            <Link href="/perfil" className="ml-1 lg:hidden">
              <Avatar name={user.name} src={user.avatarUrl} size={32} />
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-8 sm:px-8 lg:pb-16">{children}</main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
