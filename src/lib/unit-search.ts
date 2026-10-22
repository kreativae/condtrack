// Busca de unidade digitando (portaria): "502", "A502", "a 502", "aurora 502", "bloco b 204", "casa 12".
// Regras puras, testadas; rodam no navegador sobre a lista de unidades do condomínio (centenas, instantâneo).

export type UnitOption = { id: string; label: string; number: string; building: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GENERIC = new Set(["torre", "bloco", "bl", "tr", "edificio", "ed", "predio", "quadra", "qd", "rua", "ap", "apto", "apt", "apartamento", "unidade", "un", "casa", "lote", "sala", "loja"]);

/** Partes que identificam a torre/quadra ("Torre Aurora" → ["aurora"]; "Bloco B" → ["b"]). */
const buildingWords = (b: string) => norm(b).split(/[^a-z0-9]+/).filter((w) => w && !GENERIC.has(w));

/**
 * Unidades que combinam com o texto, das mais prováveis para as menos.
 * Número: o texto precisa conter o número da unidade (exato vale mais que começo).
 * Letras: cada palavra precisa bater com o começo de uma palavra da torre ("a" → Aurora, "aur" → Aurora).
 */
export function matchUnits(query: string, units: UnitOption[], limit = 8) {
  const q = norm(query).trim();
  if (!q) return [];
  // "a502" → letras "a" + número "502"; "502a" fica como número com letra
  const tokens = q.replace(/([a-z])(\d)/g, "$1 $2").split(/[^a-z0-9]+/).filter((t) => t && !GENERIC.has(t));
  const nums = tokens.filter((t) => /^\d/.test(t));
  const words = tokens.filter((t) => !/^\d/.test(t));
  const scored: { u: UnitOption; score: number }[] = [];
  for (const u of units) {
    const number = norm(u.number);
    const bw = buildingWords(u.building);
    let score = 0;
    if (nums.length) {
      const n = nums[0];
      if (number === n || number.replace(/^0+/, "") === n.replace(/^0+/, "")) score += 100;
      else if (number.startsWith(n)) score += 40;
      else continue;
    }
    if (words.length) {
      if (!words.every((w) => bw.some((b) => b.startsWith(w)))) continue;
      score += 20;
    }
    if (!nums.length && !words.length) continue;
    scored.push({ u, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.u.label.localeCompare(b.u.label, "pt-BR", { numeric: true })).slice(0, limit).map((s) => s.u);
}

/** O texto parece ser uma unidade (tem número)? Na barra rápida, nome vai para a busca de pessoas. */
export const looksLikeUnit = (q: string) => /\d/.test(q);
