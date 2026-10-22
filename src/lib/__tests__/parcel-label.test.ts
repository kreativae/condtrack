import { describe, expect, it } from "vitest";
import { parseLabel } from "../parcel-label";

const units = [
  { id: "a101", number: "101", building: "Torre Aurora" },
  { id: "h101", number: "101", building: "Torre Horizonte" },
  { id: "a502", number: "502", building: "Torre Aurora" },
  { id: "b204", number: "204", building: "Bloco B" },
];
const residents = [
  { name: "Lucas Moreira", unitId: "a502" },
  { name: "Ana Carvalho da Silva", unitId: "h101" },
];

describe("leitura da etiqueta", () => {
  it("Correios: rastreio, destinatário pela linha e unidade com torre", () => {
    const text = `CORREIOS\nSEDEX\nOB 123 456 789 BR\nDESTINATÁRIO\nMARIA JOSÉ PEREIRA\nRua das Flores, 120 Apto 101 Torre Aurora\nCEP 01234-567`;
    expect(parseLabel(text, units, residents)).toEqual({ carrier: "Correios", tracking: "OB123456789BR", recipient: "Maria José Pereira", unitId: "a101", found: ["transportadora", "rastreio", "destinatário", "unidade"] });
  });

  it("morador cadastrado no texto define destinatário e unidade, mesmo sem número", () => {
    const r = parseLabel(`Mercado Envios\nPara: ANA CARVALHO DA SILVA\nAv. Paulista 1000`, units, residents);
    expect(r.carrier).toBe("Mercado Livre");
    expect(r.recipient).toBe("Ana Carvalho da Silva");
    expect(r.unitId).toBe("h101");
  });

  it("primeiro e último nome bastam (OCR perdeu o do meio)", () => {
    expect(parseLabel(`SPX Shopee\nLUCAS M0REIRA ap 502`, units, residents).unitId).toBe("a502");
    expect(parseLabel(`SPX Shopee\nLUCAS XYZ MOREIRA`, units, residents).recipient).toBe("Lucas Moreira");
  });

  it("número repetido em duas torres sem a torre escrita: não chuta", () => {
    expect(parseLabel(`Amazon\nAPTO 101`, units, residents).unitId).toBeUndefined();
    expect(parseLabel(`Amazon\nAPTO 101 BL HORIZONTE`, units, residents).unitId).toBe("h101");
  });

  it("bloco com letra e variações de escrita", () => {
    expect(parseLabel(`Jadlog\nAP: 204 BLOCO B`, units, residents).unitId).toBe("b204");
    expect(parseLabel(`Jadlog\nApt° 204`, units, residents).unitId).toBe("b204");
  });

  it("marca da loja ganha de “postagem nos Correios”; rastreio rotulado", () => {
    const r = parseLabel(`AMAZON\nPostado via Correios\nTracking: TBA123456789000`, units, residents);
    expect(r.carrier).toBe("Amazon");
    expect(r.tracking).toBe("TBA123456789000");
  });

  it("texto sem nada útil não inventa campos", () => {
    expect(parseLabel(`FRAGIL\nESTE LADO PARA CIMA`, units, residents)).toEqual({ found: [] });
  });
});

describe("limpeza da imagem para o OCR", () => {
  const W = 200, H = 200;
  const blank = () => new Uint8ClampedArray(W * H).fill(230);
  const rect = (img: Uint8ClampedArray, x0: number, y0: number, w: number, h: number, v = 20) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img[y * W + x] = v;
  };
  const blackAt = (img: Uint8ClampedArray, x: number, y: number) => img[y * W + x] === 0;

  it("apaga barras de código (riscos verticais altos) e mantém traços do tamanho de letra", async () => {
    const { cleanForOcr } = await import("../parcel-label");
    const img = blank();
    for (let i = 0; i < 10; i++) rect(img, 20 + i * 6, 20, 2, 80); // código de barras: 80 px de altura
    rect(img, 120, 30, 3, 10); // "letra": 10 px
    rect(img, 140, 30, 3, 10);
    const out = cleanForOcr(img, W, H);
    expect(blackAt(out, 21, 60)).toBe(false);
    expect(blackAt(out, 121, 35)).toBe(true);
    expect(blackAt(out, 141, 35)).toBe(true);
  });

  it("ruído claro some no preto e branco", async () => {
    const { cleanForOcr } = await import("../parcel-label");
    const img = blank();
    rect(img, 50, 50, 1, 1, 200); // mancha clara
    rect(img, 120, 30, 3, 10);
    const out = cleanForOcr(img, W, H);
    expect(blackAt(out, 50, 50)).toBe(false);
  });

  it("acha a inclinação das linhas de texto", async () => {
    const { skewAngle } = await import("../parcel-label");
    const img = new Uint8ClampedArray(W * H).fill(255);
    const tilt = Math.tan((4 * Math.PI) / 180);
    for (const base of [40, 80, 120, 160]) for (let x = 10; x < 190; x += 2) {
      const y = Math.round(base + (x - 100) * tilt);
      for (let k = 0; k < 4; k++) img[(y + k) * W + x] = 0;
    }
    expect(Math.abs(skewAngle(img, W, H) - 4)).toBeLessThanOrEqual(1);
  });
});
