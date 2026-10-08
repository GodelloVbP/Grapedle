# Grapedle — notes for agents

Full spec: https://claude.ai/code/artifact/ec2d449d-3aee-4533-979f-24cad0284fc3 (Grapedle — Spec v1). The spec wins over anything here.

## Hard rules

- No backend, no build-time network calls from the game. Everything ships in `dist/`.
- All CSS is scoped under `#grapedle-root` with a `gd-` class prefix. The host site is Squarespace 7.1 with heavy custom CSS; nothing may leak either way.
- Do not depend on the host site's `window.VBP` utilities. The bundle is self-contained.
- localStorage access is always wrapped in try/catch; the game must play without it.
- Day rollover is 00:00 Europe/Amsterdam via `Intl.DateTimeFormat`. No date libraries.
- `data/schedule.json` is append-only. Never regenerate past or upcoming dates.
- Code and comments in English. Player-facing strings in Dutch (`nl`) and English (`en`).
- Never commit raw source datasets (the Adelaide Excel files, book scans). Only derived figures with a citation.

## Data rules

- Grape ids are slugs of the Adelaide prime name (`garnacha-tinta`, `mazuelo`, `corvina-veronese`). Common names go in `synonyms`.
- Tinta de Toro is Tempranillo. Grenache is Garnacha Tinta. Carignan is Mazuelo. Trebbiano di Soave is Verdicchio. Shop categories may keep their own names; `data/shop-grapes.json` maps them.
- Pink-skinned grapes (source colour `G`) count as white.
- Flavour descriptors: primary aromas only, WSET Level 3 SAT lexicon terms, each descriptor backed by two independent sources (see spec).
- Every non-trivial field records its source in the record's `sources` object.
