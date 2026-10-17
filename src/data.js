import grapes from '../data/grapes.json' with { type: 'json' };
import descriptors from '../data/descriptors.json' with { type: 'json' };
import styles from '../data/styles.json' with { type: 'json' };
import countries from '../data/countries.json' with { type: 'json' };
import schedule from '../data/schedule.json' with { type: 'json' };
import shopGrapes from '../data/shop-grapes.json' with { type: 'json' };
import lookalikes from '../data/lookalikes.json' with { type: 'json' };
import { norm } from './text.js';

export { grapes, descriptors, styles, countries, schedule, shopGrapes, lookalikes };

/** The look-alike group (grapes that are extremely similar and usually blended together) of a grape, or null. */
export const lookalikeOf = (id) => lookalikes.find((g) => g.ids.includes(id)) || null;
export const byId = new Map(grapes.map((g) => [g.id, g]));

/** Search index: one entry per grape with normalised name and synonyms. */
export const index = grapes.map((g) => ({ g, name: norm(g.name), syn: g.synonyms.map((s) => ({ raw: s, key: norm(s) })) }));
