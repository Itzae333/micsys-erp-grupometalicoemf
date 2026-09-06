// Cada ubicación tiene su propio catálogo de artículos, con ids y claves
// (SKU) totalmente independientes entre sí — las claves vienen de sistemas
// legado migrados por separado, así que un mismo producto físico puede tener
// claves distintas en cada ubicación y no sirven para encontrar su
// equivalente. Lo único potencialmente comparable son las descripciones
// libres (descripcion_1..5), que tampoco están alineadas por posición entre
// ubicaciones ni siempre están completas (algunas solo tienen 2-4 de 5). Por
// eso el matching compara "bolsas de palabras" en vez de campo por campo.

export interface DescripcionesArticulo {
  id: string;
  clave: string;
  descripcion_1: string | null;
  descripcion_2: string | null;
  descripcion_3: string | null;
  descripcion_4: string | null;
  descripcion_5: string | null;
}

export interface CandidatoMatch {
  articulo: DescripcionesArticulo;
  score: number;
}

export const MIN_CANDIDATE_SCORE = 0.15;
export const AUTO_RESOLVE_SCORE = 0.6;
export const AUTO_RESOLVE_MARGIN = 0.2;
const CLAVE_MATCH_BONUS = 0.05;
// Los catálogos legado suelen abreviar/truncar palabras ("HEX" por
// "HEXAGONAL", "GALV" por "GALVANIZADO"). Se consideran equivalentes dos
// tokens si uno es prefijo del otro y el más corto tiene al menos esta
// longitud, para no confundir abreviaturas reales con coincidencias falsas
// entre palabras cortas no relacionadas.
const MIN_PREFIX_LEN = 3;

export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokenizarArticulo(a: DescripcionesArticulo): Set<string> {
  const texto = [a.descripcion_1, a.descripcion_2, a.descripcion_3, a.descripcion_4, a.descripcion_5]
    .filter((d): d is string => !!d && d.trim().length > 0)
    .join(' ');
  const tokens = normalizarTexto(texto).split(' ').filter((t) => t.length >= 2);
  return new Set(tokens);
}

function tokensEquivalentes(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < MIN_PREFIX_LEN) return false;
  return a.startsWith(b) || b.startsWith(a);
}

function contarCoincidencias(a: Set<string>, b: Set<string>): number {
  const usados = new Set<string>();
  let coincidencias = 0;
  for (const ta of a) {
    for (const tb of b) {
      if (usados.has(tb)) continue;
      if (tokensEquivalentes(ta, tb)) {
        usados.add(tb);
        coincidencias++;
        break;
      }
    }
  }
  return coincidencias;
}

export function scoreDice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const coincidencias = contarCoincidencias(a, b);
  return (2 * coincidencias) / (a.size + b.size);
}

export function rankCandidatos(
  origen: DescripcionesArticulo,
  candidatosDestino: DescripcionesArticulo[],
  opts?: { minScore?: number; limite?: number },
): CandidatoMatch[] {
  const minScore = opts?.minScore ?? MIN_CANDIDATE_SCORE;
  const limite = opts?.limite ?? 8;

  const tokensOrigen = tokenizarArticulo(origen);
  const claveOrigenNorm = normalizarTexto(origen.clave);

  const resultados: CandidatoMatch[] = candidatosDestino.map((art) => {
    let score = scoreDice(tokensOrigen, tokenizarArticulo(art));
    if (claveOrigenNorm && normalizarTexto(art.clave) === claveOrigenNorm) {
      score = Math.min(1, score + CLAVE_MATCH_BONUS);
    }
    return { articulo: art, score };
  });

  return resultados
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

export function esCandidatoUnicoConfiable(candidatos: CandidatoMatch[]): boolean {
  if (candidatos.length === 0) return false;
  const [mejor, segundo] = candidatos;
  if (mejor.score < AUTO_RESOLVE_SCORE) return false;
  if (!segundo) return true;
  return mejor.score - segundo.score >= AUTO_RESOLVE_MARGIN;
}
