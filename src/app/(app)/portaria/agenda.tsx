import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PERSON_KINDS, type PersonKind } from "@/lib/booking";
import { unitLabel } from "@/lib/units";
import { Pager, pageParam, withPage } from "@/components/frozen";
import { Badge, Select, buttonClass, cx } from "@/components/ui";

const PAGE = 50;
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
const KIND_LABEL: Record<string, string> = { visitor: "Visitante", provider: "Prestador", delivery: "Entrega", resident: "Morador" };
const UNIT_ROLE: Record<string, string> = { owner: "proprietário", tenant: "inquilino", dependent: "dependente" };

// Primeira letra sem acento (Á → A, Ç → C); o que não for A–Z vira "#"
const FROM = "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç";
const TO = "AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc";
const letterSql = (table: "AccessPerson" | "User") =>
  `CASE WHEN upper(left(translate(t.name, '${FROM}', '${TO}'), 1)) BETWEEN 'A' AND 'Z' THEN upper(left(translate(t.name, '${FROM}', '${TO}'), 1)) ELSE '#' END`
    .replace(/t\./g, `"${table}".`);

type SP = Record<string, string | string[] | undefined>;
const str = (v: SP[string]) => (typeof v === "string" ? v : "");

/**
 * Agenda de contatos da portaria: todos os cadastrados, em ordem alfabética, com barra de letras e filtros
 * por torre, tipo e situação. "Moradores com conta" lista quem tem acesso ao app.
 */
export async function ContactAgenda({ condoId, sp, buildings, units }: {
  condoId: string; sp: SP; buildings: { id: string; name: string }[]; units: { id: string; label: string }[];
}) {
  const letter = LETTERS.includes(str(sp.letra)) ? str(sp.letra) : "";
  const tower = str(sp.torre);
  const kind = str(sp.tipo);
  const status = str(sp.situacao);
  const accounts = kind === "conta";
  const label = (id: string | null) => units.find((u) => u.id === id)?.label ?? "Condomínio";
  const params = { aba: "agenda", letra: letter || undefined, torre: tower || undefined, tipo: kind || undefined, situacao: status || undefined };
  const href = (p: Partial<typeof params>) => withPage("/portaria", { ...params, ...p }, 1);

  // Quantos contatos por letra (para apagar as letras vazias)
  const counts = new Map<string, number>();
  const rows = accounts
    ? await db.$queryRawUnsafe<{ l: string; n: bigint }[]>(
        `SELECT ${letterSql("User")} AS l, count(DISTINCT "User".id) AS n FROM "User" JOIN "UserUnit" uu ON uu."userId" = "User".id JOIN "Unit" u ON u.id = uu."unitId" JOIN "Building" b ON b.id = u."buildingId" WHERE b."condominiumId" = $1 AND "User".status = 'active' GROUP BY 1`, condoId)
    : await db.$queryRawUnsafe<{ l: string; n: bigint }[]>(`SELECT ${letterSql("AccessPerson")} AS l, count(*) AS n FROM "AccessPerson" WHERE "condominiumId" = $1 GROUP BY 1`, condoId);
  for (const r of rows) counts.set(r.l, Number(r.n));

  // Ids da letra escolhida (mesma regra das contagens)
  const letterIds = letter
    ? (accounts
        ? await db.$queryRawUnsafe<{ id: string }[]>(`SELECT DISTINCT "User".id FROM "User" JOIN "UserUnit" uu ON uu."userId" = "User".id JOIN "Unit" u ON u.id = uu."unitId" JOIN "Building" b ON b.id = u."buildingId" WHERE b."condominiumId" = $1 AND ${letterSql("User")} = $2`, condoId, letter)
        : await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "AccessPerson" WHERE "condominiumId" = $1 AND ${letterSql("AccessPerson")} = $2`, condoId, letter)
      ).map((r) => r.id)
    : null;

  let list: { key: string; name: string; href?: string; sub: string; phone: string | null; badges: { text: string; tone: "bad" | "muted" | "info" }[] }[] = [];
  let total = 0;
  let page = 1;
  if (accounts) {
    const where: Prisma.UserUnitWhereInput = {
      unit: { building: { condominiumId: condoId, ...(tower && tower !== "condominio" && { id: tower }) } },
      user: { status: "active", ...(letterIds && { id: { in: letterIds } }) },
    };
    total = await db.userUnit.count({ where });
    page = pageParam(sp.page, total, PAGE);
    const found = await db.userUnit.findMany({ where, include: { user: { select: { name: true, phone: true } }, unit: { include: { building: true } } }, orderBy: { user: { name: "asc" } }, skip: (page - 1) * PAGE, take: PAGE });
    list = found.map((a) => ({ key: `${a.userId}-${a.unitId}`, name: a.user.name, sub: `Morador (${UNIT_ROLE[a.role] ?? a.role}) com conta no app · ${unitLabel(a.unit, true)}`, phone: a.user.phone, badges: [{ text: "Morador", tone: "info" as const }] }));
  } else {
    const grantFilter: Prisma.AccessGrantWhereInput = {
      ...(tower === "condominio" ? { unitId: null } : tower ? { unit: { buildingId: tower } } : {}),
      ...(kind && kind !== "sem" && { kind }),
    };
    const where: Prisma.AccessPersonWhereInput = {
      condominiumId: condoId,
      ...(letterIds && { id: { in: letterIds } }),
      ...(kind === "sem" ? { grants: { none: {} } } : (tower || kind) && { grants: { some: grantFilter } }),
      ...(status === "impedidas" && { blockedAt: { not: null } }),
      ...(status === "liberadas" && { blockedAt: null }),
    };
    total = await db.accessPerson.count({ where });
    page = pageParam(sp.page, total, PAGE);
    const found = await db.accessPerson.findMany({ where, include: { grants: { select: { unitId: true, kind: true } } }, orderBy: { name: "asc" }, skip: (page - 1) * PAGE, take: PAGE });
    list = found.map((p) => {
      const kinds = [...new Set(p.grants.map((g) => KIND_LABEL[g.kind] ?? g.kind))].join(", ");
      const places = [...new Set(p.grants.map((g) => label(g.unitId)))];
      return {
        key: p.id, name: p.name, href: `/portaria/pessoa/${p.id}`, phone: p.phone,
        sub: [p.company, places.length ? `${kinds} · ${places.slice(0, 3).join(" + ")}${places.length > 3 ? ` +${places.length - 3}` : ""}` : "Sem autorização"].filter(Boolean).join(" · "),
        badges: p.blockedAt ? [{ text: "Impedida", tone: "bad" as const }] : [],
      };
    });
  }

  // Cabeçalho de letra a cada troca de inicial
  const initial = (n: string) => {
    const c = n.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
    return c >= "A" && c <= "Z" ? c : "#";
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-line p-4">
        <form action="/portaria" className="grid flex-1 gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <input type="hidden" name="aba" value="agenda" />
          {letter && <input type="hidden" name="letra" value={letter} />}
          <Select name="torre" defaultValue={tower}>
            <option value="">Todas as torres</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="condominio">Condomínio (sem unidade)</option>
          </Select>
          <Select name="tipo" defaultValue={kind}>
            <option value="">Todos os tipos</option>
            {(Object.keys(PERSON_KINDS) as PersonKind[]).map((k) => <option key={k} value={k}>{PERSON_KINDS[k].plural}</option>)}
            <option value="sem">Sem autorização</option>
            <option value="conta">Moradores com conta no app</option>
          </Select>
          {!accounts && (
            <Select name="situacao" defaultValue={status}>
              <option value="">Todas as situações</option>
              <option value="liberadas">Liberadas</option>
              <option value="impedidas">Impedidas</option>
            </Select>
          )}
          <button className={buttonClass("outline")}>Filtrar</button>
        </form>
      </div>

      <nav aria-label="Letras" className="flex flex-wrap gap-0.5 border-b border-line px-3 py-2">
        <Link href={href({ letra: undefined })} className={cx("rounded-lg px-2 py-1 text-xs font-semibold transition", !letter ? "bg-brand text-brand-ink" : "text-fg-2 hover:bg-bg-2")}>Todos</Link>
        {LETTERS.map((l) => {
          const n = counts.get(l) ?? 0;
          return n ? (
            <Link key={l} href={href({ letra: l })} title={`${n} contato(s)`} className={cx("min-w-7 rounded-lg px-1.5 py-1 text-center text-xs font-semibold transition", letter === l ? "bg-brand text-brand-ink" : "text-fg-2 hover:bg-bg-2")}>{l}</Link>
          ) : (
            <span key={l} className="min-w-7 px-1.5 py-1 text-center text-xs font-semibold text-muted/40">{l}</span>
          );
        })}
      </nav>

      {list.length ? (
        <ul>
          {list.map((c, i) => {
            const head = initial(c.name);
            const showHead = i === 0 || initial(list[i - 1].name) !== head;
            const body = (
              <>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{c.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted">{c.sub}</p>
                </div>
                {c.phone && <span className="hidden items-center gap-1 text-xs text-fg-2 sm:inline-flex"><Phone className="size-3" />{c.phone}</span>}
                {c.badges.map((b) => <Badge key={b.text} tone={b.tone}>{b.text}</Badge>)}
                {c.href && <ChevronRight className="size-4 shrink-0 text-muted" />}
              </>
            );
            return (
              <li key={c.key}>
                {showHead && <p className="sticky top-0 border-y border-line bg-bg-2 px-5 py-1 text-xs font-bold text-muted">{head}</p>}
                {c.href ? (
                  <Link href={c.href} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-0 hover:bg-bg-2">{body}</Link>
                ) : (
                  <div className="flex items-center gap-3 border-b border-line px-5 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted">Nenhum contato {letter ? `com a letra ${letter}` : ""} nesses filtros.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-sm text-muted">
        <Pager page={page} pageSize={PAGE} total={total} href={(p) => withPage("/portaria", params, p)} />
      </div>
    </div>
  );
}
