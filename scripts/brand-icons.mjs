// Gera os ícones da marca ("Andares", mesmo desenho de src/components/logo.tsx) com o sharp.
// Rodar depois de mudar o símbolo: node scripts/brand-icons.mjs
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const FLOORS = [
  { x: 15, y: 38, w: 34 },
  { x: 15, y: 26.5, w: 24 },
  { x: 15, y: 15, w: 13.5 },
];
const CHECK = "M34.5 19.5l4.2 4.2 9-9.2";
const GRADIENT = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b7bf2"/><stop offset=".55" stop-color="#5b5bd6"/><stop offset="1" stop-color="#4338ca"/></linearGradient>`;

// translate: centraliza na vertical, igual ao MarkShapes do componente
const shapes = (ink, accent) =>
  `<g transform="translate(0 2.2)">` +
  FLOORS.map((f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="9" rx="4.5" fill="${ink}"/>`).join("") +
  `<path d="${CHECK}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`;

/**
 * radius: canto do quadro (0 = quadrado inteiro, para o iPhone e o Android arredondarem do jeito deles).
 * scale: tamanho do símbolo dentro do quadro (o ícone "maskable" do Android pede o desenho na zona segura central).
 */
function svg({ radius = 18, scale = 1, frame = true, ink = "#fff", accent = "#34d399" } = {}) {
  const t = 32 - 32 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${GRADIENT}</defs>${frame ? `<rect width="64" height="64" rx="${radius}" fill="url(#g)"/>` : ""}<g transform="translate(${t} ${t}) scale(${scale})">${shapes(ink, accent)}</g></svg>`;
}

const png = (s, size, out) => sharp(Buffer.from(s), { density: 72 * Math.ceil(size / 64) * 2 }).resize(size, size).png().toFile(out);

await writeFile("src/app/icon.svg", svg());
await writeFile("public/icon.svg", svg()); // manifesto (/icon.svg)
await png(svg({ radius: 0, scale: 0.86 }), 192, "public/icon-192.png");
await png(svg({ radius: 0, scale: 0.78 }), 512, "public/icon-512.png");
await png(svg({ radius: 0, scale: 0.9 }), 180, "src/app/apple-icon.png");
// Selo das notificações no Android: só a silhueta (o sistema usa o canal alfa e pinta de uma cor)
await png(svg({ frame: false, scale: 1.12, ink: "#fff", accent: "#fff" }), 96, "public/badge-96.png");
console.log("ícones gerados");
