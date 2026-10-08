"""Build a per-variety summary from the Adelaide winegrape area database.

Source: Anderson, K., S. Nelgen and G. Puga, Database of Regional, National
and Global Winegrape Bearing Areas by Variety, 2000 to 2023, Wine Economics
Research Centre, University of Adelaide, December 2025 (revised March 2026).
https://doi.org/10.25909/32870405.v1

The raw Excel files are not committed. Download them from the DOI above and
run:

    python scripts/extract_adelaide.py <folder-with-excel-files> [output.csv]

Output columns: prime, colour (W/R/G as in the source; G = pink-skinned,
treated as white in the game), origin, origin_source, area_ha (sum over
countries of each country's latest year, 2023 else 2016), area_year (basis),
area_2000_ha, area_2016_ha, trend_2010_2023_pct (like-for-like: countries
reporting the variety in both 2010 and 2023; falls back to 2010-2016),
trend_period,
top1-top3 (countries by 2023 area), synonyms.
"""

import collections
import csv
import sys

import openpyxl


# Varieties the database splits under two primes that are one grape.
# Croatia reports Plavac Mali under "Plavac Mali Crni" from 2023 on.
MERGE = {"Plavac Mali Crni": "Plavac Mali"}


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

    # Per country, use the latest year that country reports for the variety
    # (2023, else 2016). Some countries, notably Italy for many minor
    # varieties, have no 2023 figure, and the world 2023 total then drops
    # them entirely (Corvinone would read 0 ha).
    latest = collections.defaultdict(dict)       # prime -> country -> (area, year)
    pairs = collections.defaultdict(list)        # prime -> [(country, a2010, a2016, a2023)]
    for r in rows(folder, "(b) Varieties 2000 to 2023.xlsx", "All countries"):
        prime = MERGE.get(r["prime"], r["prime"])
        country = r["country"]
        if r["area2023"]:
            prev = latest[prime].get(country)
            year_area = (r["area2023"] + (prev[0] if prev and prev[1] == 2023 else 0), 2023)
            latest[prime][country] = year_area
        elif r["area2016"] and latest[prime].get(country, (0, 0))[1] != 2023:
            prev = latest[prime].get(country)
            latest[prime][country] = (r["area2016"] + (prev[0] if prev else 0), 2016)
        pairs[prime].append((country, r["area2010"], r["area2016"], r["area2023"]))

    def trend_for(prime):
        """Like-for-like 2010->2023 change over countries reporting both years;
        falls back to 2010->2016 when no country reports both 2010 and 2023."""
        for end_idx, period in ((3, "2010-2023"), (2, "2010-2016")):
            a = b = 0.0
            for p in pairs[prime]:
                if p[1] and p[end_idx]:
                    a += p[1]
                    b += p[end_idx]
            if a >= 1:
                return round((b - a) / a * 100, 1), period
        return "", ""

    out = []
    for prime, w in world.items():
        if not prime or prime == "other" or prime in MERGE:
            continue
        countries = latest.get(prime, {})
        area = sum(a for a, _ in countries.values())
        years = {y for _, y in countries.values()}
        basis = "2023" if years == {2023} else "2023+2016" if 2023 in years else "2016" if years else ""
        top = sorted(((a, c) for c, (a, _) in countries.items()), reverse=True)[:3]
        colour, origin, source = meta.get(prime, (None, None, None))
        trend_pct, trend_period = trend_for(prime)
        out.append({
            "prime": prime,
            "colour": colour,
            "origin": origin,
            "origin_source": source,
            "area_ha": round(area) if area else "",
            "area_year": basis,
            "area_2000_ha": round(w["area2000"]) if w["area2000"] else "",
            "area_2016_ha": round(w["area2016"]) if w["area2016"] else "",
            "trend_2010_2023_pct": trend_pct,
            "trend_period": trend_period,
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
