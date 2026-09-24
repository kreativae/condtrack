import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtRelative } from "@/lib/format";
import { markAllRead, openNotification } from "@/app/actions/misc";
import { Empty, PageHeader, buttonClass, cx } from "@/components/ui";
import { FrozenPage, FrozenTop, Pager, ScrollCard, pageParam, withPage } from "@/components/frozen";

export const metadata: Metadata = { title: "Notificações" };

const PAGE = 30;

export default async function NotificationsPage({ searchParams }: PageProps<"/notificacoes">) {
  const user = await requireUser("superadmin", "syndic", "caretaker", "provider", "council");
  const sp = await searchParams;
  const [total, unread] = await Promise.all([
    db.notification.count({ where: { userId: user.id } }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);
  const page = pageParam(sp.page, total, PAGE);
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE });
  return (
    <div className="mx-auto max-w-3xl">
    <FrozenPage>
      <FrozenTop>
        <PageHeader
          eyebrow="Central"
          title="Notificações"
          description={unread ? `${unread} não lida(s)` : "Tudo em dia."}
          actions={unread > 0 && <form action={markAllRead}><button className={buttonClass("outline", "sm")}>Marcar todas como lidas</button></form>}
        />
      </FrozenTop>
      <ScrollCard footer={<Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/notificacoes", sp, p)} />} className="[&>div]:divide-y [&>div]:divide-line">
        {items.length ? items.map((n) => (
          <form key={n.id} action={openNotification.bind(null, n.id)}>
            <button className={cx("flex w-full gap-4 px-5 py-4 text-left transition hover:bg-brand/[0.04]", !n.read && "bg-brand/[0.03]")}>
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{n.title}</span>
                <span className="block truncate text-sm text-muted">{n.message}</span>
              </span>
              <span className="whitespace-nowrap text-xs text-muted">{fmtRelative(n.createdAt)}</span>
            </button>
          </form>
        )) : <Empty icon={<Bell className="size-8" />} title="Nenhuma notificação" />}
      </ScrollCard>
    </FrozenPage>
    </div>
  );
}
