# Grapedle

A daily grape-guessing game for [Vino by Palazzo](https://www.vinobypalazzo.nl/grapedle). One grape per day, the same for everyone, six guesses. Each guess is scored on six attributes: colour (kleur), signature region (regio, with distance and direction), body (body, light to full with an arrow towards the answer), world planted area (aanplant, the guess's own hectares with an arrow towards the answer) flavour profile (smaakprofiel, as emoji chips) and common style (stijl: sparkling, sweet, fortified, rosé, oaked, crisp, aromatic, blend). Two hints unlock after 3 and 5 guesses. The daily answer comes from a pool of 55 grapes; about 200 more grapes can be guessed but never are the answer.

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
- Body: Wine Folly grape pages (URL per grape in `sources.body`), overridden by the owner's copy of Gatinois, *Explore Wine Maps* where `body_book.json` has an entry.
- Hints: one source URL per grape in `data/source/hints.json`.

## Game rules in short

Regio tile: one line per region of the guess ("Rhône 550 km →", "Barossa 15.700 km ↘"). A region the answer also has is bold and has no distance; every other region shows its own km (rounded to 50) and an 8-way arrow towards the nearest answer region. The tile colour stays as in the table.

| Column | Green | Yellow | Red |
|---|---|---|---|
| Kleur | same colour (pink counts as white) | | other colour |
| Regio | same signature region | same country, with km (rounded to 50) and an 8-way arrow | other country, km and arrow |
| Body | same body | | yellow when one step off, red otherwise, with the guess's body and an arrow (↑ answer fuller, ↓ lighter); grey when unknown |
| Aanplant | only the same grape | | yellow when the answer is within a factor 2, red otherwise, with the guess's hectares and an arrow, see below |
| Smaakprofiel | at least 2 identical aromas | 1 identical aroma, or 3 shared aroma families | no overlap; grey when unknown |

Body shows the guess's own body label (Licht, Medium-licht, Medium, Medium-vol, Vol; en Light, Medium-light, Medium, Medium-full, Full): green when equal to the answer's, otherwise yellow (one step off) or red with ↑ (the answer is fuller) or ↓ (lighter); grey "onbekend" when either grape has no body. Source: Wine Folly body labels mapped to 1-5 (`data/source/body_batch*.json`, source URL in `sources.body`); the optional `data/source/body_book.json` (`[{id, body, source}]`, source "Gatinois, Explore Wine Maps") takes precedence. Grapes without a value have `body: null`.

Aanplant shows the guess's own world area rounded to 2 significant figures ("280.000 ha" in nl, "280,000 ha" in en) and an arrow pointing to the answer: ↑ the answer has more, ↓ it has less, "=" when the areas are exactly equal (different grapes). The same grape is green with its number. Help line: "Aanplant: hoeveel hectare jouw druif wereldwijd heeft. De pijl wijst naar het antwoord: ↑ meer, ↓ minder. Geel: het antwoord zit binnen een factor 2, rood: verder weg." Share emoji: ⬆️/⬇️, ↔️ equal, 🟩 correct.

Smaakprofiel shows the guess's aromas as chips "emoji label" (`emoji` per descriptor in `data/descriptors.json`, Unicode Emoji 13.0 or older; the label is always shown). An aroma identical to one of the answer's is a filled green chip with ✓ and bold; an aroma whose family (`cluster`) matches one of the answer's families gets a yellow outline; others are plain. A legend line sits under the board and in the help. The end screen's answer card lists the answer's aromas as chips too.

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
