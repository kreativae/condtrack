"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";

const EVERY = 30_000;

/**
 * Sino do topo. O número vem do servidor ao abrir a página e é conferido de novo a cada 30 s
 * enquanto o app está visível, e na hora em que a pessoa volta para ele (parado em segundo plano).
 */
export function NotificationBell({ initial }: { initial: number }) {
  const [unread, setUnread] = useState(initial);
  const router = useRouter();
  const pathname = usePathname();
  const last = useRef(initial);

  // O servidor mandou um número novo (navegação, marcar como lidas…)
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setUnread(initial);
  }
  useEffect(() => {
    last.current = initial;
  }, [initial]);

  useEffect(() => {
    let timer: number | undefined;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const r = await fetch("/api/notificacoes/contagem", { cache: "no-store" });
        if (r.ok) {
          const { unread: n } = (await r.json()) as { unread: number };
          // Chegou notificação e a pessoa está na lista: atualiza a lista também
          if (n > last.current && pathname.startsWith("/notificacoes")) router.refresh();
          last.current = n;
          setUnread(n);
        }
      } catch {
        /* sem rede: tenta de novo no próximo ciclo */
      } finally {
        busy = false;
      }
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(check, EVERY);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        check();
        start();
      } else window.clearInterval(timer);
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [pathname, router]);

  return (
    <Link href="/notificacoes" aria-label={unread ? `Notificações: ${unread} não lida(s)` : "Notificações"} className="relative inline-flex size-9 items-center justify-center rounded-xl text-fg-2 transition hover:bg-bg-2 hover:text-fg">
      <Bell className="size-[18px]" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-bad px-1 font-num text-[10px] font-bold text-white ring-2 ring-bg">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
