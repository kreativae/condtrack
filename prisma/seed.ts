import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { del, list, put } from "@vercel/blob";
import { ensureDefaultPlans } from "../src/lib/default-plans";
import path from "node:path";

const db = new PrismaClient();
const ROOT = path.resolve(process.env.UPLOAD_DIR || "./storage");
const PASSWORD = "condtrack123";

const hours = (h: number) => new Date(Date.now() + h * 3600_000);

function scene(kind: "before" | "after", title: string, hue: number) {
  const dirty = kind === "before";
  const wall = dirty ? `hsl(${hue} 12% 34%)` : `hsl(${hue} 18% 78%)`;
  const floor = dirty ? `hsl(${hue} 10% 22%)` : `hsl(${hue} 14% 58%)`;
  const stains = dirty
    ? Array.from({ length: 14 }, (_, i) => {
        const x = (i * 97) % 760 + 20, y = (i * 53) % 300 + 40, r = 18 + ((i * 7) % 40);
        return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.6}" fill="#000" opacity="${0.12 + (i % 4) * 0.05}"/>`;
      }).join("") +
      `<path d="M420 40 L445 120 L430 180 L460 260 L450 340" stroke="#111" stroke-width="3" fill="none" opacity=".55"/>`
    : `<rect x="0" y="0" width="800" height="360" fill="url(#shine)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
<defs><linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect width="800" height="360" fill="${wall}"/>${stains}
<rect y="360" width="800" height="140" fill="${floor}"/>
<rect x="560" y="120" width="150" height="240" fill="${dirty ? "#2a2520" : "#3b3226"}" stroke="${dirty ? "#1a1a1a" : "#5B5BD6"}" stroke-width="4"/>
<circle cx="690" cy="245" r="6" fill="#D6D3CC"/>
<text x="32" y="470" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="28" fill="#fff" opacity=".85">${title}</text>
<text x="768" y="470" text-anchor="end" font-family="Helvetica,Arial" font-size="18" letter-spacing="3" fill="#fff" opacity=".7">${dirty ? "ANTES" : "DEPOIS"}</text>
</svg>`;
}

// Mesmo esquema de lib/storage.ts: Vercel Blob (privado) se houver token, senão disco
const useBlob = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

async function svgMedia(orderId: string, kind: "before" | "after", title: string, hue: number) {
  const name = `${kind}-seed.svg`;
  if (useBlob) {
    await put(`os/${orderId}/${name}`, scene(kind, title, hue), { access: "private", contentType: "image/svg+xml", addRandomSuffix: false, allowOverwrite: true });
  } else {
    const dir = path.join(ROOT, orderId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), scene(kind, title, hue));
  }
  return `/api/media/${orderId}/${name}`;
}

/** Remove mídias antigas (o seed recria todas as OS). */
async function clearMedia() {
  if (!useBlob) return rm(ROOT, { recursive: true, force: true });
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "os/", cursor, limit: 1000 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

async function main() {
  await clearMedia();
  for (const m of [
    db.checklistCheck, db.checklistItem, db.auditLog, db.payment, db.subscription, db.notification, db.serviceEvent, db.serviceMedia, db.serviceOrder, db.announcement,
    db.serviceCategory, db.commonArea, db.userUnit, db.unit, db.building, db.user, db.condominium,
  ] as unknown as { deleteMany: () => Promise<unknown> }[]) {
    await m.deleteMany();
  }

  // Planos padrão (upsert: preserva os IDs do Stripe entre execuções do seed)
  await ensureDefaultPlans(db);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const mkUser = (data: { name: string; email: string; role: string; condominiumId?: string; company?: string; specialty?: string; phone?: string }) =>
    db.user.create({ data: { ...data, passwordHash } });

  await mkUser({ name: "Administrador Condtrack", email: "admin@condtrack.app", role: "superadmin" });

  const condo = await db.condominium.create({
    data: {
      name: "Odyssey Residence",
      slug: "odyssey-residence",
      address: "Av. Atlântica, 1200 — Rio de Janeiro, RJ",
      cnpj: "12.345.678/0001-90",
      phone: "(21) 3000-1200",
      email: "administracao@odysseyresidence.com.br",
      buildings: { create: [{ name: "Torre Aurora" }, { name: "Torre Horizonte" }] },
    },
    include: { buildings: true },
  });
  const condo2 = await db.condominium.create({
    data: { name: "Maison Belvedere", slug: "maison-belvedere", address: "Rua Oscar Freire, 500 — São Paulo, SP", buildings: { create: [{ name: "Bloco Único" }] } },
    include: { buildings: true },
  });

  const [aurora, horizonte] = condo.buildings;
  const units = [];
  for (const b of [aurora, horizonte]) {
    for (let floor = 1; floor <= 6; floor++) {
      for (const n of [1, 2]) {
        units.push(await db.unit.create({ data: { buildingId: b.id, number: `${floor}0${n}`, floor } }));
      }
    }
  }
  for (let floor = 1; floor <= 4; floor++) await db.unit.create({ data: { buildingId: condo2.buildings[0].id, number: `${floor}01`, floor } });

  const cid = condo.id;
  const syndic = await mkUser({ name: "Helena Duarte", email: "sindico@condtrack.app", role: "syndic", condominiumId: cid, phone: "(21) 99999-0001" });
  const caretaker = await mkUser({ name: "José Almeida", email: "zelador@condtrack.app", role: "caretaker", condominiumId: cid, phone: "(21) 99999-0002" });
  const painter = await mkUser({ name: "Ricardo Lima", email: "prestador@condtrack.app", role: "provider", condominiumId: cid, company: "Lima Pinturas", specialty: "Pintura" });
  const electrician = await mkUser({ name: "Marcos Tavares", email: "eletrica@condtrack.app", role: "provider", condominiumId: cid, company: "Voltare Elétrica", specialty: "Elétrica" });
  const plumber = await mkUser({ name: "Paulo Nunes", email: "hidraulica@condtrack.app", role: "provider", condominiumId: cid, company: "Hidro Nunes", specialty: "Hidráulica" });
  const resident = await mkUser({ name: "Ana Carvalho", email: "conselho@condtrack.app", role: "council", condominiumId: cid });
  const resident2 = await mkUser({ name: "Bruno Siqueira", email: "bruno@condtrack.app", role: "council", condominiumId: cid });
  const viewer = await mkUser({ name: "Lucas Moreira", email: "morador@condtrack.app", role: "resident", condominiumId: cid });
  await mkUser({ name: "Carla Mendes", email: "sindico2@condtrack.app", role: "syndic", condominiumId: condo2.id });

  await db.userUnit.create({ data: { userId: resident.id, unitId: units[4].id, role: "owner" } });
  await db.userUnit.create({ data: { userId: resident2.id, unitId: units[15].id, role: "tenant" } });
  await db.userUnit.create({ data: { userId: viewer.id, unitId: units[9].id, role: "owner" } });

  const cats = Object.fromEntries(
    await Promise.all(
      [
        ["Pintura", "paintbrush", "#5B5BD6"],
        ["Elétrica", "zap", "#F39C12"],
        ["Hidráulica", "droplets", "#3498DB"],
        ["Limpeza", "sparkles", "#2ECC71"],
        ["Jardinagem", "leaf", "#27AE60"],
        ["Serralheria", "hammer", "#8A8A8A"],
        ["Elevadores", "arrow-up-down", "#9B59B6"],
      ].map(async ([name, icon, color]) => [name, await db.serviceCategory.create({ data: { condominiumId: cid, name, icon, color } })]),
    ),
  );
  const areas = Object.fromEntries(
    await Promise.all(
      [
        ["Hall de entrada", 40, false],
        ["Salão de festas", 80, true],
        ["Piscina", 30, true],
        ["Academia", 15, false],
        ["Garagem G1", null, false],
        ["Churrasqueira", 25, true],
        ["Jardim", null, false],
      ].map(async ([name, capacity, reservable]) => [
        name,
        await db.commonArea.create({ data: { condominiumId: cid, name: name as string, capacity: capacity as number | null, reservable: reservable as boolean } }),
      ]),
    ),
  );

  // Checklist do zelador (itens padrão; piscina e garagem ligados às áreas comuns)
  const checklist: [string, string?, string?, string?][] = [
    ["Iluminação das áreas comuns"],
    ["Portões e interfones", "Hall de entrada"],
    ["Bombas d’água e reservatórios", undefined, "Pressão, ruídos e nível da caixa"],
    ["Limpeza do hall e elevadores", "Hall de entrada"],
    ["Piscina — cloro e pH", "Piscina", undefined, "1,3,5"],
    ["Extintores e rotas de fuga", undefined, "Validade e acesso livre"],
    ["Garagem — vazamentos e lâmpadas", "Garagem G1"],
  ];
  for (const [n, [title, area, description, weekdays]] of checklist.entries()) {
    await db.checklistItem.create({
      data: { condominiumId: cid, title, description, commonAreaId: area ? areas[area].id : null, frequency: weekdays ? "weekdays" : "daily", weekdays: weekdays ?? "", sortOrder: n + 1 },
    });
  }
  await db.condominium.update({ where: { id: cid }, data: { checklistDeadline: "10:00" } });

  let counter = 0;
  const year = new Date().getFullYear();
  type Spec = {
    title: string; description: string; cat: string; area?: string; unitIdx?: number; priority: string; status: string;
    requestedBy: string; assignedTo?: string; createdH: number; dueH?: number; hue?: number; report?: string;
    materials?: { item: string; qty: string }[]; rating?: number; ratingComment?: string;
  };
  const specs: Spec[] = [
    { title: "Repintura das paredes do hall", description: "Paredes do hall com manchas de umidade e descascamento próximo à porta principal.", cat: "Pintura", area: "Hall de entrada", priority: "high", status: "approved", requestedBy: caretaker.id, assignedTo: painter.id, createdH: -24 * 12, dueH: -24 * 5, hue: 40, report: "Lixamento, aplicação de selador e duas demãos de tinta acrílica acetinada.", materials: [{ item: "Tinta acrílica acetinada 18L", qty: "2" }, { item: "Selador", qty: "1" }], rating: 5, ratingComment: "Ficou impecável!" },
    { title: "Troca de luminárias da garagem G1", description: "6 luminárias queimadas no corredor central da garagem.", cat: "Elétrica", area: "Garagem G1", priority: "medium", status: "approved", requestedBy: resident.id, assignedTo: electrician.id, createdH: -24 * 9, dueH: -24 * 4, hue: 210, report: "Substituídas 6 luminárias por LED 40W.", materials: [{ item: "Luminária LED 40W", qty: "6" }] },
    { title: "Limpeza do deck da piscina", description: "Limpeza pesada do deck com lavadora de alta pressão.", cat: "Limpeza", area: "Piscina", priority: "low", status: "approved", requestedBy: syndic.id, assignedTo: painter.id, createdH: -24 * 7, dueH: -24 * 2, hue: 190, report: "Lavagem completa e aplicação de impermeabilizante." },
    { title: "Vazamento no teto do salão de festas", description: "Infiltração visível no forro próximo à cozinha do salão.", cat: "Hidráulica", area: "Salão de festas", priority: "urgent", status: "validated", requestedBy: caretaker.id, assignedTo: plumber.id, createdH: -24 * 3, dueH: 24, hue: 25, report: "Substituído trecho de tubulação e refeito o forro de gesso." },
    { title: "Reparo do portão da garagem", description: "Portão fazendo barulho e travando na abertura.", cat: "Serralheria", area: "Garagem G1", priority: "high", status: "completed", requestedBy: resident2.id, assignedTo: electrician.id, createdH: -48, dueH: 24, hue: 0, report: "Motor ajustado e trilho lubrificado." },
    { title: "Pintura da fachada lateral — Torre Aurora", description: "Descascamento na fachada lateral, pavimentos 1 a 3.", cat: "Pintura", area: "Jardim", priority: "medium", status: "in_progress", requestedBy: syndic.id, assignedTo: painter.id, createdH: -30, dueH: 24 * 5, hue: 30 },
    { title: "Tomada sem energia na academia", description: "Tomadas da parede da esteira sem energia.", cat: "Elétrica", area: "Academia", priority: "high", status: "assigned", requestedBy: resident.id, assignedTo: electrician.id, createdH: -20, dueH: -2 },
    { title: "Poda das palmeiras do jardim", description: "Palmeiras com folhas secas sobre a calçada.", cat: "Jardinagem", area: "Jardim", priority: "low", status: "open", requestedBy: caretaker.id, createdH: -5 },
    { title: "Infiltração no banheiro da unidade", description: "Mancha no teto do banheiro social, possivelmente vindo da unidade de cima.", cat: "Hidráulica", unitIdx: 4, priority: "medium", status: "open", requestedBy: resident.id, createdH: -2 },
    { title: "Rejunte da churrasqueira", description: "Rejunte do piso escurecido e soltando.", cat: "Limpeza", area: "Churrasqueira", priority: "medium", status: "rejected", requestedBy: syndic.id, assignedTo: painter.id, createdH: -24 * 4, dueH: 24 * 2, hue: 15, report: "Rejunte refeito." },
  ];

  const order = ["open", "assigned", "in_progress", "completed", "validated", "approved"];
  for (const s of specs) {
    counter++;
    const created = hours(s.createdH);
    const idx = s.status === "rejected" ? 4 : order.indexOf(s.status);
    const step = (i: number) => new Date(created.getTime() + (i * (Date.now() - created.getTime())) / 7);
    const o = await db.serviceOrder.create({
      data: {
        protocol: `OS-${year}-${String(counter).padStart(5, "0")}`,
        condominiumId: cid,
        title: s.title,
        description: s.description,
        categoryId: cats[s.cat].id,
        locationType: s.area ? "common_area" : "unit",
        commonAreaId: s.area ? areas[s.area].id : null,
        unitId: s.unitIdx != null ? units[s.unitIdx].id : null,
        priority: s.priority,
        status: s.status,
        dueDate: s.dueH != null ? hours(s.dueH) : null,
        requestedById: s.requestedBy,
        assignedToId: s.assignedTo ?? null,
        assignedAt: idx >= 1 ? step(1) : null,
        startedAt: idx >= 2 ? step(2) : null,
        completedAt: idx >= 3 ? step(3) : null,
        validatedAt: idx >= 4 && s.status !== "rejected" ? step(4) : null,
        validatedById: idx >= 4 && s.status !== "rejected" ? caretaker.id : null,
        approvedAt: idx >= 5 ? step(5) : null,
        approvedById: idx >= 5 ? syndic.id : null,
        executionMinutes: idx >= 3 ? 90 + counter * 25 : null,
        serviceReport: idx >= 3 ? s.report : null,
        materialsUsed: JSON.stringify(s.materials ?? []),
        rating: s.rating ?? null,
        ratingComment: s.ratingComment ?? null,
        createdAt: created,
      },
    });
    const ev = (type: string, userId: string, i: number, extra: { fromStatus?: string; toStatus?: string; comment?: string } = {}) =>
      db.serviceEvent.create({ data: { serviceOrderId: o.id, userId, type, createdAt: step(i), ...extra } });
    await ev("created", s.requestedBy, 0, { toStatus: "open", comment: "Ordem de serviço aberta." });
    if (idx >= 1) await ev("assignment", syndic.id, 1, { fromStatus: "open", toStatus: "assigned", comment: "Prestador atribuído." });
    if (idx >= 2) await ev("status_change", s.assignedTo!, 2, { fromStatus: "assigned", toStatus: "in_progress", comment: "Serviço iniciado." });
    if (idx >= 3) await ev("status_change", s.assignedTo!, 3, { fromStatus: "in_progress", toStatus: "completed", comment: s.report });
    if (s.status === "rejected") {
      await ev("rejection", caretaker.id, 4, { fromStatus: "completed", toStatus: "rejected", comment: "Rejunte ainda com falhas no canto próximo à pia. Favor refazer." });
    } else {
      if (idx >= 4) await ev("validation", caretaker.id, 4, { fromStatus: "completed", toStatus: "validated", comment: "Conferido no local. Serviço executado conforme solicitado." });
      if (idx >= 5) await ev("approval", syndic.id, 5, { fromStatus: "validated", toStatus: "approved", comment: "Aprovado. Obrigada pelo capricho." });
    }
    if (s.rating) await ev("rating", s.requestedBy, 6, { comment: `Avaliação ${s.rating}/5 — ${s.ratingComment}` });

    if (s.hue != null && idx >= 2) {
      await db.serviceMedia.create({ data: { serviceOrderId: o.id, type: "photo", phase: "before", url: await svgMedia(o.id, "before", s.title, s.hue), mimeType: "image/svg+xml", sizeBytes: 2000, uploadedById: s.assignedTo!, uploadedAt: step(2) } });
    }
    if (s.hue != null && idx >= 3) {
      await db.serviceMedia.create({ data: { serviceOrderId: o.id, type: "photo", phase: "after", url: await svgMedia(o.id, "after", s.title, s.hue), mimeType: "image/svg+xml", sizeBytes: 2000, uploadedById: s.assignedTo!, uploadedAt: step(3) } });
    }
  }
  await db.condominium.update({ where: { id: cid }, data: { osCounter: counter } });

  await db.announcement.createMany({
    data: [
      { condominiumId: cid, authorId: syndic.id, title: "Manutenção da piscina", content: "A piscina ficará fechada na próxima segunda-feira para tratamento da água.", category: "maintenance" },
      { condominiumId: cid, authorId: syndic.id, title: "Assembleia ordinária", content: "Convocamos todos os condôminos para a assembleia no salão de festas, dia 15, às 19h.", category: "event", priority: "high" },
    ],
  });

  await db.notification.createMany({
    data: [
      { userId: syndic.id, type: "os_validated", title: "OS aguardando aprovação", message: "Vazamento no teto do salão de festas foi validado pelo zelador.", referenceType: "service_order" },
      { userId: caretaker.id, type: "os_completed", title: "OS concluída", message: "Reparo do portão da garagem aguarda sua validação.", referenceType: "service_order" },
      { userId: painter.id, type: "os_rejected", title: "OS devolvida", message: "Rejunte da churrasqueira foi devolvido para ajustes.", referenceType: "service_order" },
    ],
  });

  console.log(`Seed concluído. Senha de todos os usuários: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
