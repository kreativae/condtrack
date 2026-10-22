// Leitura da etiqueta da encomenda: do texto do OCR para transportadora, rastreio, destinatário e unidade.
// Regras puras (rodam no navegador do porteiro e nos testes). O OCR erra: tudo aqui tolera acento, caixa e espaços.

export type LabelUnit = { id: string; number: string; building: string };
export type LabelResident = { name: string; unitId: string };
export type LabelResult = { carrier?: string; tracking?: string; recipient?: string; unitId?: string; found: string[] };

/** Sem acento, maiúsculas, espaços simples: "Ápto  101" → "APTO 101". */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[ \t]+/g, " ");

const CARRIERS: [RegExp, string][] = [
  [/\bMERCADO ?(LIVRE|ENVIOS)\b|\bMELI\b/, "Mercado Livre"],
  [/\bSHOPEE\b|\bSPX\b/, "Shopee"],
  [/\bAMAZON\b/, "Amazon"],
  [/\bMAGALU\b|MAGAZINE ?LUIZA/, "Magalu"],
  [/\bJADLOG\b/, "Jadlog"],
  [/\bLOGGI\b/, "Loggi"],
  [/TOTAL ?EXPRESS/, "Total Express"],
  [/\bJ ?& ?T\b|\bJT ?EXPRESS\b/, "J&T Express"],
  [/AZUL ?CARGO/, "Azul Cargo"],
  [/\bSEQUOIA\b/, "Sequoia"],
  [/\bIFOOD\b/, "iFood"],
  [/\bDHL\b/, "DHL"],
  [/\bFEDEX\b/, "FedEx"],
  // Correios por último: várias lojas imprimem "postagem nos Correios" junto da própria marca
  [/\bCORREIOS\b|\bSEDEX\b|\bPAC\b|CARTA REGISTRADA/, "Correios"],
];

const UNIT_WORDS = "APARTAMENTO|APTO|APT|AP|UNIDADE|UNID|UND|CASA|LOTE|SALA|LOJA";

/** Palavras que identificam a torre/bloco além do tipo ("Torre Aurora" → AURORA; "Bloco B" → B; "Torre 2" → 2). */
const buildingKeys = (b: string) => norm(b).split(" ").filter((w) => w && !/^(TORRE|BLOCO|BL|TR|EDIFICIO|ED|PREDIO|QUADRA|QD)$/.test(w));

function findTracking(t: string) {
  // Correios: duas letras, 9 números, BR (o OCR às vezes separa os números em grupos)
  const c = t.match(/\b([A-Z]{2}) ?(\d{3}) ?(\d{3}) ?(\d{3}) ?(BR)\b/);
  if (c) return c.slice(1).join("");
  // Outras: código depois de "rastreio", "tracking", "pedido" ou "envio"
  const g = t.match(/(?:RASTREIO|RASTREAMENTO|TRACKING|COD(?:IGO)?\.? DE RASTREIO|PEDIDO|ENVIO)\s*(?:N[O°º]\.?|#|:)?\s*:?\s*([A-Z0-9-]{8,30})/);
  return g && /\d/.test(g[1]) ? g[1] : undefined;
}

/** Morador cujo nome aparece na etiqueta (nome completo, ou primeiro e último nome como palavras). */
function findResident(t: string, residents: LabelResident[]) {
  let best: { r: LabelResident; score: number } | null = null;
  const words = new Set(t.split(/[^A-Z]+/).filter(Boolean));
  for (const r of residents) {
    const parts = norm(r.name).split(" ").filter((w) => w.length > 1);
    if (parts.length < 2) continue;
    const full = t.includes(parts.join(" "));
    const firstLast = words.has(parts[0]) && words.has(parts[parts.length - 1]);
    const score = full ? 100 + parts.length : firstLast ? 50 : 0;
    if (score && (!best || score > best.score)) best = { r, score };
  }
  return best?.r;
}

/** Nome depois de "Destinatário", "Para", "Recebedor"… (mesma linha ou a seguinte), com os acentos do original. */
function findRecipientLine(lines: string[], original: string[]) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:DESTINATARIO|DESTINATARIA|PARA|RECEBEDOR|A\/C|AOS CUIDADOS DE|NOME)\b\s*[:\-]?\s*(.*)$/);
    if (!m) continue;
    const sameLine = !!m[1].trim();
    const cand = (sameLine ? m[1] : lines[i + 1] ?? "").replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
    if (cand.split(" ").filter((w) => w.length > 1).length < 2) continue;
    // Volta às palavras originais (com acento) da mesma linha
    const orig = (original[sameLine ? i : i + 1] ?? "").split(/\s+/);
    return cand.split(" ").map((w) => orig.find((o) => norm(o).replace(/[^A-Z]/g, "") === w) ?? w).join(" ");
  }
  return undefined;
}

const title = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase());

/** Unidade pelo número ("APTO 101"), desempatando pela torre/bloco escrito na etiqueta. */
function findUnit(t: string, units: LabelUnit[]) {
  const nums = [...t.matchAll(new RegExp(`\\b(?:${UNIT_WORDS})\\b\\.?\\s*(?:N[O°º]\\.?|[°º]|:|-)?\\s*(\\d{1,5}[A-Z]?)\\b`, "g"))].map((m) => m[1]);
  for (const n of nums) {
    const same = units.filter((u) => norm(u.number) === n || norm(u.number).replace(/^0+/, "") === n.replace(/^0+/, ""));
    if (same.length === 1) return same[0];
    if (same.length > 1) {
      const byTower = same.filter((u) => buildingKeys(u.building).some((k) => new RegExp(`\\b(?:TORRE|BLOCO|BL|TR|ED|EDIFICIO|QUADRA|QD)\\.?\\s*${k}\\b`).test(t) || (k.length > 3 && t.includes(k))));
      if (byTower.length === 1) return byTower[0];
    }
  }
  return undefined;
}

export function parseLabel(raw: string, units: LabelUnit[], residents: LabelResident[]): LabelResult {
  const t = norm(raw);
  // Mesmas linhas no texto original (para devolver o nome com acento)
  const original = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lines = original.map(norm);
  const out: LabelResult = { found: [] };

  const carrier = CARRIERS.find(([re]) => re.test(t))?.[1];
  if (carrier) {
    out.carrier = carrier;
    out.found.push("transportadora");
  }
  const tracking = findTracking(t);
  if (tracking) {
    out.tracking = tracking;
    out.found.push("rastreio");
  }

  // Morador com conta/cadastro achado pelo nome também dá a unidade
  const resident = findResident(t, residents);
  if (resident) {
    out.recipient = resident.name;
    out.found.push("destinatário");
  } else {
    const name = findRecipientLine(lines, original);
    if (name) {
      out.recipient = title(name);
      out.found.push("destinatário");
    }
  }
  const unit = findUnit(t, units);
  const unitId = unit?.id ?? resident?.unitId;
  if (unitId) {
    out.unitId = unitId;
    out.found.push("unidade");
  }
  // OCR cortou o primeiro nome ("sas Moreira"): com a unidade achada, o sobrenome de um morador dela basta
  if (!resident && unitId) {
    const words = new Set(t.split(/[^A-Z]+/).filter((w) => w.length > 2));
    const same = residents.filter((r) => r.unitId === unitId && words.has(norm(r.name).split(" ").filter(Boolean).at(-1) ?? ""));
    if (same.length === 1) {
      out.recipient = same[0].name;
      if (!out.found.includes("destinatário")) out.found.splice(out.found.indexOf("unidade"), 0, "destinatário");
    }
  }
  return out;
}

/**
 * Prepara a imagem para o OCR (tons de cinza → preto e branco). Etiqueta real tem código de barras: o leitor
 * entende as barras como texto em pé e desmonta a página inteira. Aqui elas somem: riscos verticais bem mais
 * altos que uma letra viram branco, assim como linhas horizontais longas (bordas de tabela). O limiar de
 * preto/branco é automático (Otsu), o que também apaga ruído claro (textura do papelão, sombra leve).
 * Recebe e devolve tons de cinza (0 = preto, 255 = branco), um byte por pixel.
 */
export function cleanForOcr(gray: Uint8ClampedArray | Uint8Array, w: number, h: number) {
  // Otsu: limiar que melhor separa os dois grupos de tons
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = gray.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  const bin = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] <= threshold ? 0 : 255;
  // Foto torta: endireita antes de apagar barras e linhas (que procuram riscos retos)
  const out = rotateBinary(bin, w, h, -skewAngle(bin, w, h));

  // Riscos verticais mais altos que ~6% da imagem (letras ficam bem abaixo disso). A coluna conta como preta se
  // ela ou uma vizinha estiver preta: assim a barra de uma etiqueta um pouco torta também é achada.
  const maxV = Math.max(24, Math.round(h * 0.06));
  const isBlack = (x: number, y: number) => x >= 0 && x < w && out[y * w + x] === 0;
  const eraseV: [number, number, number][] = [];
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const black = y < h && (isBlack(x - 1, y) || isBlack(x, y) || isBlack(x + 1, y));
      if (black && start < 0) start = y;
      if (!black && start >= 0) {
        if (y - start > maxV) eraseV.push([x, start, y]);
        start = -1;
      }
    }
  }
  // Linhas horizontais longas (mais de 30% da largura), com a mesma tolerância
  const maxH = Math.round(w * 0.3);
  const isBlackH = (x: number, y: number) => y >= 0 && y < h && out[y * w + x] === 0;
  const eraseH: [number, number, number][] = [];
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const black = x < w && (isBlackH(x, y - 1) || isBlackH(x, y) || isBlackH(x, y + 1));
      if (black && start < 0) start = x;
      if (!black && start >= 0) {
        if (x - start > maxH) eraseH.push([y, start, x]);
        start = -1;
      }
    }
  }
  for (const [x, a, b] of eraseV) for (let y = a; y < b; y++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < w) out[y * w + x + dx] = 255;
  for (const [y, a, b] of eraseH) for (let x = a; x < b; x++) for (let dy = -1; dy <= 1; dy++) if (y + dy >= 0 && y + dy < h) out[(y + dy) * w + x] = 255;
  return out;
}

/**
 * Inclinação do texto, em graus (-10 a 10): o ângulo em que as linhas de texto ficam mais "retas", isto é,
 * em que a soma de pixels pretos por linha horizontal varia mais (linhas cheias e vãos vazios).
 */
export function skewAngle(bin: Uint8ClampedArray | Uint8Array, w: number, h: number) {
  // Amostra dos pixels pretos (no máximo ~40 mil, para ser rápido no celular)
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 400_000)));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (bin[y * w + x] === 0) {
    xs.push(x);
    ys.push(y);
  }
  if (xs.length < 50) return 0;
  const score = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    const sin = Math.sin(r);
    const cos = Math.cos(r);
    const bins = new Map<number, number>();
    for (let i = 0; i < xs.length; i++) {
      const k = Math.round((ys[i] * cos - xs[i] * sin) / step);
      bins.set(k, (bins.get(k) ?? 0) + 1);
    }
    let s = 0;
    for (const v of bins.values()) s += v * v;
    return s;
  };
  let best = 0;
  let bestScore = -1;
  for (let d = -10; d <= 10; d += 1) {
    const sc = score(d);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  // Refina em meio grau perto do melhor
  for (const d of [best - 0.5, best + 0.5]) {
    const sc = score(d);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  return best;
}

/** Gira a imagem preto e branco em torno do centro (vizinho mais próximo; o que sai da borda fica branco). */
export function rotateBinary(bin: Uint8ClampedArray | Uint8Array, w: number, h: number, deg: number) {
  if (!deg) return Uint8ClampedArray.from(bin);
  const r = (deg * Math.PI) / 180;
  const sin = Math.sin(r);
  const cos = Math.cos(r);
  const cx = w / 2;
  const cy = h / 2;
  const out = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Ponto de origem do pixel de destino (rotação inversa)
      const sx = Math.round(cos * (x - cx) + sin * (y - cy) + cx);
      const sy = Math.round(-sin * (x - cx) + cos * (y - cy) + cy);
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) out[y * w + x] = bin[sy * w + sx];
    }
  }
  return out;
}
