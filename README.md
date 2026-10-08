# Grapedle

A daily grape-guessing game for [Vino by Palazzo](https://www.vinobypalazzo.nl/grapedle). One grape per day, the same for everyone, six guesses. Each guess is scored on four attributes: colour (kleur), signature region (regio, with distance and direction), world planted area (aanplant, as a how-much-more/less band) and flavour profile (smaakprofiel). Two hints unlock after 3 and 5 guesses. The daily answer comes from a pool of 55 grapes; about 200 more grapes can be guessed but never are the answer.

The game is a static bundle served from this repo through jsDelivr and embedded on a Squarespace page with a single code block. There is no backend.

## Layout

```
data/         grapes.json, descriptors.json, schedule.json, countries.json, shop-grapes.json
data/source/  derived extracts and curated inputs (answer pool, signature regions, aromas, hints); raw files are not committed
scripts/      data builder (npm run data), esbuild script, hint validator
dev/          preview page; grapedle.dev.js is built by npm run build and keeps the shop fixture (?mockShop=1|none|fail)
src/          game engine, UI, i18n (nl, en)
tests/
dist/         built bundle, served via jsDelivr from release tags
```

## Embedding

Squarespace Code Block. The placeholder inside the root is shown until the script runs (mount replaces it and drops the inline `min-height`); keep the `min-height` so the page does not jump.

```html
<div id="grapedle-root" style="min-height:520px"><p>Grapedle laden… Werkt het niet? Vernieuw de pagina.</p></div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/GodelloVbP/Grapedle@v1.0.0/dist/grapedle.min.css">
<script src="https://cdn.jsdelivr.net/gh/GodelloVbP/Grapedle@v1.0.0/dist/grapedle.min.js" defer></script>
```

Always reference a release tag, never a branch. All CSS is scoped under `#grapedle-root` with a `gd-` prefix and resets bare elements and form controls (with `!important` on button/input visuals, because Squarespace form styles are very specific). The game never opens its first-visit help while the host's `#age-gate` is visible.

## Release process

1. Bump `version` in `package.json` and the `@vX.Y.Z` in the embed snippet above.
2. `npm run data && npm run build && npm test`.
3. `npm run release:freeze` copies `data/schedule.json` to `data/schedule.released.json`. From then on a test requires `schedule.json` to start with exactly those days.
4. `npm run release:check` (dist matches a fresh build of src, tests pass, README and `package.json` versions agree, and HEAD's `vX.Y.Z` tag if present).
5. Commit, `git tag vX.Y.Z`, `git push --tags`.
6. Change the version in the Squarespace Code Block URLs.

The schedule needs at least 90 days ahead: the build prints a warning and a test fails below that. Extend with `python3 scripts/build_data.py --days <more>` (whole cycles are appended, released days never change).

## Data sources

- Anderson, K., S. Nelgen and G. Puga, *Database of Regional, National and Global Winegrape Bearing Areas by Variety, 2000 to 2023*, Wine Economics Research Centre, University of Adelaide, December 2025 (revised March 2026). [doi:10.25909/32870405.v1](https://doi.org/10.25909/32870405.v1). Used for variety names and synonyms, berry colour, country of origin, 2023 planted area and top countries.
- Anderson, K. and S. Nelgen, *Which Winegrape Varieties are Grown Where?* (revised edition), University of Adelaide Press, 2020. Used for the signature regions (Table 75 region names). The climate class that was derived from it is no longer a game column; the climate extracts stay in `data/source/` for reference only.
- Gatinois, *Explore Wine Maps*. Aromas where the owner's copy has an entry; otherwise Wine Folly, Jancis Robinson and Wikipedia (the URL per grape is in the `sources` object of `data/grapes.json`).
- Hints: one source URL per grape in `data/source/hints.json`.

## Game rules in short

| Column | Green | Yellow | Red |
|---|---|---|---|
| Kleur | same colour (pink counts as white) | | other colour |
| Regio | same signature region | same country, with km (rounded to 50) and an 8-way arrow | other country, km and arrow |
| Aanplant | only the same grape | | neutral tile with a band, see below |
| Smaakprofiel | at least 2 identical aromas | 1 identical aroma, or 3 shared aroma families | no overlap; grey when unknown |

Aanplant band, with r = answer hectares / guess hectares: r >= 5 "↑ >5× meer"; 2 <= r < 5 "↑ 2–5× meer"; 1.25 <= r < 2 "↑ iets meer"; 0.8 < r < 1.25 "≈ ongeveer gelijk"; 0.5 < r <= 0.8 "↓ iets minder"; 0.2 < r <= 0.5 "↓ 2–5× minder"; r <= 0.2 "↓ >5× minder". Share emoji: ⬆️/⬇️ for any up/down band, ↔️ about the same, 🟩 correct.

Hints: after 3 guesses "Bekend van" (appellation or wine), after 5 guesses the first letter ("Begint met C"). Each hint used adds a 💡 to the share text. State is stored under `gd:v2` and normalised on load (damaged data never breaks the game).

Before the launch date the game shows a teaser with a countdown and offers practice puzzles only. Practice ("Oefenen", also on the end screen) plays any past puzzle or a random one, never counts for stats or streak, is kept in memory and never offers a future puzzle. Dev only: `?now=YYYY-MM-DD` fakes the date, `?day=N` shows puzzle N.

Search ranks an exact name or synonym first, then answer-pool grapes, then name prefix, synonym prefix, substring. Enter submits only an exact match, a single suggestion, or one picked with the arrow keys or pointer; otherwise it asks to pick from the list. The end screen's "Lijkt op" needs at least 2 identical aromas (or 1 plus the same colour and primary-region country), else only the tastings link shows. Shop links and images must be https: or relative.

## Build

```
npm run data    # data/grapes.json, countries.json, shop-grapes.json, schedule.json (fails on a hint that gives the grape away)
npm run build   # dist/ (production, no fixture) and dev/grapedle.dev.js
npm test
npm run release:check   # release gate, see Release process
```

`data/source/adelaide_2023_summary.csv` is regenerated with:

```
python scripts/extract_adelaide.py "<folder with the Adelaide Excel files>"
```

## Language

Code and comments are in English. Player-facing text is Dutch by default, with an English toggle.
