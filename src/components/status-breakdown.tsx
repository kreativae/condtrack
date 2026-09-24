import Link from "next/link";
import { STATUS_META, type Status } from "@/lib/workflow";
import { cx } from "./ui";

const BAR: Record<string, string> = { info: "bg-info", warn: "bg-warn", ok: "bg-ok", bad: "bg-bad", muted: "bg-muted", brand: "bg-brand" };

/** Distribuição por status — cor de status sempre acompanhada do rótulo. */
export function StatusBreakdown({ counts }: { counts: Record<string, number> }) {
  const rows = (Object.keys(STATUS_META) as Status[]).filter((s) => s !== "cancelled");
  const max = Math.max(1, ...rows.map((s) => counts[s] ?? 0));
  return (
    <ul className="space-y-3 p-5">
      {rows.map((s) => (
        <li key={s}>
          <Link href={`/os?status=${s}`} className="group grid grid-cols-[minmax(0,1.3fr)_minmax(48px,1fr)_24px] items-center gap-3 text-sm">
            <span className="truncate text-fg-2 group-hover:text-brand">{STATUS_META[s].label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-bg-2">
              <span className={cx("block h-full rounded-full", BAR[STATUS_META[s].tone])} style={{ width: `${((counts[s] ?? 0) / max) * 100}%` }} />
            </span>
            <span className="text-right font-num tabular-nums">{counts[s] ?? 0}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
