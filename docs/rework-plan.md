# Grapedle rework plan — v3 (final, executing)

Updated 2026-10-09 after the owner review (five columns incl. body, number-and-arrow Aanplant, emoji Smaakprofiel, first-letter hint 2, practice mode, teaser, release process). Reviewed twice by two reviewers each round (one with full project context, one cold). v2 → v3 resolves every round-2 finding. v0 was never live; schedule, data and storage change freely until launch day, which becomes the start of the append-only rule.

## Game constants
- One daily puzzle. 6 guesses. Puzzle #1 = launch date (set in `data/schedule.json` `start`). Day changes at 00:00 Europe/Amsterdam.
- All 136 grapes (the 111 shortlist plus 26 owner-chosen extras, `GUESS_EXTRAS`) are guessable every day; the guess list never reveals the answer pool.
- Loss: the answer is revealed; share line reads `X/6`.
- Before the launch date there is no puzzle 1: a teaser with a countdown and practice puzzles only.
- Hint buttons unlock after 3 and 5 submitted guesses and lock when the game ends. Each hint used adds one 💡 to the share line.
- Storage key `gd:v2`. Stats (played, win %, streak, best, distribution) and the countdown stay as in v0.

## Answer pool (all 136, owner decision 2026-10-09)
Supersedes the list below: every grape is a possible daily answer, each with a sourced hint (Wikipedia, one URL per grape). The 32 most obscure grapes are weekend-only. The list below is the original 56 and stays for reference.

The 40 classics minus Airén, Muscat of Alexandria, Petit Verdot, Trebbiano Toscano, Torrontés Riojano; plus Lambrusco (Salamino), Vermentino, Verdejo, Nero d'Avola, Zweigelt, Blaufränkisch, Müller-Thurgau; plus every stocked grape (Roter Sylvaner → Silvaner; Maturana Tinta → Trousseau). The ~55 other old-pool grapes stay guessable with full data (they return as a "Kenner" mode later).

## Schedule rules
- Seeded shuffle of the pool, no repeat within a cycle, the same grape at least 20 days apart across cycle boundaries.
- Week 1 (first 7 days) only from: cabernet-sauvignon, merlot, syrah, pinot-noir, chardonnay, sauvignon-blanc, riesling, pinot-gris, garnacha-tinta, tempranillo, sangiovese, cot, prosecco, gewurztraminer. Weekend-only grapes therefore start in week 2.
- Obscure stocked grapes (Auxerrois, Corvinone, Rondinella, Croatina, Graciano, Marsanne, Roussanne, Trousseau, Silvaner) only on Saturdays/Sundays.
- Grapes sharing a primary signature region at least 7 days apart; Corvina/Corvinone 21 days apart, Rondinella 14 days from both.
- At least 90 days ahead at all times (build warning, test). After launch the file only grows by whole cycles; `data/schedule.released.json` (copied at each tagged release) must be a prefix.

## Columns (6) and exact rules
| # | Column | Rule |
|---|---|---|
| 1 | Kleur | 🟩 same colour, 🟥 otherwise. Pink-skinned counts as white. |
| 2 | Regio (signature region: where the grape is best known — Rhône for Marsanne, Rioja for Tempranillo, Mendoza for Malbec; up to two) | 🟩 same region set (two different grapes from one region also give 🟩); 🟨 a region in common (no distance) or the same country; 🟥 otherwise. Country-yellow and red tiles show distance in km (rounded to 50) and an 8-way arrow, the initial great-circle bearing from the guess's region point to the answer's. |
| 3 | Body (Wine Folly label mapped to 1-5: Licht, Medium-licht, Medium, Medium-vol, Vol; en Light … Full; `data/source/body_batch*.json`, override `body_book.json` from Gatinois, Explore Wine Maps; null when unknown) | Tile shows the guess's body. 🟩 equal to the answer's body; otherwise 🟨 (one step off) or 🟥 with ↑ (answer fuller) or ↓ (lighter); ⬜ "onbekend" when either is null. Help: "Body: hoe vol de wijn aanvoelt, van licht tot vol. De pijl wijst naar het antwoord: ↑ voller, ↓ lichter." Also shown on the end-screen answer card. |
| 4 | Stijl (common style, max 3 of sparkling, sweet, fortified, rosé, oaked, crisp, aromatic, blend; none = plain dry still, `data/styles.json`) | 🟩 identical sets; 🟨 at least one in common; 🟥 none; ⬜ unknown. Chips "emoji label", shared styles green with ✓. Wide: after Body; narrow: row 2 next to Regio. Shown on the end-screen answer card. |
| 5 | Aanplant (world planted area, Adelaide, latest year per country) | Neutral tile with the guess's own world area rounded to 2 significant figures (nl "280.000 ha", en "280,000 ha") and an arrow pointing to the answer: ↑ answer has more, ↓ less, "=" exactly equal areas of different grapes. 🟩 (with its number) only for the same grape. |
| 6 | Smaakprofiel (3–4 WSET primary aromas) | 🟩 ≥2 identical aromas; 🟨 1 identical aroma, or ≥3 shared aroma families; 🟥 otherwise; ⬜ "onbekend" when either grape has no aroma data. The tile lists the guess's aromas as chips "emoji label" (`emoji` field in `data/descriptors.json`, Emoji 13.0 or older, label always shown). Identical aromas: filled green chip with ✓, bold. Aromas whose family matches one of the answer's families: yellow outline. Families = the `cluster` field. Legend under the board: "✓ groen = zelfde aroma, gele rand = zelfde soort aroma". |

The climate column of the earlier plan was dropped; climate is not part of the data or the bundle.

Help: first visit shows one line, the example row and "Begrepen" without scrolling at 390×700; the per-column details sit in a collapsed "Meer uitleg", which also mentions that the day changes at midnight Dutch time. Empty boards show the column headers.

## Hints
- After 3 guesses: "Bekend van" — the best-known appellation or wine (Barolo, Sancerre, Valpolicella). A script rejects any hint containing the grape's display name, official name or a synonym (so "Prosecco DOC", "Muscadet" and "Cava" are not allowed for those grapes; use e.g. "Conegliano-Valdobbiadene", "Sèvre et Maine", "Sant Sadurní d'Anoia").
- After 5 guesses: the first letter only ("Begint met C"), no length.

## Names
Display the name customers know, official name in small print on the answer card: Grenache (Garnacha Tinta), Carignan (Mazuelo), Muscadet (Melon), Prosecco (Glera), Friulano, Malbec, Zinfandel / Primitivo, Albariño, Welschriesling. Shop categories keep their names via `shop-grapes.json` (Garnacha and Grenache both → garnacha-tinta; Roter Sylvaner → silvaner; Maturana Tinta → trousseau).

## Result screen
Order: result line (a win adds a one-line cheer by guess count: Onwaarschijnlijk!, Meesterlijk, Uitstekend, Mooi, Goed gedaan, Op het nippertje) → answer card (name, official name in small print, regions, aromas as emoji chips, an optional sourced "Wist je dat" line) → share button → countdown → "Oefenen" → shop section → tastings link. The winning row flips and pulses (not with prefers-reduced-motion).
- Stocked: up to 4 wine tiles. Not stocked: "Lijkt op" — up to 3 stocked wines of the same colour with at least 2 identical aromas (or 1 identical plus the same primary-region country); otherwise no tiles, only the tastings link. A tile without a price has no price line.
- Shop fetch times out after 4 s; on failure show the answer card and the tastings link, never empty tiles. Only https: and relative URLs from the feed are used.
- Links carry `utm_source=grapedle&utm_medium=game`. If `window.dataLayer` exists (the site runs GTM), push events: start (once per puzzle per page view), guess, hint, win, loss, share, shop_click. Practice pushes none.

## Practice
"Oefenen" in the header and on the end screen: any past puzzle (newest first, at most 60, with date) or "Willekeurig". Before launch only a random pool grape (never one of the first 14 days' answers). Practice is labelled "Oefenpuzzel #12 — telt niet mee", keeps its state in memory only and never touches stats, streak or storage. Future puzzles are never offered.

## Share
```
Grapedle #12 4/6 💡
🟥🟨⬆️🟥⬇️🟨
🟥🟩🟩🟨⬆️🟨
🟩🟩⬜⬜↔️🟩
🟩🟩🟩🟩🟩🟩
vinobypalazzo.nl/grapedle
```
Order: kleur, regio, body, stijl, aanplant, smaak. ⬆️/⬇️ for the arrow direction (body, aanplant), ↔️ for exactly equal areas, 🟩 correct; ⬜ for unknown body or flavour. Clipboard fallback when `navigator.share` is missing.

## Data jobs
1. Signature regions (Sonnet, then owner sign-off for the 56): for the 111 old-pool grapes, one curated wine region each with country, a hand-placed lat/lon and a source note. The other guessable grapes use their top country and a country point.
2. Aromas (Haiku, three parallel batches) for the 111 old-pool grapes: 3–4 ids from `descriptors.json`, each backed by two independent NON-Wikipedia sources (appellation/producer bodies, wine schools such as WSET/Guild/Wine Folly, published references, aroma studies); Wikipedia only as a third. URL plus ≤12-word quote per source. Opus checks all 26 stocked grapes and 20% of the rest; the owner checks stocked grapes against Explore Wine Maps.
3. "Bekend van" (Haiku) for the 56 pool grapes, one source each, then the validator script.

## Engineering
- Remove parentage, ripening, trend, most-planted, origin and climate columns.
- Trim synonyms to what autocomplete needs; keep the shop fixture out of the production bundle (dynamic import or dev-only build flag).
- Tests: every column rule incl. bearing/distance, flavour scoring, hint validator, schedule rules, a difficulty simulation for a casual player who knows ~15 grapes (target ≥60% with hints on weekdays; report weekend rate separately).
- Update README and CLAUDE.md (column set, schedule start rule).

## Later (release 2)
Kenner mode with the obscure pool, "Mogelijk" candidate count, newsletter CTA once the owner fixes the newsletter block's storage in Squarespace.
