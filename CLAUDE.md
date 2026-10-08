# Grapedle — notes for agents

Full spec: https://claude.ai/code/artifact/ec2d449d-3aee-4533-979f-24cad0284fc3 (Grapedle — Spec v1). The spec wins over anything here.

## Hard rules

- No backend, no build-time network calls from the game. Everything ships in `dist/`.
- All CSS is scoped under `#grapedle-root` with a `gd-` class prefix. The host site is Squarespace 7.1 with heavy custom CSS; nothing may leak either way.
- Do not depend on the host site's `window.VBP` utilities. The bundle is self-contained.
- localStorage access is always wrapped in try/catch; the game must play without it.
- Day rollover is 00:00 Europe/Amsterdam via `Intl.DateTimeFormat`. No date libraries.
- `data/schedule.json` is append-only from the launch date in its `start` field (placeholder `2026-11-01` until launch; before launch it may be regenerated). After launch never regenerate past or upcoming dates; `scripts/build_data.py` only appends whole cycles.
- Code and comments in English. Player-facing strings in Dutch (`nl`) and English (`en`).
- The game has five columns: kleur, regio, klimaat, aanplant, smaakprofiel, plus two hints. The plan in `docs/rework-plan.md` is binding. `data/source/answer_pool.csv` is the daily answer pool (55); every other grape is guessable only.
- Hints in `data/source/hints.json` must not contain the grape's display name, official name or a synonym, nor another pool grape's display name. `build_data.py` fails the build when one does; fix the hint, not the validator.
- `data/grapes.json` is generated (`npm run data`): edit the files in `data/source/` or the tables in `scripts/build_data.py`, not the output.
- The shop fixture (`tests/fixtures/shop.json`) must never reach `dist/`; `scripts/build.mjs` fails if it does.
- Never commit raw source datasets (the Adelaide Excel files, book scans). Only derived figures with a citation.

## Data rules

- Grape ids are slugs of the Adelaide prime name (`garnacha-tinta`, `mazuelo`, `corvina-veronese`). Common names go in `synonyms`.
- Tinta de Toro is Tempranillo. Grenache is Garnacha Tinta. Carignan is Mazuelo. Trebbiano di Soave is Verdicchio. Shop categories may keep their own names; `data/shop-grapes.json` maps them.
- Pink-skinned grapes (source colour `G`) count as white.
- Flavour descriptors: ids from `data/descriptors.json` only. Sources in order of precedence: the owner's copy of Gatinois, *Explore Wine Maps* (`aromas_book.json`), then Wine Folly, Jancis Robinson and Wikipedia (`aromas_batch*.json`); aromas confirmed by two of those sites rank first.
- Every non-trivial field records its source in the record's `sources` object.
