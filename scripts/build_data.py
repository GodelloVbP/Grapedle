#!/usr/bin/env python3
"""Reproducible data builder for Grapedle.

Reads data/source/* and writes data/grapes.json, data/countries.json, data/shop-grapes.json and
data/schedule.json (append-only from the launch date in schedule.json.start). Fails when a hint
gives its grape away (see check_hints).

    python3 scripts/build_data.py [--days 770] [--start 2026-11-01]
"""
import csv, json, os, re, sys, unicodedata, argparse, datetime, math
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "source")
OUT = os.path.join(ROOT, "data")
TARGET_TOTAL = 259  # 260 in v0, minus the dropped silvaner-r record
SCHEDULE_SEED = 20261101

DROP_IDS = {"silvaner-r"}  # Roter Sylvaner is a synonym of silvaner

# Name shown in the game. The official (Adelaide prime) name goes in small print on the answer card.
DISPLAY = {
    "garnacha-tinta": "Grenache", "mazuelo": "Carignan", "melon": "Muscadet", "prosecco": "Glera",
    "cot": "Malbec", "tribidrag": "Zinfandel / Primitivo", "alvarinho": "Albariño",
    "grasevina": "Welschriesling", "sauvignonasse": "Friulano", "monastrell": "Monastrell / Mourvèdre",
    "corvina-veronese": "Corvina", "lambrusco-salamino": "Lambrusco", "verdicchio-bianco": "Verdicchio",
    "muller-thurgau": "Müller-Thurgau", "blaufrankisch": "Blaufränkisch", "silvaner": "Silvaner",
    "trousseau": "Trousseau",
}
# Glera is unknown to customers: the small print names the wine instead of the official grape name.
SMALL_PRINT = {"prosecco": {"nl": "druif van Prosecco", "en": "the Prosecco grape"}}

# Wine-country centres for grapes without a signature region (ISO -> lat, lon).
COUNTRY_POINTS = {
    "FR": (46.5, 2.5), "IT": (43.0, 12.5), "ES": (40.4, -3.7), "PT": (40.5, -8.0), "GR": (39.0, 22.0),
    "DE": (49.8, 8.5), "LU": (49.6, 6.35), "AT": (47.8, 15.5), "CH": (46.8, 7.5), "HU": (47.3, 20.0), "BG": (42.7, 25.5),
    "RO": (45.5, 25.0), "MK": (41.6, 21.7), "RU": (45.0, 40.0), "GE": (42.0, 45.0), "CY": (35.0, 33.0),
    "AL": (41.0, 20.0), "TR": (39.0, 30.0), "HR": (45.0, 16.0), "SI": (46.1, 15.0), "MD": (47.0, 28.5),
    "AR": (-33.0, -68.8), "CL": (-34.5, -71.0), "PE": (-14.0, -75.7), "BR": (-29.0, -51.5),
    "US": (37.5, -120.5), "ZA": (-33.9, 18.9), "AU": (-34.5, 139.0), "NZ": (-41.5, 174.0),
}
AROMA_SITES = {"wf": "Wine Folly", "jr": "Jancis Robinson", "wp": "Wikipedia"}
BOOK_LABEL = "Gatinois, Explore Wine Maps"
MAX_AROMAS = 4

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
    "prosecco": ["Glera", "Prosecco"],
    "muscat-blanc-a-petits-grains": ["Moscato", "Moscato d'Asti"],
    "macabeo": ["Cava"],
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
    "silvaner": ["Roter Sylvaner", "Roter Silvaner", "Sylvaner"],
    "lambrusco-salamino": ["Lambrusco Salamino"],
    "corvina-veronese": ["Corvina Veronese"],
    "verdicchio-bianco": ["Verdicchio Bianco"],
}

SHOP = {
    "Auxerrois": "Auxerrois", "Cabernet Sauvignon": "Cabernet Sauvignon", "Cinsault": "Cinsaut",
    "Corvina": "Corvina Veronese", "Corvinone": "Corvinone", "Croatina": "Croatina",
    "Garnacha": "Garnacha Tinta", "Gewurztraminer": "Gewürztraminer", "Graciano": "Graciano",
    "Grenache": "Garnacha Tinta", "Grenache Blanc": "Garnacha Blanca",
    "Grüner Veltliner": "Grüner Veltliner", "Marsanne": "Marsanne",
    "Maturana Tinta": "Trousseau", "Mazuelo": "Mazuelo", "Merlot": "Merlot",
    "Pinot Blanc": "Pinot Blanc", "Pinot Gris": "Pinot Gris", "Pinot Noir": "Pinot Noir",
    "Riesling": "Riesling", "Rondinella": "Rondinella", "Roter Sylvaner": "Silvaner",
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


COLOUR_MARK = re.compile(r"\s+(N|B|R|G|Rs|Rg|Blanc|Blanca|Blanco|Noir|Nera|Nero|Tinto|Tinta|Rouge|Rosso|Bianco)$", re.I)


def ascii_key(s):
    """Lower-case, accent-stripped; keeps every other character so clutter can be detected."""
    s = s.replace("ß", "ss")
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def clean_synonyms(raw):
    """Real alternate names only: no clutter, abbreviations, colour marks or foreign-script noise."""
    out = []
    for part in (raw or "").split(";"):
        s = MARK.sub("", part).strip()
        if (len(s) < 4 or len(s) > 30 or re.search(r"[_\d,/().]", s) or re.search(r"\s[A-Za-z]{1,2}$", s) or " and " in s.lower() or " - " in s
                or s.lower() in GENERIC or re.search(r"[^a-z \-']", ascii_key(s))):
            continue
        out.append(s)
    return out


def edit_distance(a, b, cap=2):
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


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


def write_json(path, obj, oneline=False):
    with open(path, "w", encoding="utf-8") as f:
        if oneline:
            f.write("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in obj) + "\n]\n")
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.write("\n")


def read_json(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return json.load(f)


def load_aromas():
    """id -> (kind, record). The owner's book overrides the batches."""
    recs = {}
    for n in (1, 2, 3):
        for r in read_json(f"aromas_batch{n}.json"):
            recs[r["id"]] = ("batch", r)
    for r in read_json("aromas_book.json"):
        recs[r["id"]] = ("book", r)
    return recs


BODY_LEVELS = {"light": 1, "medium-light": 2, "medium": 3, "medium-full": 4, "full": 5}
BODY_BOOK_LABEL = "Gatinois, Explore Wine Maps"


def parse_body(label):
    """Wine Folly body label (any casing, with or without 'Body') -> 1..5; None/empty -> None."""
    if label is None:
        return None
    k = re.sub(r"\s+body$", "", str(label).strip().lower())
    k = re.sub(r"[\s_]+", "-", k)
    if k in ("", "none", "null", "unknown"):
        return None
    if k not in BODY_LEVELS:
        raise ValueError(f"unknown body label: {label!r}")
    return BODY_LEVELS[k]


def load_body(problems):
    """id -> (level 1..5 or None, source). data/source/body_book.json overrides the Wine Folly batches."""
    out = {}
    for n in (1, 2, 3):
        for r in read_json(f"body_batch{n}.json"):
            try:
                lvl = parse_body(r.get("body"))
            except ValueError as e:
                problems.append(f"{r.get('id')}: {e}")
                continue
            if lvl is None:
                continue
            if not r.get("url"):
                problems.append(f"body for {r['id']} has no url")
                continue
            out[r["id"]] = (lvl, r["url"])
    book = os.path.join(SRC, "body_book.json")
    for r in (read_json("body_book.json") if os.path.exists(book) else []):
        try:
            lvl = parse_body(r.get("body"))
        except ValueError as e:
            problems.append(f"{r.get('id')}: {e}")
            continue
        if lvl is not None:
            out[r["id"]] = (lvl, r.get("source") or BODY_BOOK_LABEL)
    return out


STYLE_IDS = ("sparkling", "sweet", "fortified", "rose", "oaked", "fresh", "aromatic", "blend")


def load_styles(problems):
    """id -> (list of style ids, source). Haiku batches (Wine Folly/Wikipedia evidence) first, then
    data/source/styles_override.json (reviewed corrections). An empty list means a plain dry still wine."""
    out = {}
    for n in (1, 2, 3):
        path = os.path.join(SRC, f"style_batch{n}.json")
        if not os.path.exists(path):
            continue
        for r in read_json(f"style_batch{n}.json"):
            if r.get("styles") is None:
                continue
            bad = [x for x in r["styles"] if x not in STYLE_IDS]
            if bad or len(r["styles"]) > 3:
                problems.append(f"styles for {r['id']}: {r['styles']}")
                continue
            urls = sorted({e["url"] for e in r.get("evidence", []) if e.get("url")})
            out[r["id"]] = (r["styles"], urls or None)
    ov = os.path.join(SRC, "styles_override.json")
    for r in (read_json("styles_override.json") if os.path.exists(ov) else []):
        bad = [x for x in r["styles"] if x not in STYLE_IDS]
        if bad or len(r["styles"]) > 3:
            problems.append(f"styles override for {r['id']}: {r['styles']}")
            continue
        old = out.get(r["id"], (None, None))[1] or []
        out[r["id"]] = (r["styles"], old + ["review: " + r["note"]])
    return out


def flavours_for(rec):
    """(descriptor ids, source list) for one aroma record; ([], []) when there are none."""
    if not rec:
        return None, None
    kind, r = rec
    items = r.get("aromas") or []
    if kind == "book":
        ids = [a["d"] for a in items][:MAX_AROMAS]
        return (ids or None), ([{"name": BOOK_LABEL}] if ids else None)
    ranked = [a for a in items if len(a.get("by", [])) >= 2] + [a for a in items if len(a.get("by", [])) < 2]
    keep = ranked[:MAX_AROMAS]
    if not keep:
        return None, None
    used = []
    for a in keep:
        for code in a.get("by", []):
            if code in AROMA_SITES and code not in used:
                used.append(code)
    urls = r.get("urls", {})
    return [a["d"] for a in keep], [{"name": AROMA_SITES[c], "url": urls.get(c)} for c in used]


def build_grapes(report):
    adel = rows("adelaide_2023_summary.csv")
    draft = rows("answer_pool_draft.csv")
    pool = {r["id"]: r for r in rows("answer_pool.csv")}
    sig = {r["id"]: r for r in rows("signature_regions.csv")}
    hints = {h["id"]: h for h in read_json("hints.json")}
    # optional "Wist je dat" facts: [{id, fact_nl, fact_en, source}]; only sourced facts are used, never invented ones
    facts = {f["id"]: f for f in (read_json("facts.json") if os.path.exists(os.path.join(SRC, "facts.json")) else [])}
    aromas = load_aromas()
    bodies = load_body(report["problems"])
    styles = load_styles(report["problems"])
    by_prime = {r["prime"]: r for r in adel}
    problems = report["problems"]

    def record(a, old_name):
        prime = a["prime"]
        gid = slug(prime)
        colour = "red" if a["colour"] == "R" else "white"
        origin = iso(a["origin"], problems, prime)
        tops = [c for c in (iso(a[k], problems, prime) for k in ("top1", "top2", "top3")) if c]
        tops = list(dict.fromkeys(tops))
        src = {"colour": "Adelaide 2023", "area": "Adelaide 2023"}
        if prime == "Croatina":
            origin = "IT"
            tops = list(dict.fromkeys("IT" if t == "HR" else t for t in tops))
        area = float(a["area_ha"] or 0)
        basis = a.get("area_year") or "2023"
        if basis != "2023":
            src["area"] = f"Adelaide, latest year per country ({basis})"
        if not tops and origin and area > 0:
            tops = [origin]
        name = DISPLAY.get(gid, old_name)
        rec = {"id": gid, "name": name, "official": prime}
        if gid in SMALL_PRINT:
            rec["small"] = SMALL_PRINT[gid]
        rec.update({"synonyms": [], "colour": colour})
        s = sig.get(gid)
        if s:
            regs = [{"name": s["region"], "country": s["country_iso2"], "lat": float(s["lat"]),
                     "lon": float(s["lon"])}]
            if s.get("region2"):
                regs.append({"name": s["region2"], "country": s["country2_iso2"], "lat": float(s["lat2"]),
                             "lon": float(s["lon2"])})
            rec["regions"] = regs
            src["region"] = f"Signature region, hand-placed point: {s['note']}" if s["note"] else "Signature region, hand-placed point"
        else:
            rec["regions"] = [{"name": None, "country": tops[0] if tops else origin, "lat": None, "lon": None}]
            src["region"] = "Most-planted country (Adelaide 2023); country point"
        rec["areaHa"] = int(round(area)) if area > 0 else None
        rec["answer"] = gid in pool
        if gid in pool and pool[gid]["stocked"]:
            rec["stocked"] = True
        if gid in pool and pool[gid]["weekend_only"]:
            rec["weekendOnly"] = True
        ids, fsrc = flavours_for(aromas.get(gid))
        rec["flavours"] = ids
        if fsrc:
            src["flavours"] = fsrc
        lvl, bsrc = bodies.get(gid, (None, None))
        rec["body"] = lvl
        if bsrc:
            src["body"] = bsrc
        stl, ssrc = styles.get(gid, (None, None))
        rec["styles"] = stl
        if ssrc:
            src["styles"] = ssrc
        h = hints.get(gid)
        if h:
            rec["hint"] = {"nl": h["hint_nl"], "en": h["hint_en"]}
            src["hint"] = h["source"]
        f = facts.get(gid)
        if f:
            if not (f.get("fact_nl") and f.get("fact_en") and f.get("source")):
                problems.append(f"fact for {gid} needs fact_nl, fact_en and source")
            else:
                rec["fact"] = {"nl": f["fact_nl"], "en": f["fact_en"]}
                src["fact"] = f["source"]
        rec["sources"] = src
        rec["_rawsyn"] = a["synonyms"]
        rec["_old"] = old_name
        return rec

    grapes, seen = [], set()
    draft_primes = {p["prime"] for p in draft}
    for p in draft:
        rec = record(by_prime[p["prime"]], p["common"])
        if rec["id"] in DROP_IDS:
            continue
        grapes.append(rec)
        seen.add(rec["id"])
    for a in sorted(adel, key=lambda r: -float(r["area_ha"] or 0)):
        if len(grapes) >= TARGET_TOTAL:
            break
        pr = a["prime"]
        if not pr or pr in draft_primes:
            continue
        if pr.lower().startswith("other") or pr.endswith(")") or a["colour"] not in ("R", "W", "G"):
            continue
        if pr.lower() in GUESS_SKIP or slug(pr) in seen or not slug(pr) or slug(pr) in DROP_IDS:
            continue
        if not a["origin"] or a["origin"] == "USSR":
            continue
        rec = record(a, pr)
        if not rec["regions"][0]["country"] or not rec["areaHa"]:
            continue
        grapes.append(rec)
        seen.add(rec["id"])

    ids = {g["id"]: g for g in grapes}
    for gid in list(pool) + list(sig):
        if gid not in ids:
            problems.append(f"id in pool/signature file but not in the grape list: {gid}")
    for gid in EXTRA_SYNONYMS:
        if gid not in ids:
            problems.append(f"extra synonyms target missing: {gid}")

    # Synonyms. Protected: former display name, official name, curated extras. Raw Adelaide
    # synonyms are trimmed hard (see clean_synonyms) and near-duplicates dropped.
    for g in grapes:
        protected = [g["official"], g["_old"]] + EXTRA_SYNONYMS.get(g["id"], [])
        g["_prot"] = [x for x in protected if not MARK.search(x)]
        g["_raw"] = clean_synonyms(g["_rawsyn"])
    owner = {}
    order = sorted(grapes, key=lambda g: (not g["answer"], -(g["areaHa"] or 0)))
    for g in order:
        for n in (g["name"], g["official"] if not MARK.search(g["official"]) else g["name"]):
            owner.setdefault(norm(n), g["id"])
    collisions = []

    def compact(x):
        return norm(x).replace(" ", "")

    for g in order:
        keep, kept_keys = [], {compact(g["name"])}
        def take(s, strict):
            k = norm(s)
            if not k or compact(s) in kept_keys:
                return
            if strict and any(edit_distance(compact(s), x) <= 2 for x in kept_keys if len(x) >= 5):
                return
            o = owner.get(k)
            if o and o != g["id"]:
                collisions.append(f"'{s}' wanted by {g['id']} but kept by {o}")
                return
            owner[k] = g["id"]
            keep.append(s)
            kept_keys.add(compact(s))
        for s in g["_prot"]:
            take(s, False)
        added = 0
        for s in g["_raw"]:
            if added >= 4:
                break
            n0 = len(keep)
            take(s, True)
            added += len(keep) - n0
        g["synonyms"] = keep
    report["collisions"] = collisions
    for g in grapes:
        for k in ("_rawsyn", "_old", "_prot", "_raw"):
            g.pop(k)
    return grapes


# ---- hints -------------------------------------------------------------

def hint_conflicts(hint, terms):
    """terms: [(label, text)]. A term of 4+ letters conflicts when it is a substring of the hint
    (spaces and punctuation ignored); a shorter term only as a whole word."""
    h = norm(hint)
    hc = h.replace(" ", "")
    bad = []
    for label, text in terms:
        t = norm(text)
        if not t:
            continue
        tc = t.replace(" ", "")
        if len(tc) >= 4:
            if tc in hc:
                bad.append((label, text))
        elif re.search(r"(^| )" + re.escape(t) + r"( |$)", h):
            bad.append((label, text))
    return bad


def check_hints(grapes):
    """Returns a list of failure messages. A hint must not contain the grape's display name,
    official name or any synonym, nor another pool grape's display name."""
    pool = [g for g in grapes if g["answer"]]
    failures = []
    for g in pool:
        if not g.get("hint"):
            failures.append(f"{g['id']}: no hint")
            continue
        terms = [("name", g["name"]), ("official", g["official"])] + [("synonym", s) for s in g["synonyms"]]
        terms += [("other grape", o["name"]) for o in pool if o["id"] != g["id"]]
        for lang in ("nl", "en"):
            for label, text in hint_conflicts(g["hint"][lang], terms):
                failures.append(f"{g['id']}: hint_{lang} '{g['hint'][lang]}' contains {label} '{text}'")
    return failures


# ---- schedule ----------------------------------------------------------

SPACING_REGION = 7
SPACING_SAME = 20  # the same grape never returns within 20 days, also across cycle boundaries
# Week 1 (the first 7 days) only features grapes most players know.
WEEK1_GRAPES = {"cabernet-sauvignon", "merlot", "syrah", "pinot-noir", "chardonnay", "sauvignon-blanc", "riesling",
                "pinot-gris", "garnacha-tinta", "tempranillo", "sangiovese", "cot", "prosecco", "gewurztraminer"}
WARN_DAYS_LEFT = 90
# Corvina, Corvinone and Rondinella: the plan asks for 21 days between all three, but three grapes
# at 21 days need 63 days and a cycle has 55, so that cannot hold cycle after cycle. Corvina and
# Corvinone (one letter apart, the confusable pair) keep 21 days; Rondinella keeps 14 from both.
TRIO = {"corvina-veronese", "corvinone", "rondinella"}
TRIO_GAP = {frozenset(("corvina-veronese", "corvinone")): 21, frozenset(("rondinella", "corvina-veronese")): 14,
            frozenset(("rondinella", "corvinone")): 14}
SPACING_MAX = 21


def build_schedule(pool, cycles, start):
    """pool: list of grape dicts (answer pool). Whole cycles only; existing days are never touched."""
    path = os.path.join(OUT, "schedule.json")
    cur = {"start": start, "days": []}
    if os.path.exists(path):
        cur = json.load(open(path))
    seq = list(cur["days"])
    ids = sorted(g["id"] for g in pool)
    n = len(ids)
    region = {g["id"]: g["regions"][0]["name"] for g in pool}  # primary region only
    weekend_only = {g["id"] for g in pool if g.get("weekendOnly")}
    if len(seq) % n or any(i not in region for i in seq):
        raise SystemExit("schedule.json does not match the answer pool: it is append-only from launch; "
                         "before launch delete it and rebuild")
    d0 = datetime.date.fromisoformat(cur["start"])

    def is_weekend(day_index):
        return (d0 + datetime.timedelta(days=day_index)).weekday() >= 5

    def allowed(seq_, pos, gid):
        if gid in weekend_only and not is_weekend(pos):
            return False
        if pos < 7 and gid not in WEEK1_GRAPES:
            return False
        for back in range(1, SPACING_MAX + 1):
            if pos - back < 0:
                break
            o = seq_[pos - back]
            if o == gid:
                if back < SPACING_SAME:
                    return False
            elif back < SPACING_REGION and region[o] == region[gid]:
                return False
            elif gid in TRIO and o in TRIO and back < TRIO_GAP[frozenset((gid, o))]:
                return False
        return True

    def gen_cycle(prefix, cyc, first_attempt, tries=60):
        """One cycle after `prefix`: (days, attempt used) or None."""
        base = len(prefix)
        for attempt in range(first_attempt, first_attempt + tries):
            rnd = mulberry32(SCHEDULE_SEED + cyc * 7919 + attempt * 104729)
            work = list(prefix)
            remaining = set(ids)
            nodes = [0]

            def dfs(k):
                if k == n:
                    return True
                nodes[0] += 1
                if nodes[0] > 3000:
                    return False
                pos = base + k
                wk_left = sum(1 for j in range(k, n) if is_weekend(base + j))
                if len([x for x in remaining if x in weekend_only]) > wk_left:
                    return False
                cand = [x for x in sorted(remaining) if allowed(work, pos, x)]
                cand = shuffled(cand, int(rnd() * 2 ** 31))
                crowd = {}
                for x in remaining:
                    crowd[region[x]] = crowd.get(region[x], 0) + 1
                wk = is_weekend(pos)
                # Corvina family first, then weekend-only grapes on weekend days, then the most crowded regions
                cand.sort(key=lambda x: (x not in TRIO, not (wk and x in weekend_only), -crowd[region[x]]))
                for x in cand:
                    work.append(x)
                    remaining.discard(x)
                    if dfs(k + 1):
                        return True
                    work.pop()
                    remaining.add(x)
                return False
            if dfs(0):
                return work[base:], attempt
        return None

    # Cycles already in the file are final. New cycles are chosen deterministically; when one cannot
    # be completed, the previous *new* cycle is redrawn (never a published one).
    first_new = len(seq) // n
    need = cycles - first_new
    chosen = []  # (days, attempt) for new cycles
    start_at = {}
    while len(chosen) < need:
        i = len(chosen)
        prefix = seq + [d for days, _ in chosen for d in days]
        got = gen_cycle(prefix, first_new + i, start_at.get(i, 0))
        if got:
            chosen.append(got)
            continue
        if not chosen:
            raise SystemExit(f"could not build cycle {first_new} within the spacing rules")
        _, used = chosen.pop()
        start_at = {k: v for k, v in start_at.items() if k < i - 1}
        start_at[i - 1] = used + 1
    seq = seq + [d for days, _ in chosen for d in days]
    cur["days"] = seq
    write_json(path, cur)
    return cur


def days_left(sched, today):
    """Puzzle days still to come after `today` (a date); the whole schedule when the start is in the future."""
    end = datetime.date.fromisoformat(sched["start"]) + datetime.timedelta(days=len(sched["days"]))
    return (end - max(today, datetime.date.fromisoformat(sched["start"]))).days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=770, help="rounded up to whole cycles of the pool size")
    ap.add_argument("--start", default="2026-11-01")
    ap.add_argument("--today", default=None, help="YYYY-MM-DD, for tests of the days-left warning")
    args = ap.parse_args()
    report = {"problems": []}
    grapes = build_grapes(report)

    fails = check_hints(grapes)
    if fails:
        print("HINT VALIDATION FAILED:")
        for f in fails:
            print("  ", f)
        sys.exit(1)

    write_json(os.path.join(OUT, "grapes.json"), grapes, oneline=True)

    used = sorted({r["country"] for g in grapes for r in g["regions"]})
    cdata = json.load(open(os.path.join(ROOT, "scripts", "countries_data.json"), encoding="utf-8"))
    for c in used:
        if c not in cdata:
            report["problems"].append(f"ISO code without countries_data entry: {c}")
        if c not in COUNTRY_POINTS:
            report["problems"].append(f"ISO code without country point: {c}")
    countries = {c: {"nl": cdata[c]["nl"], "en": cdata[c]["en"], "lat": COUNTRY_POINTS[c][0], "lon": COUNTRY_POINTS[c][1]}
                 for c in used if c in cdata and c in COUNTRY_POINTS}
    write_json(os.path.join(OUT, "countries.json"), countries)

    ids = {g["official"]: g["id"] for g in grapes}
    byid = {g["id"]: g for g in grapes}
    shop = {}
    for cat, prime in SHOP.items():
        if prime not in ids:
            report["problems"].append(f"shop target missing: {cat} -> {prime}")
        else:
            shop[cat] = ids[prime]
            if not byid[ids[prime]]["answer"] or not byid[ids[prime]].get("stocked"):
                report["problems"].append(f"shop category {cat} maps to {ids[prime]}, which is not a stocked pool grape")
    write_json(os.path.join(OUT, "shop-grapes.json"), shop)

    pool = [g for g in grapes if g["answer"]]
    cycles = -(-args.days // len(pool))
    sch = build_schedule(pool, cycles, args.start)
    print(f"grapes: {len(grapes)} (answers {len(pool)}), countries: {len(countries)}, "
          f"schedule days: {len(sch['days'])}, synonyms: {sum(len(g['synonyms']) for g in grapes)}")
    left = days_left(sch, datetime.date.fromisoformat(args.today) if args.today else datetime.date.today())
    if left < WARN_DAYS_LEFT:
        print(f"WARNING: only {left} days of schedule left (minimum {WARN_DAYS_LEFT}); append cycles with --days before they run out")
    print("no area:", [g["id"] for g in grapes if not g["areaHa"]])
    print("pool grapes without body:", [g["id"] for g in pool if g["body"] is None])
    print("pool grapes without aromas:", [g["id"] for g in pool if not g["flavours"]])
    print(f"synonym collisions dropped: {len(report['collisions'])}")
    for c in report["collisions"]:
        print("  ", c)
    for p in report["problems"]:
        print("PROBLEM:", p)
    if report["problems"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
