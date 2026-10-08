# Grapedle

A daily grape-guessing game for [Vino by Palazzo](https://www.vinobypalazzo.nl/grapedle). One grape per day, the same for everyone, six guesses. Each guess is scored on nine attributes: colour, origin, most-planted country, parentage, climate, ripening, flavour profile, planted area and first mention.

The game is a static bundle served from this repo through jsDelivr and embedded on a Squarespace page with a single code block. There is no backend.

## Layout

```
data/         grapes.json, descriptors.json, schedule.json, countries.json, shop-grapes.json
data/source/  derived extracts from the source datasets (raw files are not committed)
scripts/      data extraction and schedule builder
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
- Anderson, K. and S. Nelgen, *Which Winegrape Varieties are Grown Where?* (revised edition), University of Adelaide Press, 2020. Used for climate class.
- [VIVC](https://www.vivc.de), Vitis International Variety Catalogue. Used for parentage.
- Robinson, J., J. Harding and J. Vouillamoz, *Wine Grapes*, Allen Lane, 2012. Used for first mention, ripening and flavour.
- *The Oxford Companion to Wine*, 5th edition, 2023, and WSET Level 3 material. Used for flavour.

`data/source/adelaide_2023_summary.csv` is regenerated with:

```
python scripts/extract_adelaide.py "<folder with the Adelaide Excel files>"
```

## Language

Code and comments are in English. Player-facing text is Dutch by default, with an English toggle.
