import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { fmtRelative } from "@/lib/format";
import { Avatar, Badge, Empty, cx } from "@/components/ui";
import { Pager, ScrollCard, pageParam, withPage } from "@/components/frozen";

const PAGE = 50;
import { UserRowActions } from "./user-row-actions";

/** Lista paginada de usuários — renderizar dentro de um FrozenPage. */
export async function UsersTable({ where, base, role, roles, showCondo, canImpersonate, q, meId, params }: { meId: string; where: Prisma.UserWhereInput; base: string; role?: string; roles: Role[]; showCondo?: boolean; canImpersonate?: boolean; q?: string; params: Record<string, string | string[] | undefined> }) {
  const filter: Prisma.UserWhereInput = { AND: [where, { NOT: { email: { endsWith: "@removido.invalid" } } }, role ? { role } : {}, q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}] };
  const total = await db.user.count({ where: filter });
  const page = pageParam(params.page, total, PAGE);
  const users = await db.user.findMany({
    where: filter,
    skip: (page - 1) * PAGE,
    take: PAGE,
    include: { condominium: { select: { name: true } }, units: { include: { unit: { include: { building: true } } } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return (
    <>
      <div className="mb-4 no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-line">
        {[["", "Todos"], ...roles.map((r) => [r, ROLE_LABEL[r]])].map(([k, l]) => (
          <Link key={k} href={withPage(base, { ...params, role: k || undefined }, 1)} className={cx("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm", (role ?? "") === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}>
            {l}
          </Link>
        ))}
      </div>
      <ScrollCard footer={<Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage(base, params, p)} />} className="[&>div]:divide-y [&>div]:divide-line">
        {users.length ? users.map((u) => (
          <div key={u.id} className={cx("flex items-center gap-4 px-5 py-4", u.status !== "active" && "opacity-55")}>
            <Avatar name={u.name} src={u.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {u.name}
                <Badge tone={u.role === "syndic" || u.role === "superadmin" ? "brand" : "muted"}>{ROLE_LABEL[u.role as Role]}</Badge>
                {u.status !== "active" && <Badge tone="bad">Inativo</Badge>}
              </p>
              <p className="truncate text-xs text-muted">
                {u.email}
                {u.company && ` · ${u.company}`}
                {u.specialty && ` (${u.specialty})`}
                {u.units.map((x) => ` · ${x.unit.building.name} ${x.unit.number}`).join("")}
                {showCondo && u.condominium && ` · ${u.condominium.name}`}
              </p>
            </div>
            <p className="hidden text-xs text-muted md:block">{u.lastLoginAt ? `Acesso ${fmtRelative(u.lastLoginAt)}` : "Nunca acessou"}</p>
            {u.id !== meId && roles.includes(u.role as Role) && <UserRowActions id={u.id} name={u.name} editHref={`${base}/${u.id}/editar`} active={u.status === "active"} canImpersonate={canImpersonate} />}
          </div>
        )) : <Empty title="Nenhum usuário encontrado" />}
      </ScrollCard>
    </>
  );
}
