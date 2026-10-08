"""Build a per-variety summary from the Adelaide winegrape area database.

Source: Anderson, K., S. Nelgen and G. Puga, Database of Regional, National
and Global Winegrape Bearing Areas by Variety, 2000 to 2023, Wine Economics
Research Centre, University of Adelaide, December 2025 (revised March 2026).
https://doi.org/10.25909/32870405.v1

The raw Excel files are not committed. Download them from the DOI above and
run:

    python scripts/extract_adelaide.py <folder-with-excel-files> [output.csv]

Output columns: prime, colour (W/R/G as in the source; G = pink-skinned,
treated as white in the game), origin, origin_source, area_ha, area_year,
area_2000_ha, area_2016_ha, trend_2010_2023_pct (like-for-like: countries
reporting the variety in both 2010 and 2023),
top1-top3 (countries by 2023 area), synonyms.
"""

import collections
import csv
import sys

import openpyxl


def rows(folder, filename, sheet):
    wb = openpyxl.load_workbook(f"{folder}/{filename}", read_only=True)
    it = wb[sheet].iter_rows(values_only=True)
    header = next(it)
    return [dict(zip(header, r)) for r in it]


def main(folder, out_path):
    synonyms = collections.defaultdict(list)
    meta = {}
    for r in rows(folder, "(c) Names of prime varieties and synonyms.xlsx", "Primes and synonyms"):
        prime = r["prime"]
        meta[prime] = (r["pcolour"], r["porigin"], r["psource"])
        if r["prime_or_synonym"] != prime:
            synonyms[prime].append(r["prime_or_synonym"])

    world = {r["prime"]: r for r in rows(folder, "(b) Varieties 2000 to 2023.xlsx", "World ranking 2023")}

    by_country = collections.defaultdict(list)
    # Like-for-like trend: only countries reporting the variety in both 2010
    # and 2023, so changes in reporting coverage don't read as plantings.
    trend = collections.defaultdict(lambda: [0.0, 0.0])
    for r in rows(folder, "(b) Varieties 2000 to 2023.xlsx", "All countries"):
        if r["area2023"]:
            by_country[r["prime"]].append((r["area2023"], r["country"]))
        if r["area2010"] and r["area2023"]:
            trend[r["prime"]][0] += r["area2010"]
            trend[r["prime"]][1] += r["area2023"]

    out = []
    for prime, w in world.items():
        if not prime or prime == "other":
            continue
        # Fall back to 2016 when a variety has no 2023 figure.
        area, year = w["area2023"], 2023
        if not area:
            area, year = w["area2016"], 2016 if w["area2016"] else None
        top = sorted(by_country[prime], reverse=True)[:3]
        colour, origin, source = meta.get(prime, (None, None, None))
        out.append({
            "prime": prime,
            "colour": colour,
            "origin": origin,
            "origin_source": source,
            "area_ha": round(area) if area else "",
            "area_year": year or "",
            "area_2000_ha": round(w["area2000"]) if w["area2000"] else "",
            "area_2016_ha": round(w["area2016"]) if w["area2016"] else "",
            "trend_2010_2023_pct": (
                round((trend[prime][1] - trend[prime][0]) / trend[prime][0] * 100, 1)
                if trend[prime][0] >= 1 else ""
            ),
            "top1": top[0][1] if len(top) > 0 else "",
            "top2": top[1][1] if len(top) > 1 else "",
            "top3": top[2][1] if len(top) > 2 else "",
            "synonyms": "; ".join(synonyms[prime]),
        })

    out.sort(key=lambda r: -(r["area_ha"] or 0))
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(out[0]))
        writer.writeheader()
        writer.writerows(out)
    print(f"{len(out)} varieties written to {out_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "data/source/adelaide_2023_summary.csv")
