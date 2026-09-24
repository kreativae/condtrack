import { Badge } from "./ui";
import { PRIORITY_META, STATUS_META, type Priority, type Status } from "@/lib/workflow";

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status as Status] ?? { label: status, tone: "muted" as const };
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const m = PRIORITY_META[priority as Priority] ?? PRIORITY_META.medium;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
