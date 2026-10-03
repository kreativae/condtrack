import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { deleteFolder, saveGenerated } from "./storage";
import { activateMembership } from "./memberships";
import { addDays, isDue, spNow } from "./checklist";
import { dayToDate } from "./finance";
import { nextProtocol } from "./orders";
import { loadAssembly, minutesDraft } from "./assembly-server";
import { DEFAULT_OPTIONS } from "./assembly";
import {
  ACCENTS, ANNOUNCEMENTS, ASSEMBLY_NEXT, ASSEMBLY_PAST, CHECKLIST_ISSUES, CHECKLIST_NOTES, CITIES, CONDO_NAMES, FIRST_F, FIRST_M,
  ONE_OFF_EXPENSES, ORDER_POOL, ORDER_STATUSES, PROVIDER_KINDS, RATING_COMMENTS, SURNAMES, TOWER_PAIRS, VENDORS,
  fakeCnpj, rng, slugifyName, type ProviderKind,
} from "./demo-data";

// Condomínio de demonstração com dados fictícios em todas as áreas (OS com antes/depois, financeiro do
// ano, 3 semanas de checklist, manutenção, orçamento, assembleias, comunicados). Cada geração sai diferente
// (sorteio em demo-data.ts). Ninguém dos usuários fictícios consegue entrar: a senha é aleatória e descartada.

const DAY = 86_400_000;

function scene(kind: "before" | "after", title: string, hue: number) {
  const dirty = kind === "before";
  const wall = dirty ? `hsl(${hue} 12% 34%)` : `hsl(${hue} 18% 78%)`;
  const floor = dirty ? `hsl(${hue} 10% 22%)` : `hsl(${hue} 14% 58%)`;
  const marks = dirty
    ? Array.from({ length: 14 }, (_, i) => {
        const x = ((i * 97) % 760) + 20, y = ((i * 53) % 300) + 40, r = 18 + ((i * 7) % 40);
        return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.6}" fill="#000" opacity="${0.12 + (i % 4) * 0.05}"/>`;
      }).join("")
    : `<rect width="800" height="360" fill="url(#s)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500"><defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="800" height="360" fill="${wall}"/>${marks}<rect y="360" width="800" height="140" fill="${floor}"/><text x="32" y="470" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="28" fill="#fff" opacity=".85">${title.replace(/[<&>]/g, "")}</text><text x="768" y="470" text-anchor="end" font-family="Helvetica,Arial" font-size="18" letter-spacing="3" fill="#fff" opacity=".7">${dirty ? "ANTES" : "DEPOIS"}</text></svg>`;
}

/** Data/hora no fuso de Brasília a partir de "YYYY-MM-DD" + "HH:MM". */
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`);
const pad = (n: number) => String(n).padStart(2, "0");

export async function createDemoCondominium(opts: { syndicEmail: string }) {
  const now = Date.now();
  const today = spNow(now).date;
  const tag = randomBytes(3).toString("hex");
  const r = rng(randomBytes(4).readUInt32BE(0));
  const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
  const syndic = await db.user.findUnique({ where: { email: opts.syndicEmail } });
  if (!syndic) throw new Error(`Usuário ${opts.syndicEmail} não encontrado.`);

  // ───── Sorteio do perfil: nome que ainda não existe, cidade, torres, porte
  const taken = new Set((await db.condominium.findMany({ select: { name: true } })).map((c) => c.name));
  const name = r.shuffle(CONDO_NAMES).find((n) => !taken.has(n)) ?? `${r.pick(CONDO_NAMES)} ${tag.slice(0, 2).toUpperCase()}`;
  const place = r.pick(CITIES);
  const [T1, T2] = r.pick(TOWER_PAIRS);
  const floors = r.int(6, 12);
  const perFloor = r.int(2, 4);
  const towers = (s: string) => s.replaceAll("{T1}", T1).replaceAll("{T2}", T2);

  // ───── Condomínio e estrutura
  const condo = await db.condominium.create({
    data: {
      name,
      slug: `${slugifyName(name)}-${tag}`,
      address: `${r.pick(place.streets)}, ${r.int(80, 2400)} — ${place.city}, ${place.uf} (fictício)`,
      cnpj: fakeCnpj(r),
      phone: `(${place.ddd}) 3${r.int(100, 999)}-${String(r.int(0, 9999)).padStart(4, "0")}`,
      email: `administracao@${slugifyName(name).replace(/-/g, "")}.demo`,
      accentColor: r.pick(ACCENTS),
      checklistDeadline: r.pick(["08:30", "09:00", "09:30", "10:00"]),
      demo: true,
      buildings: { create: [{ name: T1 }, { name: T2 }] },
    },
    include: { buildings: true },
  });
  const cid = condo.id;
  await db.unit.createMany({
    data: condo.buildings.flatMap((b) =>
      Array.from({ length: floors * perFloor }, (_, i) => ({ buildingId: b.id, number: `${Math.floor(i / perFloor) + 1}0${(i % perFloor) + 1}`, floor: Math.floor(i / perFloor) + 1 })),
    ),
  });
  const units = await db.unit.findMany({ where: { building: { condominiumId: cid } }, select: { id: true, number: true }, orderBy: [{ building: { name: "asc" } }, { floor: "asc" }, { number: "asc" }] });
  const U = units.length;

  // ───── Pessoas fictícias (nomes sorteados, sem repetir) + síndico de verdade vinculado
  const used = new Set<string>();
  const person = (female: boolean) => {
    for (;;) {
      const n = `${r.pick(female ? FIRST_F : FIRST_M)} ${r.pick(SURNAMES)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };
  const mk = async (fullName: string, slug: string, role: string, extra: { company?: string; specialty?: string } = {}) => {
    const u = await db.user.create({ data: { name: fullName, email: `${slug}.${tag}@demo.condtrack.app`, role, condominiumId: cid, passwordHash, ...extra } });
    await db.membership.create({ data: { userId: u.id, condominiumId: cid, role } });
    return u;
  };
  const caretaker = await mk(person(r.next() < 0.3), "zelador", "caretaker");
  const providers = {} as Record<ProviderKind, Awaited<ReturnType<typeof mk>>>;
  for (const kind of Object.keys(PROVIDER_KINDS) as ProviderKind[]) {
    const n = person(r.next() < 0.4);
    const k = PROVIDER_KINDS[kind];
    providers[kind] = await mk(n, kind, "provider", { company: `${n.split(" ")[1]} ${r.pick(k.suffixes)}`, specialty: k.specialty });
  }
  const providerFor = (cat: string) => (Object.keys(PROVIDER_KINDS) as ProviderKind[]).map((k) => (PROVIDER_KINDS[k].cats as readonly string[]).includes(cat) ? providers[k] : null).find(Boolean) ?? providers.geral;
  const council1 = await mk(person(true), "conselho1", "council");
  const council2 = await mk(person(false), "conselho2", "council");
  const res1 = await mk(person(true), "morador1", "resident");
  const res2 = await mk(person(false), "morador2", "resident");
  const [uC1, uC2, uR1, uR2] = r.shuffle(units.map((_, i) => i)).slice(0, 4);
  await db.userUnit.createMany({
    data: [
      { userId: council1.id, unitId: units[uC1].id, role: "owner" },
      { userId: council2.id, unitId: units[uC2].id, role: "owner" },
      { userId: res1.id, unitId: units[uR1].id, role: "tenant" },
      { userId: res2.id, unitId: units[uR2].id, role: "owner" },
    ],
  });
  const owners = new Map([[units[uC1].id, council1.id], [units[uC2].id, council2.id], [units[uR2].id, res2.id]]);

  // Vínculo como síndico (com as permissões extras); o condomínio ativo dele não muda
  await db.membership.upsert({
    where: { userId_condominiumId: { userId: syndic.id, condominiumId: cid } },
    create: { userId: syndic.id, condominiumId: cid, role: "syndic", permissions: "checklist_edit,audit" },
    update: { role: "syndic", permissions: "checklist_edit,audit" },
  });

  // ───── Categorias, áreas e itens do checklist
  const catDefs: [string, string, string][] = [
    ["Pintura", "paintbrush", "#5B5BD6"], ["Elétrica", "zap", "#F39C12"], ["Hidráulica", "droplets", "#3498DB"], ["Limpeza", "sparkles", "#2ECC71"],
    ["Jardinagem", "leaf", "#27AE60"], ["Serralheria", "hammer", "#8A8A8A"], ["Elevadores", "arrow-up-down", "#9B59B6"],
  ];
  const cats: Record<string, string> = {};
  for (const [catName, icon, color] of catDefs) cats[catName] = (await db.serviceCategory.create({ data: { condominiumId: cid, name: catName, icon, color } })).id;
  const areaDefs: [string, number | null, boolean][] = [
    ["Hall de entrada", r.int(20, 50), false], ["Salão de festas", r.int(60, 120), true], ["Piscina", r.int(20, 45), true], ["Academia", r.int(10, 25), false],
    ["Garagem", null, false], ["Churrasqueira", r.int(15, 35), true], ["Playground", r.int(15, 30), false],
  ];
  const areas: Record<string, string> = {};
  for (const [areaName, capacity, reservable] of areaDefs) areas[areaName] = (await db.commonArea.create({ data: { condominiumId: cid, name: areaName, capacity, reservable } })).id;

  const itemDefs: [string, string | null, string | null, string][] = [
    ["Iluminação das áreas comuns", null, null, ""],
    ["Portões e interfones", "Hall de entrada", null, ""],
    ["Bombas d’água e reservatórios", null, "Pressão, ruídos e nível da caixa", ""],
    ["Limpeza do hall e elevadores", "Hall de entrada", null, ""],
    ["Piscina: cloro e pH", "Piscina", null, "1,3,5"],
    ["Extintores e rotas de fuga", null, "Validade e acesso livre", ""],
    ["Garagem: vazamentos e lâmpadas", "Garagem", null, ""],
    ["Playground: brinquedos e piso", "Playground", null, "2,4"],
  ];
  const items = [];
  for (const [i, [title, area, description, weekdays]] of itemDefs.entries()) {
    items.push(
      await db.checklistItem.create({
        data: { condominiumId: cid, title, description, commonAreaId: area ? areas[area] : null, frequency: weekdays ? "weekdays" : "daily", weekdays, sortOrder: i + 1, createdAt: new Date(now - 40 * DAY) },
      }),
    );
  }

  // ───── Ordens de serviço dos últimos 4 meses (sorteadas do banco; todas as etapas)
  const requesters = [caretaker, caretaker, council1, council2, res1, res2];
  const picked = r.shuffle(ORDER_POOL).slice(0, ORDER_STATUSES.length);
  // Datas: aprovadas espalhadas nos últimos 4 meses (mais antigas primeiro); as demais, recentes
  const approvedDays = Array.from({ length: 9 }, () => r.int(15, 120)).sort((a, b) => b - a);
  const flow = ["open", "assigned", "in_progress", "completed", "validated", "approved"];
  for (const [i, tpl] of picked.entries()) {
    const status = ORDER_STATUSES[i];
    const title = towers(tpl.title);
    const desc = towers(tpl.desc);
    const daysAgo = status === "approved" ? approvedDays[i] : status === "cancelled" ? r.int(20, 50) : status === "open" ? r.int(0, 2) : r.int(2, 12);
    const by = tpl.unit ? (r.next() < 0.5 ? res1 : council1) : r.pick(requesters);
    const to = status === "open" || status === "cancelled" ? null : providerFor(tpl.cat);
    const priority = r.pick(["low", "medium", "medium", "high", "urgent"]);
    const hue = r.int(0, 359);
    const rating = status === "approved" && r.next() < 0.45 ? r.weighted([0.55, 0.35, 0.1]) : null;
    const stars = rating == null ? null : [5, 4, 3][rating];
    const created = new Date(now - daysAgo * DAY - r.int(1, 10) * 3600_000);
    const end = status === "approved" ? new Date(Math.min(now - DAY, created.getTime() + r.int(3, 14) * DAY)) : new Date(now - 3600_000);
    const step = (k: number) => new Date(created.getTime() + (k * (end.getTime() - created.getTime())) / 6);
    const idx = status === "rejected" ? 4 : status === "cancelled" ? 0 : flow.indexOf(status);
    const dueIn = status === "approved" ? -daysAgo + r.int(5, 15) : status === "open" || status === "cancelled" ? null : r.int(-2, 8);
    const unitIdx = tpl.unit ? (by.id === res1.id ? uR1 : uC1) : null;
    const o = await db.serviceOrder.create({
      data: {
        protocol: await nextProtocol(cid),
        condominiumId: cid, title, description: desc, categoryId: cats[tpl.cat],
        locationType: unitIdx != null ? "unit" : "common_area",
        commonAreaId: tpl.area ? areas[tpl.area] : null, unitId: unitIdx != null ? units[unitIdx].id : null,
        priority, status, dueDate: dueIn != null ? new Date(now + dueIn * DAY) : null,
        requestedById: by.id, assignedToId: to?.id ?? null,
        assignedAt: idx >= 1 ? step(1) : null, startedAt: idx >= 2 ? step(2) : null, completedAt: idx >= 3 ? step(3) : null,
        validatedAt: idx >= 4 && status !== "rejected" ? step(4) : null, validatedById: idx >= 4 && status !== "rejected" ? caretaker.id : null,
        approvedAt: idx >= 5 ? step(5) : null, approvedById: idx >= 5 ? syndic.id : null,
        executionMinutes: idx >= 3 ? r.int(45, 480) : null, serviceReport: idx >= 3 ? tpl.report : null,
        rating: stars, ratingComment: stars ? r.pick(RATING_COMMENTS[stars]) : null, createdAt: created,
      },
    });
    const ev = (type: string, userId: string, k: number, extra: { fromStatus?: string; toStatus?: string; comment?: string | null } = {}) =>
      db.serviceEvent.create({ data: { serviceOrderId: o.id, userId, type, createdAt: step(k), ...extra } });
    await ev("created", by.id, 0, { toStatus: "open", comment: "Ordem de serviço aberta." });
    if (status === "cancelled") await ev("status_change", syndic.id, 1, { fromStatus: "open", toStatus: "cancelled", comment: "Serviço incluído em contrato existente; OS cancelada." });
    if (idx >= 1 && status !== "cancelled") await ev("assignment", syndic.id, 1, { fromStatus: "open", toStatus: "assigned", comment: "Prestador atribuído." });
    if (idx >= 2) await ev("status_change", to!.id, 2, { fromStatus: "assigned", toStatus: "in_progress", comment: "Serviço iniciado." });
    if (idx >= 3) await ev("status_change", to!.id, 3, { fromStatus: "in_progress", toStatus: "completed", comment: tpl.report });
    if (status === "rejected") await ev("rejection", caretaker.id, 4, { fromStatus: "completed", toStatus: "rejected", comment: "Ainda há pontos a corrigir. Favor refazer." });
    else {
      if (idx >= 4) await ev("validation", caretaker.id, 4, { fromStatus: "completed", toStatus: "validated", comment: "Conferido no local." });
      if (idx >= 5) await ev("approval", syndic.id, 5, { fromStatus: "validated", toStatus: "approved", comment: "Aprovado." });
    }
    if (stars) await ev("rating", by.id, 6, { comment: `Avaliação ${stars}/5` });
    if (idx >= 2) {
      const url = await saveGenerated(o.id, "antes-demo.svg", scene("before", title, hue), "image/svg+xml");
      await db.serviceMedia.create({ data: { serviceOrderId: o.id, type: "photo", phase: "before", url, mimeType: "image/svg+xml", sizeBytes: 2000, uploadedById: to!.id, uploadedAt: step(2) } });
    }
    if (idx >= 3) {
      const url = await saveGenerated(o.id, "depois-demo.svg", scene("after", title, hue), "image/svg+xml");
      await db.serviceMedia.create({ data: { serviceOrderId: o.id, type: "photo", phase: "after", url, mimeType: "image/svg+xml", sizeBytes: 2000, uploadedById: to!.id, uploadedAt: step(3) } });
    }
  }

  // ───── Checklist: últimas 3 semanas conferidas (problemas e anotações sorteados)
  const checks: { itemId: string; condominiumId: string; date: string; status: string; note?: string | null; userId: string; checkedAt: Date }[] = [];
  const issueNotes = r.shuffle(CHECKLIST_ISSUES);
  const issues = new Map<number, [number, string]>();
  for (const [n, d] of r.shuffle(Array.from({ length: 20 }, (_, i) => i + 1)).slice(0, r.int(2, 5)).entries()) issues.set(d, [r.int(0, items.length - 1), issueNotes[n]]);
  const noteDays = new Set(r.shuffle(Array.from({ length: 21 }, (_, i) => i + 1)).slice(0, r.int(4, 7)));
  const notes = r.shuffle(CHECKLIST_NOTES);
  const startMin = r.int(0, 40);
  for (let d = 21; d >= 1; d--) {
    const date = addDays(today, -d);
    for (const [k, it] of items.entries()) {
      if (!isDue(it, date)) continue;
      const issue = issues.get(d)?.[0] === k ? issues.get(d)![1] : null;
      const min = startMin + k * 4 + r.int(0, 3);
      checks.push({ itemId: it.id, condominiumId: cid, date, status: issue ? "issue" : "ok", note: issue, userId: caretaker.id, checkedAt: at(date, `0${7 + Math.floor(min / 60)}:${pad(min % 60)}`) });
    }
    if (noteDays.has(d)) {
      await db.checklistNote.create({ data: { condominiumId: cid, date, text: notes[d % notes.length], userId: caretaker.id, userName: caretaker.name, createdAt: at(date, `1${r.int(0, 6)}:${pad(r.int(0, 59))}`) } });
    }
  }
  // Hoje: parte conferida
  const doneToday = r.int(2, 5);
  for (const [k, it] of items.entries()) {
    if (k >= doneToday || !isDue(it, today)) continue;
    checks.push({ itemId: it.id, condominiumId: cid, date: today, status: "ok", userId: caretaker.id, checkedAt: new Date(Math.min(now, at(today, `07:${pad(10 + k * 5)}`).getTime())) });
  }
  await db.checklistCheck.createMany({ data: checks });

  // ───── Financeiro: do início do ano (mínimo 4 meses) até o mês atual. Valores proporcionais ao porte.
  const ym = (offset: number) => {
    const [y, m] = today.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  };
  const size = U / 64;
  const fee = r.int(42, 89) * 1000; // taxa por unidade (centavos, de R$ 420 a R$ 890)
  const vendor = (cat: string) => r.pick(VENDORS[cat] ?? ["Fornecedor"]);
  type F = { type: "income" | "expense"; cat: string; desc: string; who: string; cents: number; day: number; doc?: string; pm: string; monthlyVary?: number };
  const monthly: F[] = [
    { type: "income", cat: "Taxa condominial", desc: "Taxa condominial", who: `Condôminos (${U} unidades)`, cents: U * fee, day: 10, pm: "Boleto" },
    { type: "income", cat: "Fundo de reserva", desc: "Fundo de reserva", who: `Condôminos (${U} unidades)`, cents: Math.round(U * fee * 0.1), day: 10, pm: "Boleto" },
    { type: "expense", cat: "Folha de pagamento", desc: "Folha de pagamento", who: "Funcionários do condomínio", cents: r.vary(1_980_000 * size, 0.15), day: 5, pm: "Transferência" },
    { type: "expense", cat: "Encargos e impostos", desc: "INSS e FGTS", who: "Guias federais", cents: r.vary(642_000 * size, 0.15), day: 20, pm: "Débito automático" },
    { type: "expense", cat: "Energia", desc: "Energia das áreas comuns", who: vendor("Energia"), cents: r.vary(356_000 * size, 0.2), day: 22, doc: "Fatura", pm: "Débito automático", monthlyVary: 0.08 },
    { type: "expense", cat: "Água", desc: "Água e esgoto", who: vendor("Água"), cents: r.vary(498_000 * size, 0.2), day: 18, doc: "Conta", pm: "Boleto", monthlyVary: 0.08 },
    { type: "expense", cat: "Elevadores", desc: "Manutenção dos elevadores", who: vendor("Elevadores"), cents: r.vary(210_000, 0.2), day: 15, doc: "NF", pm: "Boleto" },
    { type: "expense", cat: "Limpeza", desc: "Limpeza terceirizada", who: vendor("Limpeza"), cents: r.vary(260_000 * size, 0.2), day: 10, doc: "NF", pm: "Pix" },
    { type: "expense", cat: "Portaria e segurança", desc: "Portaria e vigilância", who: vendor("Portaria e segurança"), cents: r.vary(1_040_000, 0.2), day: 10, doc: "NF", pm: "Transferência" },
    { type: "expense", cat: "Administradora", desc: "Taxa da administradora", who: vendor("Administradora"), cents: r.vary(220_000 * size, 0.15), day: 10, doc: "NF", pm: "Boleto" },
  ];
  const monthsBack = Math.max(4, Number(today.slice(5, 7)));
  const offsets = Array.from({ length: monthsBack }, (_, i) => i - monthsBack + 1);
  // Avulsos sorteados: seguro num mês, 2 a 4 despesas e receitas extras espalhadas
  const extras = new Map<number, F[]>();
  const addExtra = (off: number, f: F) => extras.set(off, [...(extras.get(off) ?? []), f]);
  addExtra(r.pick(offsets.slice(0, -1)), { type: "expense", cat: "Seguros", desc: "Seguro predial anual", who: vendor("Seguros"), cents: r.vary(920_000 * size, 0.2), day: 8, doc: "Apólice", pm: "Boleto" });
  for (const x of r.shuffle(ONE_OFF_EXPENSES).slice(0, r.int(2, 4))) addExtra(r.pick(offsets), { type: "expense", cat: x.cat, desc: x.desc, who: providers.geral.company ?? "Prestador", cents: r.vary(x.cents * Math.max(size, 0.6), 0.25), day: r.int(12, 27), doc: "NF", pm: r.pick(["Pix", "Transferência", "Boleto"]) });
  for (let i = r.int(1, 3); i > 0; i--) addExtra(r.pick(offsets), { type: "income", cat: "Aluguel de áreas comuns", desc: "Aluguel do salão de festas", who: `Unidade ${r.pick(units).number}`, cents: r.int(25, 60) * 1000, day: r.int(5, 25), pm: "Pix" });
  addExtra(-1, { type: "income", cat: "Multas e juros", desc: "Multas e juros por atraso", who: "Unidades em atraso", cents: r.int(15, 60) * 1000, day: 28, pm: "Boleto" });
  const overdueCat = r.pick(["Água", "Energia", "Limpeza", "Administradora"]);
  const todayDay = Number(today.slice(8));
  let docN = r.int(1000, 8000);
  const spent = new Map<string, number>();
  for (const offset of offsets) {
    const mes = ym(offset);
    for (const f of [...monthly, ...(extras.get(offset) ?? [])]) {
      const dueDay = Math.min(f.day, 28);
      const date = `${mes}-01`;
      const due = `${mes}-${pad(dueDay)}`;
      const cents = f.monthlyVary ? r.vary(f.cents, f.monthlyVary) : f.cents;
      // Meses passados: tudo pago (menos uma conta vencida); mês atual: pago só o que já venceu
      const overdue = offset === -1 && f.cat === overdueCat;
      const paid = offset < 0 ? !overdue : dueDay < todayDay;
      spent.set(`${f.type}:${f.cat}`, (spent.get(`${f.type}:${f.cat}`) ?? 0) + cents);
      const e = await db.financeEntry.create({
        data: {
          condominiumId: cid, type: f.type, category: f.cat, description: f.desc,
          counterparty: f.who, document: f.doc ? `${f.doc} ${docN++}` : null, amountCents: cents,
          date: dayToDate(date), dueDate: dayToDate(due), paidAt: paid ? dayToDate(due) : null, status: paid ? "paid" : "pending",
          paymentMethod: f.pm, createdById: syndic.id, updatedById: syndic.id, createdAt: at(date, "09:00"),
          notes: overdue ? "Conta extraviada; segunda via solicitada." : null,
        },
      });
      await db.financeLog.create({ data: { condominiumId: cid, entryId: e.id, userId: syndic.id, userName: syndic.name, userRole: "syndic", action: "created", createdAt: at(date, "09:00") } });
    }
  }

  // ───── Manutenção preventiva (um documento perto de vencer, para o aviso aparecer)
  const avcb = addDays(today, r.int(10, 60));
  await db.maintenancePlan.createMany({
    data: [
      { condominiumId: cid, kind: "service", title: "Limpeza da caixa d’água", description: "Limpeza e desinfecção dos reservatórios, com certificado.", categoryId: cats["Hidráulica"], providerId: providers.hidraulica.id, every: 6, unit: "month", nextDue: addDays(today, r.int(20, 150)), leadDays: 15, createdById: syndic.id },
      { condominiumId: cid, kind: "service", title: "Manutenção dos elevadores", description: "Visita mensal da conservadora.", categoryId: cats["Elevadores"], providerId: providers.eletrica.id, every: 1, unit: "month", nextDue: addDays(today, r.int(8, 28)), leadDays: 5, createdById: syndic.id },
      { condominiumId: cid, kind: "service", title: "Dedetização e desratização", description: "Controle de pragas nas áreas comuns.", categoryId: cats["Limpeza"], every: 6, unit: "month", nextDue: addDays(today, r.int(30, 170)), leadDays: 15, createdById: syndic.id },
      { condominiumId: cid, kind: "document", title: "AVCB (Auto de Vistoria do Corpo de Bombeiros)", description: "Renovação exige vistoria.", every: 3, unit: "year", nextDue: avcb, leadDays: 90, alertedFor: avcb, createdById: syndic.id },
      { condominiumId: cid, kind: "document", title: "Seguro predial obrigatório", description: "Apólice contra incêndio.", every: 1, unit: "year", nextDue: addDays(today, r.int(90, 330)), leadDays: 30, createdById: syndic.id },
      { condominiumId: cid, kind: "document", title: "Laudo do SPDA (para-raios)", every: 1, unit: "year", nextDue: addDays(today, r.int(60, 300)), leadDays: 30, createdById: syndic.id },
    ],
  });

  // ───── Orçamento do ano: a partir do que foi lançado, projetado para 12 meses, com folga ou aperto sorteados
  const budgetYear = Number(today.slice(0, 4));
  const months = Math.max(1, offsets.filter((o) => ym(o).startsWith(String(budgetYear))).length);
  const budget = [...spent.entries()].map(([k, total]) => {
    const [type, category] = k.split(":");
    const recurring = monthly.some((m) => m.cat === category);
    const yearly = recurring ? (total / Math.max(months, monthsBack)) * 12 : total * r.int(10, 18) / 10;
    return { type, category, amountCents: Math.round(r.vary(yearly, 0.08) / 1000) * 1000 };
  });
  await db.financeBudget.createMany({ data: budget.map((b) => ({ ...b, condominiumId: cid, year: budgetYear, updatedById: syndic.id })) });

  // ───── Assembleias: uma encerrada (com ata) e uma com votação aberta. Votos de unidades sem dono cadastrado ficam sem autor.
  const voteOpts = JSON.stringify(DEFAULT_OPTIONS);
  const pastTpl = r.pick(ASSEMBLY_PAST);
  const pastAgo = r.int(25, 70);
  const past = await db.assembly.create({
    data: {
      condominiumId: cid, title: pastTpl.title, kind: "ordinary", location: r.pick(["salão de festas", "salão de festas e online", "online"]),
      description: "Prestação de contas e deliberações do período.",
      meetingAt: new Date(now - pastAgo * DAY), votingEndsAt: new Date(now - (pastAgo - 1) * DAY), publishedAt: new Date(now - (pastAgo + 8) * DAY), closedAt: new Date(now - (pastAgo - 1) * DAY),
      status: "closed", createdById: syndic.id,
      items: { create: pastTpl.items.map((it, position) => ({ position, title: it.title, options: it.options ? JSON.stringify(it.options) : voteOpts })) },
    },
    include: { items: { orderBy: { position: "asc" } } },
  });
  const turnout = r.shuffle(units).slice(0, Math.round(U * (r.int(45, 80) / 100)));
  const pastVotes = turnout.flatMap((u) =>
    past.items.map((it) => {
      const n = JSON.parse(it.options).length;
      const lean = Array.from({ length: n }, (_, i) => (i === 0 ? 0.55 : 0.45 / (n - 1)));
      return { itemId: it.id, option: r.weighted(lean), assemblyId: past.id, unitId: u.id, userId: owners.get(u.id) ?? null, createdAt: new Date(now - (pastAgo + 2) * DAY) };
    }),
  );
  await db.assemblyVote.createMany({ data: pastVotes });
  const full = await loadAssembly(past.id);
  if (full) await db.assembly.update({ where: { id: past.id }, data: { minutes: minutesDraft(full, U, new Date(now - (pastAgo - 1) * DAY)), minutesUpdatedAt: new Date(now - (pastAgo - 2) * DAY) } });

  const nextTpl = r.pick(ASSEMBLY_NEXT);
  const nextIn = r.int(4, 12);
  const next = await db.assembly.create({
    data: {
      condominiumId: cid, title: nextTpl.title, kind: "extraordinary", location: "salão de festas e online",
      description: towers(nextTpl.desc),
      meetingAt: new Date(now + nextIn * DAY), votingEndsAt: new Date(now + nextIn * DAY + 3 * 3600_000), publishedAt: new Date(now - r.int(1, 4) * DAY),
      status: "open", createdById: syndic.id,
      items: { create: [{ position: 0, title: towers(nextTpl.item), description: towers(nextTpl.desc), options: voteOpts }] },
    },
    include: { items: true },
  });
  // Votação em andamento: sem as unidades dos proprietários fictícios (eles podem votar na demonstração)
  const openVoters = r.shuffle(units.filter((u) => !owners.has(u.id))).slice(0, Math.round(U * (r.int(15, 40) / 100)));
  await db.assemblyVote.createMany({
    data: openVoters.map((u) => ({ assemblyId: next.id, itemId: next.items[0].id, unitId: u.id, userId: null, option: r.weighted([0.6, 0.3, 0.1]) })),
  });

  // ───── Comunicados (sorteados)
  await db.announcement.createMany({
    data: r.shuffle(ANNOUNCEMENTS).slice(0, r.int(3, 5)).map((a, i) => ({
      condominiumId: cid, authorId: syndic.id, title: a.title, content: towers(a.content), category: a.category, priority: a.priority ?? "normal",
      publishedAt: new Date(now - (i * r.int(3, 9) + r.int(1, 3)) * DAY),
    })),
  });

  return condo;
}

/**
 * Exclui um condomínio de demonstração com tudo o que foi gerado: OS e mídias, financeiro, checklist,
 * comunicados e as pessoas fictícias. Quem é real e estava com ele ativo passa para outro vínculo.
 * Só funciona em condomínios marcados como demo; os de verdade nunca são apagados aqui.
 */
export async function deleteDemoCondominium(id: string) {
  const condo = await db.condominium.findUnique({ where: { id }, select: { id: true, name: true, demo: true } });
  if (!condo?.demo) return null;

  const orders = await db.serviceOrder.findMany({ where: { condominiumId: id }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  for (const o of orderIds) await deleteFolder(o).catch(() => null);

  // Pessoas fictícias: e-mail da demonstração e nenhum vínculo com outro condomínio
  const fake = await db.user.findMany({
    where: { email: { endsWith: "@demo.condtrack.app" }, memberships: { some: { condominiumId: id }, every: { condominiumId: id } } },
    select: { id: true },
  });
  const fakeIds = fake.map((u) => u.id);

  // Pessoas reais com a demonstração ativa: ativa outro vínculo (ou fica sem condomínio)
  const active = await db.user.findMany({ where: { condominiumId: id, id: { notIn: fakeIds } }, select: { id: true } });
  for (const u of active) {
    const other = await db.membership.findFirst({ where: { userId: u.id, condominiumId: { not: id } }, orderBy: { createdAt: "asc" } });
    if (other) await activateMembership(u.id, other.condominiumId);
  }

  await db.$transaction([
    db.notification.deleteMany({ where: { referenceType: "service_order", referenceId: { in: orderIds } } }),
    db.user.deleteMany({ where: { id: { in: fakeIds } } }),
    db.condominium.delete({ where: { id } }),
  ]);
  return { name: condo.name, people: fakeIds.length, orders: orderIds.length };
}
