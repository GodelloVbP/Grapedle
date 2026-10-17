# Grapedle

A daily grape-guessing game for [Vino by Palazzo](https://www.vinobypalazzo.nl/grapedle). One grape per day, the same for everyone, six guesses. Each guess is scored on six attributes: colour (kleur), signature region (regio, with distance and direction), body (body, light to full with an arrow towards the answer), world planted area (aanplant, the guess's own hectares with an arrow towards the answer) flavour profile (smaakprofiel, as emoji chips) and common style (stijl: sparkling, sweet, fortified, rosé, oaked, crisp, aromatic, blend). Two hints unlock after 3 and 5 guesses. Every one of the 121 grapes can be the daily answer and can be guessed (136 until 2026-10-17, when the owner dropped 15 grapes (lacking data, or under 1,000 ha planted) and merged the two Refoscos into one: `DROP_IDS` in `scripts/build_data.py`). Every grape has body, aroma and style data. The most obscure answers (`weekend_only` in `answer_pool.csv`) only fall on Saturdays and Sundays. After a 2026-10-17 review every grape has a named signature region, a reviewed hint and body, aroma and style data; reviewed corrections live in `data/source/*_override.json`.

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
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/GodelloVbP/Grapedle@1/dist/grapedle.min.css">
<script src="https://cdn.jsdelivr.net/gh/GodelloVbP/Grapedle@1/dist/grapedle.min.js" defer></script>
```

The URLs use the major-version range `@1`: jsDelivr serves the newest `v1.x.y` tag, so a data or hint fix ships with a new tag and the Code Block never changes. Never point at a branch. All CSS is scoped under `#grapedle-root` with a `gd-` prefix and resets bare elements and form controls (with `!important` on button/input visuals, because Squarespace form styles are very specific). The bundle is pure ASCII (esbuild `charset: 'ascii'`, checked by the build), so it works even when served without a UTF-8 charset. The game opens no pop-up by itself: first visitors get an inline intro, so nothing can cover the host's age gate.

## Release process

1. Bump `version` in `package.json` (stay on 1.x so the `@1` embed picks it up).
2. `npm run data && npm run build && npm test`.
3. `npm run release:freeze` copies `data/schedule.json` to `data/schedule.released.json`. From then on a test requires `schedule.json` to start with exactly those days.
4. `npm run release:check` (dist matches a fresh build of src, tests pass, the README embed range matches the major version, and HEAD's `vX.Y.Z` tag if present).
5. Commit, `git tag vX.Y.Z`, `git push --tags`.
6. Purge the jsDelivr cache so players get it right away: open `https://purge.jsdelivr.net/gh/GodelloVbP/Grapedle@1/dist/grapedle.min.js` and the same URL ending in `grapedle.min.css`. Without a purge the range URL can keep serving the previous version for a while.

The schedule needs at least 90 days ahead: the build prints a warning and a test fails below that. Extend with `python3 scripts/build_data.py --days <more>` (whole cycles are appended, released days never change).

## Data sources

- Anderson, K., S. Nelgen and G. Puga, *Database of Regional, National and Global Winegrape Bearing Areas by Variety, 2000 to 2023*, Wine Economics Research Centre, University of Adelaide, December 2025 (revised March 2026). [doi:10.25909/32870405.v1](https://doi.org/10.25909/32870405.v1). Used for variety names and synonyms, berry colour, country of origin, 2023 planted area and top countries.
- Anderson, K. and S. Nelgen, *Which Winegrape Varieties are Grown Where?* (revised edition), University of Adelaide Press, 2020. Used for the signature regions (Table 75 region names). The climate class that was derived from it is no longer a game column; the climate extracts stay in `data/source/` for reference only.
- Gatinois, *Explore Wine Maps*. Aromas where the owner's copy has an entry; otherwise Wine Folly, Jancis Robinson and Wikipedia (the URL per grape is in the `sources` object of `data/grapes.json`).
- Body: Wine Folly grape pages (URL per grape in `sources.body`), overridden by the owner's copy of Gatinois, *Explore Wine Maps* where `body_book.json` has an entry.
- Hints: one source URL per grape in `data/source/hints.json`.
- Wikipedia: one English article per grape in `data/source/wikipedia.json` (`wiki` in `grapes.json`), linked from the end card.

## Game rules in short

Regio tile: one line per region of the guess with its country under it ("Piëmont / Italië / 250 km ←"; Dutch region names via `regionLabel` in `src/i18n.js`). A region the answer also has is bold and has no distance; every other region shows its own km (rounded to 50; the same point reads "zelfde plek") and an 8-way arrow towards the nearest answer region. The arrow is the rhumb-line bearing, the heading a flat map shows. The tile colour stays as in the table.

| Column | Green | Yellow | Red |
|---|---|---|---|
| Kleur | same colour (pink counts as white) | | other colour |
| Regio | same signature region | same country, with km (rounded to 50) and an 8-way arrow | other country, km and arrow |
| Body | same body | | yellow when one step off, red otherwise, with the guess's body and an arrow (↑ answer fuller, ↓ lighter); grey when unknown |
| Aanplant | only the same grape | | yellow when the answer is within a factor 2, red otherwise, with the guess's hectares and an arrow, see below |
| Stijl | identical style sets ("blend" is shown but never counts) | at least one style in common | none; grey when unknown |
| Smaakprofiel | at least 3 identical aromas, or identical sets | 1-2 identical aromas, or 3 shared aroma families | no overlap; grey when unknown |

Body shows the guess's own body label (Licht, Medium-licht, Medium, Medium-vol, Vol; en Light, Medium-light, Medium, Medium-full, Full): green when equal to the answer's, otherwise yellow (one step off) or red with ↑ (the answer is fuller) or ↓ (lighter); grey "onbekend" when either grape has no body. Source: Wine Folly body labels mapped to 1-5 (`data/source/body_batch*.json`, source URL in `sources.body`); the optional `data/source/body_book.json` (`[{id, body, source}]`, source "Gatinois, Explore Wine Maps") takes precedence. Grapes without a value have `body: null`.

Aanplant shows the guess's own world area rounded to 2 significant figures ("280.000 ha" in nl, "280,000 ha" in en) and an arrow pointing to the answer: ↑ the answer has more, ↓ it has less, "=" when the areas are exactly equal (different grapes). The same grape is green with its number. Help line: "Aanplant: hoeveel hectare jouw druif wereldwijd heeft. De pijl wijst naar het antwoord: ↑ meer, ↓ minder. Geel: het antwoord zit binnen een factor 2, rood: verder weg." The share text uses only the colour square of each tile (🟩🟨🟥⬜).

Smaakprofiel shows the guess's aromas as chips "emoji label" (`emoji` per descriptor in `data/descriptors.json`, Unicode Emoji 13.0 or older; the label is always shown). An aroma identical to one of the answer's is a filled green chip with ✓ and bold; an aroma whose family (`cluster`) matches one of the answer's families gets a dashed dark outline and ≈; others are plain. The legend sits in the help. The end screen's answer card lists the answer's aromas as chips too.

Hints: after 3 guesses "Bekend van" (appellation or wine), after 5 guesses the first letter ("Begint met C"). Each hint used adds a 💡 to the share text. State is stored under `gd:v2` and normalised on load (damaged data never breaks the game).

Look-alikes (`data/lookalikes.json`: Corvina/Corvinone/Rondinella, Marsanne/Roussanne): when the player guesses a grape from the answer's group, a note under the board says they are extremely similar and usually blended; the end card says it too.

On a narrow column every guess except the newest collapses to one line (name plus six mini tiles); tapping a line opens it. First visitors get an inline intro (no pop-up).

Before the launch date the game shows a teaser with a countdown and offers practice puzzles only. Practice ("Oefenen", also on the end screen) plays any past puzzle or a random one, never counts for stats or streak, is kept in memory and never offers a future puzzle. Dev only: `?now=YYYY-MM-DD` fakes the date, `?day=N` shows puzzle N.

On touch devices (`(hover: none) and (pointer: coarse)`) the native keyboard is replaced by an on-screen keyboard, because the native one covers the board. The input gets `inputmode="none"`, the board moves above the input in chronological order (newest guess right above the keys), suggestions float as wrapping chips over the board just above the input (every grape starting with the first 1-2 letters, A-Z, no cap), and letters that cannot continue any grape name or synonym are dimmed and inert (`src/keyboard.js`, `nextKeys`). Backspace repeats when held. A physical keyboard still types into the input. Dev only: `?kb=1` forces the on-screen keyboard on desktop.

Search ranks an exact name or synonym first, then answer-pool grapes, then name prefix, synonym prefix, substring. Enter submits an exact match, the suggestion picked with the arrow keys or pointer, or otherwise the top suggestion not guessed yet. The end screen's "Lijkt op" needs at least 2 identical aromas (or 1 plus the same colour and primary-region country), else only the tastings link shows. Shop links and images must be https: or relative.

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
