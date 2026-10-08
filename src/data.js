import grapes from '../data/grapes.json';
import descriptors from '../data/descriptors.json';
import countries from '../data/countries.json';
import schedule from '../data/schedule.json';
import shopGrapes from '../data/shop-grapes.json';
import { norm } from './text.js';

export { grapes, descriptors, countries, schedule, shopGrapes };
export const byId = new Map(grapes.map((g) => [g.id, g]));

/** Search index: one entry per grape with normalised name and synonyms. */
export const index = grapes.map((g) => ({ g, name: norm(g.name), syn: g.synonyms.map((s) => ({ raw: s, key: norm(s) })) }));
