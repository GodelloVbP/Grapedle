# Grapedle

A daily grape-guessing game for [Vino by Palazzo](https://www.vinobypalazzo.nl/grapedle). One grape per day, the same for everyone, six guesses. Each guess is scored on five attributes: colour (kleur), signature region (regio, with distance and direction), climate (klimaat), world planted area (aanplant, arrow only) and flavour profile (smaakprofiel). Two hints unlock after 3 and 5 guesses. The daily answer comes from a pool of 55 grapes; about 200 more grapes can be guessed but never are the answer.

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

```html
<div id="grapedle-root"></div>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/GodelloVbP/Grapedle@v1.0.0/dist/grapedle.min.css">
<script src="https://cdn.jsdelivr.net/gh/GodelloVbP/Grapedle@v1.0.0/dist/grapedle.min.js" defer></script>
```

Always reference a release tag, never a branch.

## Data sources

- Anderson, K., S. Nelgen and G. Puga, *Database of Regional, National and Global Winegrape Bearing Areas by Variety, 2000 to 2023*, Wine Economics Research Centre, University of Adelaide, December 2025 (revised March 2026). [doi:10.25909/32870405.v1](https://doi.org/10.25909/32870405.v1). Used for variety names and synonyms, berry colour, country of origin, 2023 planted area and top countries.
- Anderson, K. and S. Nelgen, *Which Winegrape Varieties are Grown Where?* (revised edition), University of Adelaide Press, 2020. Used for the climate class of each signature region (Table 75).
- Gatinois, *Explore Wine Maps*. Aromas where the owner's copy has an entry; otherwise Wine Folly, Jancis Robinson and Wikipedia (the URL per grape is in the `sources` object of `data/grapes.json`).
- Hints: one source URL per grape in `data/source/hints.json`.

## Game rules in short

| Column | Green | Yellow | Red |
|---|---|---|---|
| Kleur | same colour (pink counts as white) | | other colour |
| Regio | same signature region | same country, with km (rounded to 50) and an 8-way arrow | other country, km and arrow |
| Klimaat | same class (koel, warm, heet) | | other class |
| Aanplant | only the same grape | | neutral tile: ↑ meer / ↓ minder (what the answer has) |
| Smaakprofiel | at least 2 identical aromas | 1 identical aroma, or 3 shared aroma families | no overlap; grey when unknown |

Hints: after 3 guesses "Bekend van" (appellation or wine), after 5 guesses first letter and letter count. Each hint used adds a 💡 to the share text. State is stored under `gd:v2`.

## Build

```
npm run data    # data/grapes.json, countries.json, shop-grapes.json, schedule.json (fails on a hint that gives the grape away)
npm run build   # dist/ (production, no fixture) and dev/grapedle.dev.js
npm test
```

`data/source/adelaide_2023_summary.csv` is regenerated with:

```
python scripts/extract_adelaide.py "<folder with the Adelaide Excel files>"
```

## Language

Code and comments are in English. Player-facing text is Dutch by default, with an English toggle.
