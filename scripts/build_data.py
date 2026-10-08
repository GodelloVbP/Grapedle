#!/usr/bin/env python3
"""Reproducible data builder for Grapedle.

Reads data/source/*.csv and writes data/grapes.json, data/countries.json (borders kept in
scripts/borders.json), data/shop-grapes.json and data/schedule.json (append-only).

    python3 scripts/build_data.py [--days 730] [--start 2026-11-01]
"""
import csv, json, os, re, sys, unicodedata, argparse
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "source")
OUT = os.path.join(ROOT, "data")
TARGET_TOTAL = 260
SCHEDULE_SEED = 20261101

NAME_OVERRIDES = {"Silvaner (R)": "Roter Sylvaner"}

COUNTRY_ISO = {
    "Italy": "IT", "France": "FR", "Portugal": "PT", "United States": "US", "United StatesR": "US",
    "Spain": "ES", "Hungary": "HU", "Hunary": "HU", "Germany": "DE", "Switzerland": "CH",
    "Croatia": "HR", "Greece": "GR", "Romania": "RO", "Moldova": "MD", "Serbia": "RS",
    "Argentina": "AR", "Ukraine": "UA", "Georgia": "GE", "Austria": "AT", "Russia": "RU",
    "Turkey": "TR", "Turkiye": "TR", "Japan": "JP", "Armenia": "AM", "Canada": "CA",
    "Brazil": "BR", "Bulgaria": "BG", "South Africa": "ZA", "Cyprus": "CY", "yprus": "CY",
    "Slovenia": "SI", "Czech Rep.": "CZ", "Czechia": "CZ", "Slovakia": "SK", "Albania": "AL",
    "China": "CN", "Azerbaijan": "AZ", "Peru": "PE", "Morocco": "MA", "Chile": "CL",
    "Montenegro": "ME", "Lebanon": "LB", "Israel": "IL", "Australia": "AU", "Poland": "PL",
    "Turkmenistan": "TM", "United Kingdom": "GB", "North Macedonia": "MK", "Macedonia": "MK",
    "Kazakhstan": "KZ", "Bosnia and Herzegovina": "BA", "Bosnia": "BA", "Thailand": "TH",
    "Taiwan": "TW", "Lithuania": "LT", "New Zealand": "NZ", "Algeria": "DZ", "Latvia": "LV",
    "Uzbekishtan": "UZ", "Belgium": "BE", "Korea, Rep.": "KR", "Denmark": "DK", "Mexico": "MX",
    "Ethiopia": "ET", "Uruguay": "UY", "Tunisia": "TN", "India": "IN", "Luxembourg": "LU",
    "Netherlands": "NL",
}

# Hybrids, table grapes and duplicates we never want in the guess pool.
GUESS_SKIP = {n.lower() for n in [
    "Concord", "Niagara", "Isabella", "Kyoho (4N)", "Sultaniye", "Bordô", "Couderc Noir",
    "Flame Seedless", "Red Globe", "Superior Seedless", "Cardinal", "Italia", "Rubired",
    "Muscat Bailey A", "Jacquez", "Seyval Blanc", "Violeta", "Cora", "Moscato Embrapa",
    "Fiesta", "Yan 73", "Terbash", "Muscat of Hamburg", "Baco Blanc", "Alphonse Lavallée",
    "Siroka Melniska", "Tinto De La Pámpana Blanca", "Moldova", "Cereza", "Kangun",
]}

EXTRA_SYNONYMS = {
    "garnacha-tinta": ["Grenache", "Garnacha", "Grenache Noir"],
    "mazuelo": ["Carignan", "Cariñena", "Carignano"],
    "tempranillo": ["Tinta de Toro", "Tinto Fino", "Tinta del País"],
    "verdicchio-bianco": ["Trebbiano di Soave", "Verdicchio"],
    "prosecco": ["Glera"],
    "cot": ["Malbec"],
    "tribidrag": ["Zinfandel", "Primitivo"],
    "syrah": ["Shiraz"],
    "pinot-gris": ["Grauburgunder", "Pinot Grigio"],
    "pinot-noir": ["Spätburgunder", "Pinot Nero", "Blauburgunder"],
    "pinot-blanc": ["Weissburgunder", "Pinot Bianco"],
    "alvarinho": ["Albariño"],
    "monastrell": ["Mourvèdre", "Mataro"],
    "sauvignonasse": ["Friulano", "Tocai Friulano"],
    "grasevina": ["Welschriesling", "Riesling Italico", "Olaszrizling"],
    "blaufrankisch": ["Lemberger", "Kékfrankos"],
    "schiava-grossa": ["Trollinger", "Vernatsch"],
    "trebbiano-toscano": ["Ugni Blanc"],
    "melon": ["Muscadet"],
    "vermentino": ["Rolle"],
    "cinsaut": ["Cinsault"],
    # Maturana Tinta is Trousseau: VIVC synonym list, Wine Grapes (DNA), and
    # Adelaide all agree. The DOCa Rioja page only says DNA "seems to link" it
    # to Castets.
    "trousseau": ["Maturana Tinta", "Maturana Tinta de Navarrete", "Bastardo", "Merenzao"],
}

SHOP = {
    "Auxerrois": "Auxerrois", "Cabernet Sauvignon": "Cabernet Sauvignon", "Cinsault": "Cinsaut",
    "Corvina": "Corvina Veronese", "Corvinone": "Corvinone", "Croatina": "Croatina",
    "Garnacha": "Garnacha Tinta", "Gewurztraminer": "Gewürztraminer", "Graciano": "Graciano",
    "Grenache": "Garnacha Tinta", "Grenache Blanc": "Garnacha Blanca",
    "Grüner Veltliner": "Grüner Veltliner", "Marsanne": "Marsanne",
    "Maturana Tinta": "Trousseau", "Mazuelo": "Mazuelo", "Merlot": "Merlot",
    "Pinot Blanc": "Pinot Blanc", "Pinot Gris": "Pinot Gris", "Pinot Noir": "Pinot Noir",
    "Riesling": "Riesling", "Rondinella": "Rondinella", "Roter Sylvaner": "Silvaner (R)",
    "Roussanne": "Roussanne", "Garganega": "Garganega", "Trebbiano di Soave": "Verdicchio Bianco",
    "Syrah": "Syrah", "Tempranillo": "Tempranillo", "Tinta de Toro (Tempranillo)": "Tempranillo",
}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def norm(s):
    """Same normalisation as src/text.js: accent/case-insensitive, punctuation-insensitive."""
    s = s.replace("ß", "ss")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def sig2(n):
    n = float(n)
    if n < 100:
        return int(round(n))
    import math
    d = 2 - int(math.floor(math.log10(n))) - 1
    return int(round(n, d))


def rows(name):
    with open(os.path.join(SRC, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def iso(name, problems, ctx):
    name = (name or "").strip()
    if not name:
        return None
    if name not in COUNTRY_ISO:
        problems.append(f"unmapped country '{name}' ({ctx})")
        return None
    return COUNTRY_ISO[name]


GENERIC = {"rose", "red", "white", "noir", "blanc", "rouge", "weisser", "blauer", "gruner", "muskat",
           "tinta", "tinto", "nera", "nero", "bianco", "blanca", "negra", "negro", "black", "muscat"}
MARK = re.compile(r"\s*\((W|R|G)\)\s*$", re.I)


def clean_synonyms(raw):
    out = []
    for part in (raw or "").split(";"):
        s = MARK.sub("", part).strip()
        if (len(s) < 3 or len(s) > 40 or re.search(r"[_\d,/]", s) or " and " in s.lower() or " - " in s
                or s.lower() in GENERIC):
            continue
        out.append(s)
    return out


def mulberry32(seed):
    a = [seed & 0xFFFFFFFF]

    def rnd():
        a[0] = (a[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = a[0]
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rnd


def shuffled(items, seed):
    items = list(items)
    rnd = mulberry32(seed)
    for i in range(len(items) - 1, 0, -1):
        j = int(rnd() * (i + 1))
        items[i], items[j] = items[j], items[i]
    return items


def build_grapes(report):
    adel = rows("adelaide_2023_summary.csv")
    pool = rows("answer_pool_draft.csv")
    clim = {r["prime"]: r["climate_class"] for r in rows("climate_all_2016.csv")}
    by_prime = {r["prime"]: r for r in adel}
    problems = report["problems"]

    def record(a, answer, display=None):
        prime = a["prime"]
        name = display or prime
        colour = "red" if a["colour"] == "R" else "white"
        origin = iso(a["origin"], problems, prime)
        tops = [c for c in (iso(a[k], problems, prime) for k in ("top1", "top2", "top3")) if c]
        tops = list(dict.fromkeys(tops))
        src = {"colour": "Adelaide 2023", "origin": "Adelaide 2023", "area": "Adelaide 2023",
               "topCountries": "Adelaide 2023",
               "climate": "computed, Adelaide 2016 regional + Anderson & Nelgen 2020 Table 75"}
        if prime == "Croatina":
            origin = "IT"
            src["origin"] = "VIVC (Adelaide lists Croatia, which is a name mix-up)"
        area = float(a["area_ha"] or 0)
        basis = a.get("area_year") or "2023"
        if basis != "2023":
            # Countries without a 2023 figure contribute their 2016 figure.
            src["area"] = f"Adelaide, latest year per country ({basis})"
            src["topCountries"] = src["area"]
        if prime == "Croatina":
            tops = list(dict.fromkeys("IT" if t == "HR" else t for t in tops))
            src["topCountries"] += "; Croatia entry read as Italy, same name mix-up as origin"
        if not tops and origin and area > 0:
            tops = [origin]
            src["topCountries"] = "Origin country (Adelaide has no country breakdown for this variety)"
        c = clim.get(prime)
        try:
            trend = round(float(a["trend_2010_2023_pct"]), 1)
        except (ValueError, TypeError, KeyError):
            trend = None
        period = a.get("trend_period") or "2010-2023"
        src["trendPct"] = f"Adelaide, like-for-like area change {period}"
        return {
            "id": slug(prime), "name": name, "prime": prime, "synonyms": [],
            "colour": colour, "origin": origin, "topCountries": tops,
            "climate": c if c in ("cool", "temperate", "warm", "hot") else None,
            "areaHa": sig2(area) if area > 0 else None, "answer": answer,
            "trendPct": trend, "parents": None, "ripening": None, "flavours": None,
            "sources": src, "_rawsyn": a["synonyms"],
        }

    grapes, seen = [], set()
    for p in pool:
        a = by_prime[p["prime"]]
        r = record(a, True, NAME_OVERRIDES.get(p["prime"], p["common"]))
        grapes.append(r)
        seen.add(r["id"])
        for k in ("origin", "area_ha", "top1", "colour"):
            pass
    # Guess pool: by area desc
    cands = sorted(adel, key=lambda r: -float(r["area_ha"] or 0))
    for a in cands:
        if len(grapes) >= TARGET_TOTAL:
            break
        pr = a["prime"]
        if not pr or pr in {p["prime"] for p in pool}:
            continue
        if pr.lower().startswith("other") or pr.endswith(")") or a["colour"] not in ("R", "W", "G"):
            continue
        if pr.lower() in GUESS_SKIP or slug(pr) in seen or not slug(pr):
            continue
        if not a["origin"] or a["origin"] == "USSR":
            continue
        r = record(a, False)
        if not r["origin"] or not r["topCountries"] or not r["areaHa"]:
            continue
        grapes.append(r)
        seen.add(r["id"])

    # Synonyms
    ids = {g["id"]: g for g in grapes}
    for g in grapes:
        cand = []
        if norm(g["prime"]) != norm(g["name"]) and not MARK.search(g["prime"]):
            cand.append(g["prime"])
        cand += EXTRA_SYNONYMS.get(g["id"], [])
        cand += clean_synonyms(g["_rawsyn"])
        g["_cand"] = cand
    for gid in EXTRA_SYNONYMS:
        if gid not in ids:
            problems.append(f"extra synonyms target missing: {gid}")
    owner = {}
    # names and primes are claimed first (answer pool first, then by area)
    order = sorted(grapes, key=lambda g: (not g["answer"], -(g["areaHa"] or 0)))
    for g in order:
        for n in (g["name"], g["prime"] if not MARK.search(g["prime"]) else g["name"]):
            owner.setdefault(norm(n), g["id"])
    collisions = []
    for g in order:
        keep = []
        for s in g["_cand"]:
            k = norm(s)
            if k == norm(g["name"]) or any(norm(x) == k for x in keep):
                continue
            o = owner.get(k)
            if o and o != g["id"]:
                collisions.append(f"'{s}' wanted by {g['id']} but kept by {o}")
                continue
            owner[k] = g["id"]
            keep.append(s)
        g["synonyms"] = keep
    report["collisions"] = collisions
    for g in grapes:
        g.pop("_rawsyn"), g.pop("_cand")
    return grapes


def write_json(path, obj, oneline=False):
    with open(path, "w", encoding="utf-8") as f:
        if oneline:
            f.write("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in obj) + "\n]\n")
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write("\n")


def build_schedule(answer_ids, days, start):
    path = os.path.join(OUT, "schedule.json")
    cur = {"start": start, "days": []}
    if os.path.exists(path):
        cur = json.load(open(path))
    seq = list(cur["days"])
    n = len(answer_ids)
    pool = sorted(answer_ids)
    while len(seq) < days:
        cyc = len(seq) // n
        tail_len = len(seq) % n
        tail = seq[len(seq) - tail_len:] if tail_len else []
        if len(set(tail)) != len(tail) or any(t not in pool for t in tail):
            tail, cyc = [], cyc + 1  # inconsistent partial cycle: start fresh, never touch the past
        remaining = [i for i in pool if i not in tail]
        block = shuffled(remaining, SCHEDULE_SEED + cyc * 7919 + len(tail))
        if seq and block and block[0] == seq[-1]:
            if len(block) > 1:
                block[0], block[1] = block[1], block[0]
        seq.extend(block)
    cur["days"] = seq[:max(days, len(cur["days"]))]
    write_json(path, cur)
    return cur


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=730)
    ap.add_argument("--start", default="2026-11-01")
    args = ap.parse_args()
    report = {"problems": []}
    grapes = build_grapes(report)
    write_json(os.path.join(OUT, "grapes.json"), grapes, oneline=True)

    used = sorted({g["origin"] for g in grapes} | {c for g in grapes for c in g["topCountries"]})
    cdata = json.load(open(os.path.join(ROOT, "scripts", "countries_data.json"), encoding="utf-8"))
    missing = [c for c in used if c not in cdata]
    if missing:
        report["problems"].append(f"ISO codes without countries_data entry: {missing}")
    countries = {c: {**cdata[c], "borders": [b for b in cdata[c]["borders"] if b in used]} for c in used if c in cdata}
    for c, v in countries.items():
        for b in v["borders"]:
            if c not in countries[b]["borders"]:
                report["problems"].append(f"asymmetric border {c}-{b}")
    write_json(os.path.join(OUT, "countries.json"), countries)

    ids = {g["prime"]: g["id"] for g in grapes}
    shop = {}
    for cat, prime in SHOP.items():
        if prime not in ids:
            report["problems"].append(f"shop target missing: {cat} -> {prime}")
        else:
            shop[cat] = ids[prime]
    write_json(os.path.join(OUT, "shop-grapes.json"), shop)

    answers = [g["id"] for g in grapes if g["answer"]]
    sch = build_schedule(answers, args.days, args.start)
    print(f"grapes: {len(grapes)} (answers {len(answers)}), countries: {len(countries)}, "
          f"schedule days: {len(sch['days'])}, synonyms: {sum(len(g['synonyms']) for g in grapes)}")
    print("null climate:", [g["id"] for g in grapes if g["climate"] is None])
    print("no area:", [g["id"] for g in grapes if not g["areaHa"]])
    print("no topCountries:", [g["id"] for g in grapes if not g["topCountries"]])
    print(f"synonym collisions dropped: {len(report['collisions'])}")
    for c in report["collisions"]:
        print("  ", c)
    for p in report["problems"]:
        print("PROBLEM:", p)


if __name__ == "__main__":
    main()
