import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { deleteFolder, saveGenerated } from "./storage";
import { activateMembership } from "./memberships";
import { addDays, isDue, spNow } from "./checklist";
import { dayToDate } from "./finance";
import { nextProtocol } from "./orders";

// Condomínio de demonstração com dados fictícios em todas as áreas (OS com antes/depois,
// 4 meses de financeiro, 3 semanas de checklist, anotações, comunicados). Ninguém dos
// usuários fictícios consegue entrar: a senha é aleatória e descartada.

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
  const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
  const syndic = await db.user.findUnique({ where: { email: opts.syndicEmail } });
  if (!syndic) throw new Error(`Usuário ${opts.syndicEmail} não encontrado.`);

  // ───── Condomínio e estrutura
  const condo = await db.condominium.create({
    data: {
      name: "Residencial Vila das Acácias",
      slug: `vila-das-acacias-${tag}`,
      address: "Rua das Acácias, 350 — Curitiba, PR (fictício)",
      cnpj: "98.765.432/0001-10",
      phone: "(41) 3000-0350",
      email: "administracao@viladasacacias.demo",
      accentColor: "#0E9384",
      checklistDeadline: "09:00",
      demo: true,
      buildings: { create: [{ name: "Torre Ipê" }, { name: "Torre Jacarandá" }] },
    },
    include: { buildings: true },
  });
  const cid = condo.id;
  await db.unit.createMany({
    data: condo.buildings.flatMap((b) => Array.from({ length: 32 }, (_, i) => ({ buildingId: b.id, number: `${Math.floor(i / 4) + 1}0${(i % 4) + 1}`, floor: Math.floor(i / 4) + 1 }))),
  });
  const units = await db.unit.findMany({ where: { building: { condominiumId: cid } }, select: { id: true }, orderBy: [{ building: { name: "asc" } }, { floor: "asc" }, { number: "asc" }] });

  // ───── Pessoas fictícias (com vínculo) + síndico de verdade vinculado
  const mk = async (name: string, slug: string, role: string, extra: { company?: string; specialty?: string } = {}) => {
    const u = await db.user.create({ data: { name, email: `${slug}.${tag}@demo.condtrack.app`, role, condominiumId: cid, passwordHash, ...extra } });
    await db.membership.create({ data: { userId: u.id, condominiumId: cid, role } });
    return u;
  };
  const caretaker = await mk("Sebastião Rocha", "zelador", "caretaker");
  const painter = await mk("Fernanda Prado", "pintura", "provider", { company: "Prado Pinturas", specialty: "Pintura" });
  const electrician = await mk("Diego Martins", "eletrica", "provider", { company: "Martins Elétrica", specialty: "Elétrica" });
  const plumber = await mk("Rogério Batista", "hidraulica", "provider", { company: "Batista Hidráulica", specialty: "Hidráulica" });
  const council1 = await mk("Juliana Ferraz", "conselho1", "council");
  const council2 = await mk("Marcelo Antunes", "conselho2", "council");
  const res1 = await mk("Patrícia Lemos", "morador1", "resident");
  const res2 = await mk("Henrique Sales", "morador2", "resident");
  await db.userUnit.createMany({
    data: [
      { userId: council1.id, unitId: units[5].id, role: "owner" },
      { userId: council2.id, unitId: units[22].id, role: "owner" },
      { userId: res1.id, unitId: units[11].id, role: "tenant" },
      { userId: res2.id, unitId: units[40].id, role: "owner" },
    ],
  });

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
  for (const [name, icon, color] of catDefs) cats[name] = (await db.serviceCategory.create({ data: { condominiumId: cid, name, icon, color } })).id;
  const areaDefs: [string, number | null, boolean][] = [
    ["Hall de entrada", 40, false], ["Salão de festas", 90, true], ["Piscina", 35, true], ["Academia", 18, false],
    ["Garagem", null, false], ["Churrasqueira", 25, true], ["Playground", 20, false],
  ];
  const areas: Record<string, string> = {};
  for (const [name, capacity, reservable] of areaDefs) areas[name] = (await db.commonArea.create({ data: { condominiumId: cid, name, capacity, reservable } })).id;

  const itemDefs: [string, string | null, string | null, string][] = [
    ["Iluminação das áreas comuns", null, null, ""],
    ["Portões e interfones", "Hall de entrada", null, ""],
    ["Bombas d’água e reservatórios", null, "Pressão, ruídos e nível da caixa", ""],
    ["Limpeza do hall e elevadores", "Hall de entrada", null, ""],
    ["Piscina — cloro e pH", "Piscina", null, "1,3,5"],
    ["Extintores e rotas de fuga", null, "Validade e acesso livre", ""],
    ["Garagem — vazamentos e lâmpadas", "Garagem", null, ""],
    ["Playground — brinquedos e piso", "Playground", null, "2,4"],
  ];
  const items = [];
  for (const [i, [title, area, description, weekdays]] of itemDefs.entries()) {
    items.push(
      await db.checklistItem.create({
        data: { condominiumId: cid, title, description, commonAreaId: area ? areas[area] : null, frequency: weekdays ? "weekdays" : "daily", weekdays, sortOrder: i + 1, createdAt: new Date(now - 40 * DAY) },
      }),
    );
  }

  // ───── Ordens de serviço dos últimos 4 meses (todas as etapas)
  type Spec = { title: string; desc: string; cat: string; area?: string; unit?: number; priority: string; status: string; by: string; to?: string; daysAgo: number; dueIn?: number; hue?: number; report?: string; rating?: number; comment?: string };
  const S: Spec[] = [
    { title: "Pintura da garagem — faixas e pilares", desc: "Faixas apagadas e pilares com marcas de batidas.", cat: "Pintura", area: "Garagem", priority: "medium", status: "approved", by: caretaker.id, to: painter.id, daysAgo: 118, dueIn: -100, hue: 220, report: "Pilares lixados e pintados; faixas refeitas com tinta de demarcação.", rating: 5, comment: "Garagem ficou outra." },
    { title: "Troca do quadro de comando da bomba", desc: "Bomba de recalque desarmando à noite.", cat: "Elétrica", priority: "urgent", status: "approved", by: caretaker.id, to: electrician.id, daysAgo: 104, dueIn: -102, hue: 30, report: "Quadro substituído e relé térmico ajustado." },
    { title: "Vazamento na prumada da Torre Ipê", desc: "Infiltração no 3º andar, próximo ao shaft.", cat: "Hidráulica", priority: "high", status: "approved", by: council1.id, to: plumber.id, daysAgo: 96, dueIn: -90, hue: 200, report: "Trecho de tubulação trocado e parede recomposta.", rating: 4, comment: "Resolvido, mas demorou um pouco." },
    { title: "Poda das árvores do estacionamento", desc: "Galhos encostando nos carros.", cat: "Jardinagem", priority: "low", status: "approved", by: caretaker.id, to: painter.id, daysAgo: 82, dueIn: -70, hue: 110, report: "Poda de condução nas 6 árvores e limpeza do local." },
    { title: "Revisão do portão social", desc: "Fechadura eletromagnética falhando.", cat: "Serralheria", area: "Hall de entrada", priority: "high", status: "approved", by: res1.id, to: electrician.id, daysAgo: 70, dueIn: -66, hue: 0, report: "Eletroímã substituído e fonte revisada." },
    { title: "Repintura do salão de festas", desc: "Paredes manchadas após eventos.", cat: "Pintura", area: "Salão de festas", priority: "medium", status: "approved", by: council2.id, to: painter.id, daysAgo: 58, dueIn: -45, hue: 40, report: "Duas demãos de tinta acrílica acetinada.", rating: 5, comment: "Excelente acabamento." },
    { title: "Limpeza das calhas", desc: "Calhas entupidas antes do período de chuvas.", cat: "Limpeza", priority: "medium", status: "approved", by: caretaker.id, to: plumber.id, daysAgo: 47, dueIn: -40, hue: 190, report: "Calhas e condutores desobstruídos." },
    { title: "Luminárias do playground", desc: "Três postes sem iluminação.", cat: "Elétrica", area: "Playground", priority: "medium", status: "approved", by: council1.id, to: electrician.id, daysAgo: 35, dueIn: -28, hue: 260, report: "Reatores trocados por drivers LED." },
    { title: "Rejunte da piscina", desc: "Rejunte soltando na borda.", cat: "Limpeza", area: "Piscina", priority: "high", status: "approved", by: caretaker.id, to: painter.id, daysAgo: 24, dueIn: -15, hue: 185, report: "Rejunte epóxi refeito em toda a borda." },
    { title: "Pintura do muro frontal", desc: "Pichação no muro da entrada.", cat: "Pintura", priority: "high", status: "validated", by: caretaker.id, to: painter.id, daysAgo: 9, dueIn: 2, hue: 15, report: "Limpeza e repintura do muro." },
    { title: "Torneira da churrasqueira pingando", desc: "Torneira com vazamento constante.", cat: "Hidráulica", area: "Churrasqueira", priority: "low", status: "completed", by: res2.id, to: plumber.id, daysAgo: 6, dueIn: 3, hue: 205, report: "Reparo trocado e vedação refeita." },
    { title: "Elevador da Torre Jacarandá com ruído", desc: "Ruído metálico entre o 5º e o 6º andar.", cat: "Elevadores", priority: "urgent", status: "in_progress", by: council2.id, to: electrician.id, daysAgo: 4, dueIn: 1, hue: 280 },
    { title: "Tomadas da academia sem energia", desc: "Bancada das esteiras sem energia.", cat: "Elétrica", area: "Academia", priority: "high", status: "assigned", by: res1.id, to: electrician.id, daysAgo: 3, dueIn: -1 },
    { title: "Cerca viva do playground", desc: "Cerca viva alta, tampando a visão.", cat: "Jardinagem", area: "Playground", priority: "low", status: "assigned", by: caretaker.id, to: painter.id, daysAgo: 2, dueIn: 6 },
    { title: "Infiltração no teto do banheiro", desc: "Mancha crescendo no teto do banheiro social.", cat: "Hidráulica", unit: 11, priority: "medium", status: "open", by: res1.id, daysAgo: 1 },
    { title: "Lâmpadas queimadas no hall da Torre Ipê", desc: "Duas lâmpadas do hall apagadas.", cat: "Elétrica", area: "Hall de entrada", priority: "low", status: "open", by: caretaker.id, daysAgo: 0 },
    { title: "Grade da piscina enferrujada", desc: "Ferrugem na grade de proteção.", cat: "Serralheria", area: "Piscina", priority: "medium", status: "rejected", by: caretaker.id, to: painter.id, daysAgo: 12, dueIn: 4, hue: 25, report: "Lixamento e pintura com zarcão." },
    { title: "Limpeza dos vidros da fachada", desc: "Vidros do hall muito sujos.", cat: "Limpeza", area: "Hall de entrada", priority: "low", status: "cancelled", by: council1.id, daysAgo: 30 },
  ];
  const flow = ["open", "assigned", "in_progress", "completed", "validated", "approved"];
  let counter = 0;
  for (const s of S) {
    counter++;
    const created = new Date(now - s.daysAgo * DAY - 3 * 3600_000);
    const end = s.status === "approved" ? new Date(Math.min(now - DAY, created.getTime() + 9 * DAY)) : new Date(now - 3600_000);
    const step = (i: number) => new Date(created.getTime() + (i * (end.getTime() - created.getTime())) / 6);
    const idx = s.status === "rejected" ? 4 : s.status === "cancelled" ? 0 : flow.indexOf(s.status);
    const o = await db.serviceOrder.create({
      data: {
        protocol: await nextProtocol(cid),
        condominiumId: cid, title: s.title, description: s.desc, categoryId: cats[s.cat],
        locationType: s.area ? "common_area" : s.unit != null ? "unit" : "common_area",
        commonAreaId: s.area ? areas[s.area] : null, unitId: s.unit != null ? units[s.unit].id : null,
        priority: s.priority, status: s.status, dueDate: s.dueIn != null ? new Date(now + s.dueIn * DAY) : null,
        requestedById: s.by, assignedToId: s.to ?? null,
        assignedAt: idx >= 1 ? step(1) : null, startedAt: idx >= 2 ? step(2) : null, completedAt: idx >= 3 ? step(3) : null,
        validatedAt: idx >= 4 && s.status !== "rejected" ? step(4) : null, validatedById: idx >= 4 && s.status !== "rejected" ? caretaker.id : null,
        approvedAt: idx >= 5 ? step(5) : null, approvedById: idx >= 5 ? syndic.id : null,
        executionMinutes: idx >= 3 ? 60 + counter * 20 : null, serviceReport: idx >= 3 ? s.report : null,
        rating: s.rating ?? null, ratingComment: s.comment ?? null, createdAt: created,
      },
    });
    const ev = (type: string, userId: string, i: number, extra: { fromStatus?: string; toStatus?: string; comment?: string } = {}) =>
      db.serviceEvent.create({ data: { serviceOrderId: o.id, userId, type, createdAt: step(i), ...extra } });
    await ev("created", s.by, 0, { toStatus: "open", comment: "Ordem de serviço aberta." });
    if (s.status === "cancelled") await ev("status_change", syndic.id, 1, { fromStatus: "open", toStatus: "cancelled", comment: "Serviço incluído no contrato de limpeza; OS cancelada." });
    if (idx >= 1 && s.status !== "cancelled") await ev("assignment", syndic.id, 1, { fromStatus: "open", toStatus: "assigned", comment: "Prestador atribuído." });
    if (idx >= 2) await ev("status_change", s.to!, 2, { fromStatus: "assigned", toStatus: "in_progress", comment: "Serviço iniciado." });
    if (idx >= 3) await ev("status_change", s.to!, 3, { fromStatus: "in_progress", toStatus: "completed", comment: s.report });
    if (s.status === "rejected") await ev("rejection", caretaker.id, 4, { fromStatus: "completed", toStatus: "rejected", comment: "Ainda há pontos de ferrugem na lateral. Favor refazer." });
    else {
      if (idx >= 4) await ev("validation", caretaker.id, 4, { fromStatus: "completed", toStatus: "validated", comment: "Conferido no local." });
      if (idx >= 5) await ev("approval", syndic.id, 5, { fromStatus: "validated", toStatus: "approved", comment: "Aprovado." });
    }
    if (s.rating) await ev("rating", s.by, 6, { comment: `Avaliação ${s.rating}/5 — ${s.comment}` });
    if (s.hue != null && idx >= 2) {
      const url = await saveGenerated(o.id, "antes-demo.svg", scene("before", s.title, s.hue), "image/svg+xml");
      await db.serviceMedia.create({ data: { serviceOrderId: o.id, type: "photo", phase: "before", url, mimeType: "image/svg+xml", sizeBytes: 2000, uploadedById: s.to!, uploadedAt: step(2) } });
    }
    if (s.hue != null && idx >= 3) {
      const url = await saveGenerated(o.id, "depois-demo.svg", scene("after", s.title, s.hue), "image/svg+xml");
      await db.serviceMedia.create({ data: { serviceOrderId: o.id, type: "photo", phase: "after", url, mimeType: "image/svg+xml", sizeBytes: 2000, uploadedById: s.to!, uploadedAt: step(3) } });
    }
  }

  // ───── Checklist: últimas 3 semanas conferidas (com alguns problemas e anotações)
  const checks: { itemId: string; condominiumId: string; date: string; status: string; note?: string | null; userId: string; checkedAt: Date }[] = [];
  const issues: Record<number, [number, string]> = { 3: [6, "Lâmpada queimada perto da vaga 14."], 9: [2, "Bomba 2 com ruído; acompanhando."], 15: [1, "Interfone do bloco B sem áudio."] };
  for (let d = 21; d >= 1; d--) {
    const date = addDays(today, -d);
    for (const [k, it] of items.entries()) {
      if (!isDue(it, date)) continue;
      const issue = issues[d]?.[0] === k ? issues[d][1] : null;
      checks.push({ itemId: it.id, condominiumId: cid, date, status: issue ? "issue" : "ok", note: issue, userId: caretaker.id, checkedAt: at(date, `07:${pad(10 + k * 5)}`) });
    }
    if (d % 4 === 0) {
      await db.checklistNote.create({
        data: { condominiumId: cid, date, text: ["Entrega de material de limpeza recebida.", "Morador do 304 avisou barulho na casa de máquinas.", "Piscina com movimento alto no fim de semana.", "Portão da garagem revisado pela manhã.", "Coleta seletiva remarcada para quinta."][d % 5], userId: caretaker.id, userName: caretaker.name, createdAt: at(date, "10:30") },
      });
    }
  }
  // Hoje: parte conferida
  for (const [k, it] of items.entries()) {
    if (k > 3 || !isDue(it, today)) continue;
    checks.push({ itemId: it.id, condominiumId: cid, date: today, status: "ok", userId: caretaker.id, checkedAt: new Date(Math.min(now, at(today, `07:${pad(10 + k * 5)}`).getTime())) });
  }
  await db.checklistCheck.createMany({ data: checks });

  // ───── Financeiro: últimos 4 meses (mês atual com pendências)
  const ym = (offset: number) => {
    const [y, m] = today.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  };
  type F = { type: "income" | "expense"; cat: string; desc: string; who: string; cents: number; day: number; doc?: string; pm: string };
  const monthly: F[] = [
    { type: "income", cat: "Taxa condominial", desc: "Taxa condominial", who: "Condôminos (64 unidades)", cents: 4_864_000, day: 10, pm: "Boleto" },
    { type: "income", cat: "Fundo de reserva", desc: "Fundo de reserva", who: "Condôminos (64 unidades)", cents: 486_400, day: 10, pm: "Boleto" },
    { type: "expense", cat: "Folha de pagamento", desc: "Folha de pagamento", who: "Funcionários do condomínio", cents: 1_980_000, day: 5, pm: "Transferência" },
    { type: "expense", cat: "Encargos e impostos", desc: "INSS e FGTS", who: "Guias federais", cents: 642_000, day: 20, pm: "Débito automático" },
    { type: "expense", cat: "Energia", desc: "Energia das áreas comuns", who: "Distribuidora de energia", cents: 356_000, day: 22, doc: "Fatura", pm: "Débito automático" },
    { type: "expense", cat: "Água", desc: "Água e esgoto", who: "Companhia de saneamento", cents: 498_000, day: 18, doc: "Conta", pm: "Boleto" },
    { type: "expense", cat: "Elevadores", desc: "Manutenção dos elevadores", who: "Ascensus Elevadores", cents: 210_000, day: 15, doc: "NF", pm: "Boleto" },
    { type: "expense", cat: "Limpeza", desc: "Limpeza terceirizada", who: "Clean Max Serviços", cents: 260_000, day: 10, doc: "NF", pm: "Pix" },
    { type: "expense", cat: "Portaria e segurança", desc: "Portaria e vigilância", who: "Sentinela Segurança", cents: 1_040_000, day: 10, doc: "NF", pm: "Transferência" },
    { type: "expense", cat: "Administradora", desc: "Taxa da administradora", who: "Gestão Sul Administradora", cents: 220_000, day: 10, doc: "NF", pm: "Boleto" },
  ];
  const extras: Record<number, F[]> = {
    [-3]: [{ type: "expense", cat: "Seguros", desc: "Seguro predial anual", who: "Seguradora Horizonte", cents: 920_000, day: 8, doc: "Apólice", pm: "Boleto" }],
    [-2]: [
      { type: "expense", cat: "Obras e reformas", desc: "Repintura do salão de festas", who: "Prado Pinturas", cents: 1_150_000, day: 26, doc: "NF", pm: "Transferência" },
      { type: "income", cat: "Aluguel de áreas comuns", desc: "Aluguel do salão de festas", who: "Apto 502", cents: 50_000, day: 14, pm: "Pix" },
    ],
    [-1]: [
      { type: "expense", cat: "Piscina", desc: "Rejunte da piscina", who: "Prado Pinturas", cents: 380_000, day: 20, doc: "NF", pm: "Pix" },
      { type: "income", cat: "Multas e juros", desc: "Multas e juros por atraso", who: "Unidades em atraso", cents: 41_250, day: 28, pm: "Boleto" },
    ],
    [0]: [{ type: "expense", cat: "Manutenção", desc: "Reparo do elevador da Torre Jacarandá", who: "Ascensus Elevadores", cents: 640_000, day: 25, doc: "Orçamento aprovado", pm: "Boleto" }],
  };
  const todayDay = Number(today.slice(8));
  let docN = 1200;
  for (const offset of [-3, -2, -1, 0]) {
    const mes = ym(offset);
    for (const f of [...monthly, ...(extras[offset] ?? [])]) {
      const dueDay = Math.min(f.day, 28);
      const date = `${mes}-01`;
      const due = `${mes}-${pad(dueDay)}`;
      // Meses passados: tudo pago (menos uma conta vencida); mês atual: pago só o que já venceu
      const overdue = offset === -1 && f.cat === "Água";
      const paid = offset < 0 ? !overdue : dueDay < todayDay;
      const e = await db.financeEntry.create({
        data: {
          condominiumId: cid, type: f.type, category: f.cat, description: f.desc,
          counterparty: f.who, document: f.doc ? `${f.doc} ${docN++}` : null, amountCents: f.cents,
          date: dayToDate(date), dueDate: dayToDate(due), paidAt: paid ? dayToDate(due) : null, status: paid ? "paid" : "pending",
          paymentMethod: f.pm, createdById: syndic.id, updatedById: syndic.id, createdAt: at(date, "09:00"),
          notes: overdue ? "Conta extraviada; segunda via solicitada à companhia." : null,
        },
      });
      await db.financeLog.create({ data: { condominiumId: cid, entryId: e.id, userId: syndic.id, userName: syndic.name, userRole: "syndic", action: "created", createdAt: at(date, "09:00") } });
    }
  }

  // ───── Comunicados
  await db.announcement.createMany({
    data: [
      { condominiumId: cid, authorId: syndic.id, title: "Manutenção dos elevadores", content: "O elevador da Torre Jacarandá ficará parado na quinta-feira, das 9h às 12h, para manutenção.", category: "maintenance", publishedAt: new Date(now - 2 * DAY) },
      { condominiumId: cid, authorId: syndic.id, title: "Assembleia ordinária", content: "Convocamos todos para a assembleia no salão de festas, dia 20, às 19h30. Pauta: prestação de contas do trimestre.", category: "event", priority: "high", publishedAt: new Date(now - 6 * DAY) },
      { condominiumId: cid, authorId: syndic.id, title: "Coleta seletiva", content: "A coleta de recicláveis passa a ser às terças e quintas.", category: "general", publishedAt: new Date(now - 15 * DAY) },
    ],
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
