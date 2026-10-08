# Grapedle rework plan — v3 (final, executing)

Reviewed twice by two reviewers each round (one with full project context, one cold). v2 → v3 resolves every round-2 finding. v0 was never live; schedule, data and storage change freely until launch day, which becomes the start of the append-only rule.

## Game constants
- One daily puzzle. 6 guesses. Puzzle #1 = launch date (set in `data/schedule.json` `start`). Day changes at 00:00 Europe/Amsterdam.
- All ~260 grapes are guessable every day; the guess list never reveals the answer pool.
- Loss: the answer is revealed; share line reads `X/6`.
- Hint buttons unlock after 3 and 5 submitted guesses and lock when the game ends. Each hint used adds one 💡 to the share line.
- Storage key `gd:v2`. Stats (played, win %, streak, best, distribution) and the countdown stay as in v0.

## Answer pool (56)
The 40 classics minus Airén, Muscat of Alexandria, Petit Verdot, Trebbiano Toscano, Torrontés Riojano; plus Lambrusco (Salamino), Vermentino, Verdejo, Nero d'Avola, Zweigelt, Blaufränkisch, Müller-Thurgau; plus every stocked grape (Roter Sylvaner → Silvaner; Maturana Tinta → Trousseau). The ~55 other old-pool grapes stay guessable with full data (they return as a "Kenner" mode later).

## Schedule rules
- Seeded shuffle of the pool, no repeat within a cycle.
- Obscure stocked grapes (Auxerrois, Corvinone, Rondinella, Croatina, Graciano, Marsanne, Roussanne, Trousseau, Silvaner) only on Saturdays/Sundays.
- Grapes sharing a signature region at least 7 days apart; Corvina/Corvinone/Rondinella at least 21 days apart.

## Columns (5) and exact rules
| # | Column | Rule |
|---|---|---|
| 1 | Kleur | 🟩 same colour, 🟥 otherwise. Pink-skinned counts as white. |
| 2 | Regio (signature region: where the grape is best known — Rhône for Marsanne, Rioja for Tempranillo, Mendoza for Malbec) | 🟩 same region (two different grapes from one region also give 🟩); 🟨 same country; 🟥 otherwise. Yellow and red tiles show distance in km (rounded to 50) and an 8-way arrow, the initial great-circle bearing from the guess's region point to the answer's. |
| 3 | Klimaat (climate class of the signature region: koel = cool + temperate, warm, heet; from the Anderson & Nelgen 2020 regional climate zones) | 🟩 same class, 🟥 otherwise. Derived from the region, so the tile always agrees with column 2. |
| 4 | Aanplant (world planted area, Adelaide, latest year per country) | Arrow only, per owner: "↑ meer" = the answer has more, "↓ minder" = less. 🟩 only for the same grape. Exact figures are compared, so ties don't occur in practice; an exact tie shows "=" on a neutral tile. |
| 5 | Smaakprofiel (3–4 WSET primary aromas) | 🟩 ≥2 identical aromas; 🟨 1 identical aroma, or ≥3 shared aroma families; 🟥 otherwise; ⬜ "onbekend" when either grape has no aroma data. The tile lists the guess's aromas, identical ones bold. Families = the `cluster` field in `data/descriptors.json`. |

Help modal states that green in Smaakprofiel means "at least two aromas in common", and shows one example row with every tile state.

## Hints
- After 3 guesses: "Bekend van" — the best-known appellation or wine (Barolo, Sancerre, Valpolicella). A script rejects any hint containing the grape's display name, official name or a synonym (so "Prosecco DOC" and "Muscadet" are not allowed for those grapes; use e.g. "Conegliano-Valdobbiadene", "Sèvre et Maine").
- After 5 guesses: first letter plus letter count ("C _ _ _ _ _ _ _ _"), which separates Corvina from Corvinone.

## Names
Display the name customers know, official name in small print on the answer card: Grenache (Garnacha Tinta), Carignan (Mazuelo), Muscadet (Melon), Prosecco (Glera), Friulano, Malbec, Zinfandel / Primitivo, Albariño, Welschriesling. Shop categories keep their names via `shop-grapes.json` (Garnacha and Grenache both → garnacha-tinta; Roter Sylvaner → silvaner; Maturana Tinta → trousseau).

## Result screen
- Answer card: names, region, climate, aromas.
- Stocked: up to 4 wine tiles. Not stocked: "Lijkt op" — up to 3 stocked wines of the same colour with the most shared aromas, then the tastings link.
- Shop fetch times out after 4 s; on failure show the answer card and the tastings link, never empty tiles.
- Links carry `utm_source=grapedle&utm_medium=game`. If `window.dataLayer` exists (the site runs GTM), push events: start, guess, hint, win, loss, share, shop_click.

## Share
```
Grapedle #12 4/6 💡
🟥🟨🟥⬇️🟨
🟥🟩🟩⬆️🟨
🟩🟩🟩⬇️🟩
🟩🟩🟩🟩🟩
vinobypalazzo.nl/grapedle
```
Order: kleur, regio, klimaat, aanplant, smaak. ⬜ for unknown flavour. Clipboard fallback when `navigator.share` is missing.

## Data jobs
1. Signature regions (Sonnet, then owner sign-off for the 56): for the 111 old-pool grapes, one curated wine region each with country, a hand-placed lat/lon, the Table 75 climate zone of that region, and a source note. The other ~150 guessable grapes use their top country, a country point, and their computed world climate class collapsed to 3 classes.
2. Aromas (Haiku, three parallel batches) for the 111 old-pool grapes: 3–4 ids from `descriptors.json`, each backed by two independent NON-Wikipedia sources (appellation/producer bodies, wine schools such as WSET/Guild/Wine Folly, published references, aroma studies); Wikipedia only as a third. URL plus ≤12-word quote per source. Opus checks all 26 stocked grapes and 20% of the rest; the owner checks stocked grapes against Explore Wine Maps.
3. "Bekend van" (Haiku) for the 56 pool grapes, one source each, then the validator script.

## Engineering
- Remove parentage, ripening, trend, most-planted and origin columns.
- Trim synonyms to what autocomplete needs; keep the shop fixture out of the production bundle (dynamic import or dev-only build flag).
- Tests: every column rule incl. bearing/distance, flavour scoring, hint validator, schedule rules, a difficulty simulation for a casual player who knows ~15 grapes (target ≥60% with hints on weekdays; report weekend rate separately).
- Update README and CLAUDE.md (column set, schedule start rule).

## Later (release 2)
Practice mode excluding upcoming answers, Kenner mode with the obscure pool, "Mogelijk" candidate count, newsletter CTA once the owner fixes the newsletter block's storage in Squarespace.
