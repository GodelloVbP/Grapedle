import { descriptors as defDesc } from './data.js';

/** Identical aromas and shared aroma families between two grapes' flavour lists. */
export function overlap(a, b, desc = defDesc) {
  if (!a || !b) return { identical: 0, families: 0 };
  const fam = (l) => new Set(l.map((d) => desc[d] && desc[d].cluster).filter(Boolean));
  const fb = fam(b);
  return { identical: a.filter((d) => b.includes(d)).length, families: [...fam(a)].filter((c) => fb.has(c)).length };
}

/**
 * Stocked grapes that resemble the answer: same colour, most identical aromas, ties broken by
 * shared aroma families, then name. The answer itself is excluded. Unknown flavours rank nothing.
 */
export function similarGrapes(answer, grapes, desc = defDesc, limit = 3) {
  if (!answer.flavours || !answer.flavours.length) return [];
  return grapes
    .filter((g) => g.stocked && g.id !== answer.id && g.colour === answer.colour && g.flavours && g.flavours.length)
    .map((g) => ({ g, ...overlap(g.flavours, answer.flavours, desc) }))
    .sort((x, y) => y.identical - x.identical || y.families - x.families || x.g.name.localeCompare(y.g.name))
    .slice(0, limit)
    .map((x) => x.g);
}
