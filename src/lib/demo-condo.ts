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
import { docKey } from "./booking";
import {
  ACCENTS, ANNOUNCEMENTS, ASSEMBLY_NEXT, ASSEMBLY_PAST, CHECKLIST_ISSUES, CHECKLIST_NOTES, CITIES, CONDO_NAMES, DEMO_CONTACT_ROLES, DEMO_PAYMENT_TERMS, DEMO_SUPPLIERS, FIRST_F, FIRST_M,
  ONE_OFF_EXPENSES, ORDER_POOL, ORDER_STATUSES, PROVIDER_KINDS, RATING_COMMENTS, SURNAMES, TOWER_PAIRS, VENDORS,
  fakeCnpj, rng, slugifyName, type ProviderKind,
} from "./demo-data";

// Condomínio de demonstração com dados fictícios em todas as áreas (OS com antes/depois, financeiro do
// ano, 3 semanas de checklist, manutenção, orçamento, assembleias, comunicados, portaria, fornecedores). Cada geração sai diferente
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
    // Com muitos convidados as combinações podem acabar: depois de várias tentativas, entra um segundo sobrenome
    for (let tries = 0; ; tries++) {
      const n = `${r.pick(female ? FIRST_F : FIRST_M)} ${tries > 60 ? `${r.pick(SURNAMES)} ` : ""}${r.pick(SURNAMES)}`;
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
  // Áreas reserváveis com horário e regras (a piscina não precisa de aprovação)
  const areaRules: Record<string, { openTime: string; closeTime: string; bookingRules: string; requiresApproval: boolean }> = {
    "Salão de festas": { openTime: r.pick(["09:00", "10:00"]), closeTime: r.pick(["23:00", "00:00", "01:00"]), bookingRules: "Som até as 22h. Entregar o salão limpo e conferido pela portaria. Taxa de uso lançada na próxima cota.", requiresApproval: true },
    Piscina: { openTime: "08:00", closeTime: "20:00", bookingRules: "Reserva de uso exclusivo por até 4 horas. Proibido vidro na área da piscina.", requiresApproval: false },
    Churrasqueira: { openTime: "10:00", closeTime: r.pick(["22:00", "23:00"]), bookingRules: "Trazer o próprio carvão. Limpar a grelha ao final. Máximo de uma reserva por unidade no fim de semana.", requiresApproval: true },
  };
  for (const [areaName, capacity, reservable] of areaDefs) {
    areas[areaName] = (await db.commonArea.create({ data: { condominiumId: cid, name: areaName, capacity, reservable, ...(reservable && areaRules[areaName]) } })).id;
  }

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

  // ───── Portaria: porteiro, pessoas cadastradas nas unidades, reservas (passadas, de hoje e futuras) e entradas
  await seedGate({
    cid, r, person, now, today,
    doorman: await mk(person(r.next() < 0.3), "porteiro", "doorman"),
    homes: [
      { unitId: units[uC1].id, userId: council1.id },
      { unitId: units[uC2].id, userId: council2.id },
      { unitId: units[uR1].id, userId: res1.id },
      { unitId: units[uR2].id, userId: res2.id },
    ],
    unitIds: units.map((u) => u.id),
    deciders: [caretaker.id, syndic.id],
    areas: Object.entries(areaRules).map(([n, rule]) => ({ id: areas[n], name: n, ...rule })),
  });

  // ───── Fornecedores: agenda e orçamentos (aguardando, comparação do mesmo serviço, aprovados e recusados)
  await seedSuppliers({ cid, r, person, now, ddd: place.ddd, size: U / 64, caretaker, syndic });

  return condo;
}

/** PDF de uma página com o texto do orçamento fictício (Helvetica, sem biblioteca). */
function demoQuotePdf(lines: string[]) {
  const latin = (t: string) => t.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\xff]/g, "").replace(/[\\()]/g, "\\$&");
  const wrap = (t: string, n = 88) => t.split(" ").reduce<string[]>((acc, w) => {
    const last = acc[acc.length - 1];
    if (last !== undefined && (last + " " + w).length <= n) acc[acc.length - 1] = `${last} ${w}`;
    else acc.push(w);
    return acc;
  }, []);
  const body = lines.flatMap((l, i) => (i === 0 ? [l] : wrap(l))).map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 20} Td (${latin(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/**
 * Fornecedores fictícios: 8 ramos sorteados, um serviço com 3 orçamentos para comparar (um com a validade vencida)
 * e um orçamento por fornecedor nos outros ramos (aprovados, recusados, aguardando e um cancelado), cada um com PDF.
 */
async function seedSuppliers(c: {
  cid: string; r: Rng; person: (female: boolean) => string; now: number; ddd: string; size: number;
  caretaker: { id: string; name: string }; syndic: { id: string; name: string };
}) {
  const { cid, r, now } = c;
  const slug = (n: string) => slugifyName(n).replace(/-/g, "");
  const phone = () => `(${c.ddd}) 9${r.int(8100, 9999)}-${String(r.int(0, 9999)).padStart(4, "0")}`;
  const kinds = r.shuffle(DEMO_SUPPLIERS).slice(0, 8);
  // O ramo da comparação precisa de 3 fornecedores
  const compare = kinds.find((k) => k.names.length >= 3) ?? kinds[0];

  type Made = { id: string; name: string; contact: string };
  const made = new Map<string, Made[]>();
  for (const k of kinds) {
    const names = r.shuffle(k.names).slice(0, k === compare ? 3 : r.int(1, 2));
    for (const name of names) {
      const contact = c.person(r.next() < 0.4);
      const s = await db.supplier.create({
        data: {
          condominiumId: cid, name, category: k.category, contactName: `${contact} (${r.pick(DEMO_CONTACT_ROLES)})`,
          phone: phone(), email: `orcamento.${slug(name)}@example.com`, document: fakeCnpj(r),
          address: r.next() < 0.6 ? `Rua ${r.pick(SURNAMES)}, ${r.int(10, 1800)} (fictício)` : null,
          notes: r.next() < 0.4 ? r.pick(["Atende de segunda a sábado, das 8h às 18h.", "Já prestou serviço no condomínio; pontual.", "Pede visita técnica antes de orçar.", "Emite nota fiscal eletrônica."]) : null,
          rating: r.next() < 0.7 ? r.int(3, 5) : null,
          createdById: c.caretaker.id, createdByName: c.caretaker.name, createdAt: new Date(now - r.int(40, 120) * DAY),
        },
      });
      made.set(k.category, [...(made.get(k.category) ?? []), { id: s.id, name, contact }]);
    }
  }

  const pdfFor = async (quoteId: string, supplier: string, title: string, desc: string, cents: number, deadline: string, pay: string, at: Date) => {
    const brl = (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const lines = [supplier, `Orçamento: ${title}`, `Data: ${at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, desc, `Valor total: ${brl}`, `Prazo de execução: ${deadline}`, `Pagamento: ${pay}`, "", "Documento fictício gerado para o condomínio de demonstração do Condtrack."];
    const buf = demoQuotePdf(lines);
    const url = await saveGenerated(`quote-${cid}`, `${quoteId}.pdf`, buf, "application/pdf");
    await db.supplierQuoteFile.create({ data: { quoteId, url, fileName: `Orçamento ${supplier}.pdf`, mimeType: "application/pdf", sizeBytes: buf.length, uploadedById: c.caretaker.id, createdAt: at } });
  };
  const quote = async (sup: Made, svc: (typeof DEMO_SUPPLIERS)[number]["services"][number], status: string, ageDays: number, opts: { cents?: number; expired?: boolean } = {}) => {
    const createdAt = new Date(now - ageDays * DAY - r.int(1, 8) * 3_600_000);
    // Orçamento de verdade vem em valor redondo (dezenas de reais)
    const cents = opts.cents ?? Math.round(r.vary(Math.round(svc.cents * Math.max(c.size, 0.6)), 0.15) / 1000) * 1000;
    const pay = r.pick(DEMO_PAYMENT_TERMS);
    const validUntil = new Date((opts.expired ? now - r.int(1, 5) * DAY : createdAt.getTime() + r.pick([15, 30, 45]) * DAY));
    const decided = status !== "pending";
    const decidedAt = decided ? new Date(Math.min(now - DAY / 2, createdAt.getTime() + r.int(1, 4) * DAY)) : null;
    const q = await db.supplierQuote.create({
      data: {
        condominiumId: cid, supplierId: sup.id, title: svc.title, description: svc.desc, amountCents: cents, validUntil, deadline: svc.deadline, paymentTerms: pay,
        status, createdById: c.caretaker.id, createdByName: c.caretaker.name, createdAt,
        ...(decided && {
          decidedAt,
          decidedById: status === "cancelled" ? c.caretaker.id : c.syndic.id,
          decidedByName: status === "cancelled" ? c.caretaker.name : c.syndic.name,
          decisionNote: status === "approved"
            ? r.pick([null, "Aprovado. Combinar o início com o zelador.", "Aprovado dentro do previsto no orçamento do ano.", "Aprovado; pedir a nota fiscal no fim do serviço."])
            : status === "rejected" ? r.pick(["Valor acima do previsto; pedir outra cotação.", "Prazo longo demais para esta época.", "Vamos esperar a assembleia para decidir."]) : null,
        }),
      },
    });
    await pdfFor(q.id, sup.name, svc.title, svc.desc, cents, svc.deadline, pay, createdAt);
  };

  // Comparação: mesmo serviço, 3 fornecedores, todos aguardando (o mais antigo com a validade vencida)
  const svc = compare.services[0];
  for (const [i, sup] of made.get(compare.category)!.entries()) await quote(sup, svc, "pending", r.int(1, 9) + i * 3, { expired: i === 2 });

  // Demais ramos: um orçamento cada, com situações variadas
  const statuses = r.shuffle(["approved", "approved", "approved", "rejected", "pending", "pending", "cancelled"]);
  let n = 0;
  for (const k of kinds) {
    if (k === compare) continue;
    const status = statuses[n++ % statuses.length];
    await quote(made.get(k.category)![0], r.pick(k.services), status, status === "pending" ? r.int(0, 6) : r.int(8, 70));
  }
}

type Rng = ReturnType<typeof rng>;
type GateArea = { id: string; name: string; closeTime: string | null; requiresApproval: boolean };

/**
 * Dados fictícios da portaria: pessoas nas unidades com morador, reservas (passadas com convidados que chegaram,
 * uma hoje, futuras aprovadas e pendentes) e entradas dos últimos 7 dias. Usado pelo gerador de demonstração e
 * pelo botão do superadmin em condomínios que já existem.
 */
async function seedGate(c: {
  cid: string; r: Rng; person: (female: boolean) => string; now: number; today: string;
  doorman: { id: string; name: string }; homes: { unitId: string; userId: string }[]; unitIds: string[]; deciders: string[]; areas: GateArea[];
}) {
  const { cid, r, person, now, today, doorman, homes } = c;
  const doc = () => `${r.int(100, 999)}.${r.int(100, 999)}.${r.int(100, 999)}-${pad(r.int(0, 99))}`;
  // Pessoas da portaria: cada uma uma vez, com autorizações por unidade (ou para o condomínio)
  const grant = (personId: string, unitId: string | null, kind: string, createdById: string, createdByName: string, extra: { weekdays?: string; timeFrom?: string; timeTo?: string; validFrom?: Date; validUntil?: Date; notes?: string | null } = {}) =>
    db.accessGrant.create({ data: { condominiumId: cid, personId, unitId, kind, createdById, createdByName, ...extra } });
  const newPerson = (name: string, company: string | null = null) => {
    const document = r.next() < 0.7 ? doc() : null;
    return db.accessPerson.create({ data: { condominiumId: cid, name, document, docKey: docKey(document), company, phone: r.next() < 0.5 ? `(11) 9${r.int(1000, 9999)}-${r.int(1000, 9999)}` : null, createdById: doorman.id } });
  };
  const names = new Map((await db.user.findMany({ where: { id: { in: homes.map((h) => h.userId) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  let peopleCount = 0;
  const providerPeople: { personId: string; unitId: string | null; weekdays: string }[] = [];
  for (const h of homes) {
    const by = names.get(h.userId) ?? "Morador";
    for (let i = 0; i < r.int(0, 2); i++) {
      const p = await newPerson(person(r.next() < 0.5));
      await grant(p.id, h.unitId, "resident", h.userId, by, { notes: r.pick([null, "Filho(a)", "Cônjuge", "Mãe"]) });
      peopleCount++;
    }
    for (let i = 0; i < r.int(1, 2); i++) {
      const p = await newPerson(person(r.next() < 0.5));
      const expired = r.next() < 0.25;
      await grant(p.id, h.unitId, "visitor", h.userId, by, {
        ...(expired ? { validUntil: at(addDays(today, -r.int(3, 20)), "00:00") } : r.next() < 0.4 ? { validFrom: at(today, "00:00"), validUntil: at(today, "00:00") } : r.next() < 0.5 ? { weekdays: "0" } : {}),
        notes: r.pick([null, "Pode subir sem interfonar.", "Avó, visita aos domingos."]),
      });
      peopleCount++;
    }
  }
  // Diarista que atende duas unidades em dias diferentes (o caso da mesma pessoa em várias unidades)
  if (homes.length >= 2) {
    const [h1, h2] = r.shuffle(homes).slice(0, 2);
    const p = await newPerson(person(true), "Diarista");
    const d1 = String(r.pick([1, 2, 3]));
    const d2 = String(r.pick([4, 5]));
    await grant(p.id, h1.unitId, "provider", h1.userId, names.get(h1.userId) ?? "Morador", { weekdays: d1, timeFrom: "08:00", timeTo: "17:00" });
    await grant(p.id, h2.unitId, "provider", h2.userId, names.get(h2.userId) ?? "Morador", { weekdays: d2, timeFrom: "08:00", timeTo: "14:00" });
    providerPeople.push({ personId: p.id, unitId: h1.unitId, weekdays: d1 }, { personId: p.id, unitId: h2.unitId, weekdays: d2 });
    peopleCount++;
  }
  for (const h of homes.slice(0, 2)) {
    const p = await newPerson(person(r.next() < 0.6), r.pick(["Babá", "Personal trainer", "Cuidadora", "Passeador de cães"]));
    const wd = r.pick(["1,3,5", "2,4", "1,2,3,4,5"]);
    await grant(p.id, h.unitId, "provider", h.userId, names.get(h.userId) ?? "Morador", { weekdays: wd, timeFrom: "07:00", timeTo: "19:00" });
    providerPeople.push({ personId: p.id, unitId: h.unitId, weekdays: wd });
    peopleCount++;
  }
  // Prestador do condomínio (sem unidade), autorizado pela administração
  const gardener = await newPerson(person(false), "Jardinagem");
  await grant(gardener.id, null, "provider", doorman.id, doorman.name, { weekdays: "3", timeFrom: "07:00", timeTo: "16:00", notes: "Manutenção dos jardins" });
  providerPeople.push({ personId: gardener.id, unitId: null, weekdays: "3" });
  peopleCount++;

  const usedSlots = new Set<string>();
  const occasions = ["Aniversário", "Confraternização da família", "Churrasco com amigos", "Chá de bebê", "Aniversário infantil", "Encontro da turma", ""];
  const plan = [
    ...Array.from({ length: r.int(5, 8) }, () => ({ offset: -r.int(1, 60), status: r.next() < 0.85 ? "approved" : r.pick(["rejected", "cancelled"]) })),
    { offset: 0, status: "approved" },
    ...Array.from({ length: r.int(2, 4) }, () => ({ offset: r.int(1, 40), status: "approved" })),
    ...Array.from({ length: r.int(2, 3) }, () => ({ offset: r.int(2, 30), status: "pending" })),
  ];
  let bookings = 0;
  for (const p of plan) {
    if (!c.areas.length || !homes.length) break;
    const area = r.pick(c.areas);
    const day = addDays(today, p.offset);
    if (usedSlots.has(`${area.id}|${day}`)) continue;
    usedSlots.add(`${area.id}|${day}`);
    const pool = /piscina/i.test(area.name);
    const [start, end] = pool ? [r.pick(["09:00", "10:00", "14:00"]), r.pick(["13:00", "18:00"])] : [r.pick(["12:00", "18:00", "19:00"]), area.closeTime ?? "23:00"];
    const startAt = at(day, start);
    const endAt = at(day, end);
    if (endAt <= startAt) endAt.setUTCDate(endAt.getUTCDate() + 1);
    // Não sobrepõe reservas que já existam no condomínio
    if (await db.booking.count({ where: { commonAreaId: area.id, status: { in: ["pending", "approved"] }, startAt: { lt: endAt }, endAt: { gt: startAt } } })) continue;
    const home = r.pick(homes);
    const status = area.requiresApproval ? p.status : p.status === "pending" ? "approved" : p.status;
    const past = endAt.getTime() < now;
    const guests = Array.from({ length: r.int(4, pool ? 10 : 20) }, () => ({ name: person(r.next() < 0.5), document: r.next() < 0.4 ? doc() : null }));
    const decided = status === "approved" || status === "rejected";
    const b = await db.booking.create({
      data: {
        condominiumId: cid, commonAreaId: area.id, unitId: home.unitId, requestedById: home.userId, startAt, endAt, status,
        notes: r.pick(occasions),
        createdAt: new Date(Math.min(startAt.getTime(), now) - r.int(3, 20) * DAY),
        ...(decided && { decidedById: area.requiresApproval ? r.pick([doorman.id, ...c.deciders]) : null, decidedAt: new Date(Math.min(startAt.getTime(), now) - r.int(1, 2) * DAY) }),
        ...(status === "rejected" && { decisionNote: r.pick(["Área em manutenção nesse dia.", "Já existe evento do condomínio nesse horário."]) }),
        ...(status === "cancelled" && { cancelledAt: new Date(startAt.getTime() - r.int(1, 3) * DAY), decisionNote: "Mudança de planos." }),
        guests: { create: guests },
      },
      include: { guests: true },
    });
    bookings++;
    // Reservas que já aconteceram: a maioria dos convidados chegou, registrada pelo porteiro
    if (past && status === "approved") {
      for (const g of b.guests.filter(() => r.next() < 0.85)) {
        const when = new Date(startAt.getTime() + r.int(0, 90) * 60_000);
        await db.bookingGuest.update({ where: { id: g.id }, data: { checkedInAt: when, checkedInById: doorman.id } });
        await db.accessEntry.create({ data: { condominiumId: cid, unitId: home.unitId, guestId: g.id, kind: "guest", name: g.name, document: g.document, notes: `Convidado: ${area.name}`, createdById: doorman.id, createdBy: doorman.name, createdAt: when, ...(endAt.getTime() < now && { exitedAt: endAt, exitedById: doorman.id }), dests: { create: [{ unitId: home.unitId }] } } });
      }
    }
  }

  // Entradas dos últimos 7 dias: prestadores autorizados nos dias deles e visitas/entregas avulsas
  let entries = 0;
  const exit = (when: Date) => (now - when.getTime() > 3 * 3600_000 || r.next() < 0.5 ? { exitedAt: new Date(Math.min(now - 60_000, when.getTime() + r.int(15, 480) * 60_000)), exitedById: doorman.id } : {});
  for (let d = 6; d >= 0; d--) {
    const day = addDays(today, -d);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    for (const pp of providerPeople.filter((x) => x.weekdays.split(",").includes(String(dow)))) {
      const when = at(day, `0${r.int(7, 8)}:${pad(r.int(0, 59))}`);
      if (when.getTime() > now || r.next() < 0.15) continue;
      const p = await db.accessPerson.findUnique({ where: { id: pp.personId } });
      await db.accessEntry.create({ data: { condominiumId: cid, unitId: pp.unitId, personId: pp.personId, kind: "provider", name: p!.name, document: p!.document, createdById: doorman.id, createdBy: doorman.name, createdAt: when, ...exit(when), dests: { create: pp.unitId ? [{ unitId: pp.unitId }] : [] } } });
      entries++;
    }
    for (let i = 0; i < r.int(2, 5); i++) {
      const when = at(day, `${pad(r.int(8, 20))}:${pad(r.int(0, 59))}`);
      if (when.getTime() > now) continue;
      const kind = r.pick(["visitor", "visitor", "delivery", "provider"]);
      const dests = kind === "delivery" && r.next() < 0.4 ? r.shuffle(c.unitIds).slice(0, r.int(2, 3)) : [r.next() < 0.6 && homes.length ? r.pick(homes).unitId : r.pick(c.unitIds)];
      await db.accessEntry.create({
        data: {
          condominiumId: cid, unitId: dests[0], kind, name: kind === "delivery" ? r.pick(["Entregador Mercado Livre", "Entregador iFood", "Correios", "Entregador Amazon"]) : person(r.next() < 0.5),
          document: r.next() < 0.5 ? doc() : null,
          notes: kind === "provider" ? r.pick(["Técnico de internet", "Manutenção do ar-condicionado", "Montador de móveis"]) : kind === "delivery" ? r.pick(["Pacotes", "Mercado", null]) : r.pick([null, null, "Placa ABC1D23", "Visita rápida"]),
          createdById: doorman.id, createdBy: doorman.name, createdAt: when, ...exit(when),
          dests: { create: dests.map((unitId) => ({ unitId })) },
        },
      });
      entries++;
    }
  }
  // Encomendas: algumas aguardando (uma parada há mais de uma semana) e outras já retiradas
  const carriers = ["Correios", "Mercado Livre", "Amazon", "Shopee", "Magalu"];
  const spots = ["Armário 1", "Armário 2", "Armário 3", "Prateleira A", "Prateleira B"];
  let parcels = 0;
  for (let i = 0; i < r.int(6, 10); i++) {
    const unitId = homes.length && r.next() < 0.6 ? r.pick(homes).unitId : r.pick(c.unitIds);
    const ago = i === 0 ? r.int(8, 12) : r.int(0, 6);
    const receivedAt = new Date(Math.min(now - 5 * 60_000, at(addDays(today, -ago), `${pad(r.int(8, 19))}:${pad(r.int(0, 59))}`).getTime()));
    const delivered = i > 2 && r.next() < 0.6;
    const carrier = r.pick(carriers);
    await db.parcel.create({
      data: {
        condominiumId: cid, unitId, carrier, description: r.pick([null, "Caixa pequena", "Caixa média", "Envelope", "Pacote grande"]), volumes: r.next() < 0.15 ? 2 : 1,
        location: r.pick(spots), recipient: r.next() < 0.5 ? person(r.next() < 0.5) : null,
        receivedAt, receivedById: doorman.id, receivedByName: doorman.name,
        ...(delivered && { status: "delivered", deliveredAt: new Date(Math.min(now - 60_000, receivedAt.getTime() + r.int(1, 30) * 3600_000)), deliveredTo: person(r.next() < 0.5), deliveredById: doorman.id, deliveredByName: doorman.name }),
      },
    });
    parcels++;
  }

  return { people: peopleCount, bookings, entries, parcels };
}

/** Regras padrão quando a área ainda não tem horário (pelo nome). */
const RULES_BY_NAME: [RegExp, { openTime: string; closeTime: string; bookingRules: string; requiresApproval: boolean }][] = [
  [/sal[aã]o|festa|gourmet/i, { openTime: "10:00", closeTime: "00:00", bookingRules: "Som até as 22h. Entregar o espaço limpo e conferido pela portaria. Taxa de uso lançada na próxima cota.", requiresApproval: true }],
  [/churras/i, { openTime: "10:00", closeTime: "22:00", bookingRules: "Trazer o próprio carvão. Limpar a grelha ao final.", requiresApproval: true }],
  [/piscina/i, { openTime: "08:00", closeTime: "20:00", bookingRules: "Uso exclusivo por até 4 horas. Proibido vidro na área da piscina.", requiresApproval: false }],
  [/quadra|campo|esporte/i, { openTime: "07:00", closeTime: "22:00", bookingRules: "Reserva de até 2 horas. Calçado adequado.", requiresApproval: false }],
];

/**
 * Superadmin: acrescenta porteiro fictício, pessoas nas unidades, reservas e entradas a um condomínio que já existe
 * (ex.: o condomínio de apresentação). Áreas de festa, churrasqueira, piscina e quadra viram reserváveis com regras.
 */
export async function addGateDemo(cid: string) {
  const condo = await db.condominium.findUnique({ where: { id: cid }, select: { id: true, name: true, deletedAt: true } });
  if (!condo || condo.deletedAt) throw new Error("Condomínio não encontrado.");
  if (await db.booking.count({ where: { condominiumId: cid } })) throw new Error("Este condomínio já tem reservas; os dados fictícios só entram em quem ainda não tem.");
  const now = Date.now();
  const today = spNow(now).date;
  const tag = randomBytes(3).toString("hex");
  const r = rng(randomBytes(4).readUInt32BE(0));

  // Nomes fictícios sem repetir os que já existem no condomínio
  const used = new Set((await db.user.findMany({ where: { memberships: { some: { condominiumId: cid } } }, select: { name: true } })).map((u) => u.name));
  const person = (female: boolean) => {
    for (let tries = 0; ; tries++) {
      const n = `${r.pick(female ? FIRST_F : FIRST_M)} ${tries > 60 ? `${r.pick(SURNAMES)} ` : ""}${r.pick(SURNAMES)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };

  // Áreas: as que já são reserváveis; senão, as que parecem de festa/lazer
  const all = await db.commonArea.findMany({ where: { condominiumId: cid } });
  const areas: GateArea[] = [];
  for (const a of all) {
    const rule = RULES_BY_NAME.find(([re]) => re.test(a.name))?.[1];
    if (!a.reservable && !rule) continue;
    if (!a.reservable || (!a.openTime && rule)) {
      const data = { reservable: true, ...(!a.openTime && rule ? rule : {}) };
      await db.commonArea.update({ where: { id: a.id }, data });
      areas.push({ id: a.id, name: a.name, closeTime: (data as { closeTime?: string }).closeTime ?? a.closeTime, requiresApproval: rule && !a.openTime ? rule.requiresApproval : a.requiresApproval });
    } else {
      areas.push({ id: a.id, name: a.name, closeTime: a.closeTime, requiresApproval: a.requiresApproval });
    }
  }
  if (!areas.length) throw new Error("Nenhuma área comum serve para reserva (salão, churrasqueira, piscina ou quadra). Marque uma como reservável em Estrutura.");

  const units = await db.unit.findMany({ where: { building: { condominiumId: cid } }, select: { id: true, residents: { select: { userId: true } } } });
  if (!units.length) throw new Error("O condomínio não tem unidades cadastradas.");
  const homes = units.flatMap((u) => u.residents.slice(0, 1).map((x) => ({ unitId: u.id, userId: x.userId }))).slice(0, 8);
  const staff = await db.user.findMany({ where: { memberships: { some: { condominiumId: cid, role: { in: ["syndic", "caretaker"] } } }, status: "active" }, select: { id: true } });
  // Sem moradores com conta: as reservas ficam em nome do síndico, em unidades sorteadas
  if (!homes.length && staff.length) homes.push(...r.shuffle(units).slice(0, 4).map((u) => ({ unitId: u.id, userId: staff[0].id })));

  const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
  const doormanName = person(r.next() < 0.3);
  const doorman = await db.user.create({ data: { name: doormanName, email: `porteiro.${tag}@demo.condtrack.app`, role: "doorman", condominiumId: cid, passwordHash } });
  await db.membership.create({ data: { userId: doorman.id, condominiumId: cid, role: "doorman" } });

  const res = await seedGate({ cid, r, person, now, today, doorman, homes, unitIds: units.map((u) => u.id), deciders: staff.map((s) => s.id), areas });
  return { name: condo.name, doorman: doormanName, areas: areas.length, ...res };
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
  for (const p of await db.parcel.findMany({ where: { condominiumId: id, photoUrl: { not: null } }, select: { id: true } })) await deleteFolder(`parcel-${p.id}`).catch(() => null);
  await deleteFolder(`quote-${id}`).catch(() => null);

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
