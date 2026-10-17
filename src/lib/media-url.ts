// Versão reduzida de uma foto do sistema (/api/media/...?w=), gerada e guardada pelo servidor.
// Larguras aceitas pela rota: 480 (miniaturas), 800 (cartões) e 1200 (antes e depois).
// Vídeos, SVG e endereços de fora voltam como vieram.
export type ThumbWidth = 480 | 800 | 1200;

export function thumb(url: string, width: ThumbWidth) {
  if (!url.startsWith("/api/media/") || !/\.(jpe?g|png|webp)$/i.test(url)) return url;
  return `${url}?w=${width}`;
}
