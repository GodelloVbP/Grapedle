#!/usr/bin/env python3
"""Compute a climate class for every grape variety (prime), following the
method of Anderson & Nelgen (2020), "Which Winegrape Varieties are Grown Where?".

Usage:
    python3 -I scripts/compute_climate.py EBOOK_TXT REGIONAL_XLSX [--table77 CSV] [--out CSV]

EBOOK_TXT     pdftotext -layout output of the 2020 ebook (Table 75 in this
              edition: "Geographic location, elevation and growing season
              average temperature and precipitation"; the Zone column is Jones's
              cool/temperate/warm/hot class). Table 76 is a different table.
REGIONAL_XLSX "(g) Regional data 2016.xlsx", sheet "All countries".

Method:
  1. Every 2016 regional-area row gets the Zone and GST of its region from the
     table (match on country + sub_sub_region -> sub_region -> region -> country row).
  2. Per prime: area-weighted shares of zones, area-weighted mean GST
     (over matched area only).
  3. Class from average GST: <15 cool, 15-<17 temperate, 17-<19 warm, >=19 hot.
"""
import argparse
import re
import sys
import unicodedata
from collections import defaultdict

import pandas as pd

TAIL = re.compile(
    r'(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+)\s+(-?\d+\.\d)\s+(-?\d+)\s+(Cool|Temp\.?|Temperate|Warm|Hot)\s*$')
TABLE_START = 'Table 75: Geographic location'
TABLE_END = 'Table 76: Key climate indicators'

# Country names that differ between the ebook table and the xlsx.
COUNTRY_ALIASES = {
    'korea rep': 'korea rep', 'south korea': 'korea rep', 'korea': 'korea rep',
    'turkey': 'turkiye', 'turkiye': 'turkiye', 'czech republic': 'czechia',
    'usa': 'united states', 'united states of america': 'united states',
    'uk': 'united kingdom', 'macedonia': 'north macedonia',
}


def norm(s):
    """Accent-, case-, punctuation- and whitespace-insensitive key."""
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return s.strip()


def cnorm(s):
    n = norm(s)
    return COUNTRY_ALIASES.get(n, n)


def classify(gst):
    if gst < 15:
        return 'cool'
    if gst < 17:
        return 'temperate'
    if gst < 19:
        return 'warm'
    return 'hot'


def parse_table(path):
    """Return list of dicts: country, name, name2016, gst, zone, is_country."""
    with open(path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    start = next(i for i, l in enumerate(lines) if TABLE_START in l)
    end = next(i for i, l in enumerate(lines) if i > start and TABLE_END in l)
    cols = None            # column start positions (Name, 2000, 2010, 2016, Town)
    pending = []           # wrapped continuation lines awaiting their data row
    rows, country = [], None
    for l in lines[start:end]:
        if l.startswith('Name') and '2000' in l:
            cols = [0, l.index('2000'), l.index('2010'), l.index('2016'), l.index('Town')]
            pending = []
            continue
        if not l.strip() or 'Table 75' in l or l.startswith('(Final column') or \
                'for nearest town' in l or re.fullmatch(r'\s*\d+\s*', l):
            continue
        if cols is None:
            continue
        m = TAIL.search(l)
        if not m:
            pending.append(l)
            continue
        pre = l[:m.start()]

        def cell(line, a, b=None):
            # Header positions drift a few characters per page and long entries
            # spill into the next column: take the slice, then keep only the
            # text before the first run of 2+ spaces (entries never contain one).
            a = max(a - 1, 0)
            b = b - 1 if b else None
            seg = line[a:b] if len(line) > a else ''
            return re.split(r'\s{2,}', seg.strip())[0] if seg.strip() else ''
        # Tolerate small column drift: split the data row on its own gaps.
        parts = []
        for k in range(5):
            a = cols[k]
            b = cols[k + 1] if k < 4 else None
            parts.append(cell(pre, a, b))
        # Wrapped lines above add to the same columns (order: above first).
        for pl in pending:
            for k in range(5):
                a = cols[k]
                b = cols[k + 1] if k < 4 else None
                c = cell(pl, a, b)
                if c:
                    parts[k] = (c + ' ' + parts[k]).strip()
        pending = []
        name, _, _, n2016, town = parts
        # An unwrapped long name may spill into the 2000 column; repair.
        if not name:
            continue
        is_country = name.isupper() and len(name) > 3 and re.fullmatch(r'[A-Z ,.]+', name) is not None
        if is_country:
            country = name.title()
            if name == 'KOREA, REP.':
                country = 'Korea, Rep.'
        rows.append(dict(country=country, name=name, name2016=n2016,
                         gst=float(m.group(4)), zone=('temperate' if m.group(6).lower().startswith('temp') else m.group(6).lower()),
                         is_country=is_country))
    return rows


def build_lookup(rows):
    """(country_key, region_key) -> (gst, zone); country rows keyed with region None."""
    lk = {}
    for r in rows:
        ck = cnorm(r['country'])
        if r['is_country']:
            lk[(ck, None)] = (r['gst'], r['zone'])
            continue
        for nm in (r['name2016'], r['name']):
            if nm:
                lk.setdefault((ck, norm(nm)), (r['gst'], r['zone']))
    return lk


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ebook')
    ap.add_argument('xlsx')
    ap.add_argument('--table77', default='data/source/climate_2016_table77.csv')
    ap.add_argument('--out', default='data/source/climate_all_2016.csv')
    a = ap.parse_args()

    rows = parse_table(a.ebook)
    lk = build_lookup(rows)
    print(f'Parsed {len(rows)} table rows, {len(lk)} lookup keys', file=sys.stderr)

    d = pd.read_excel(a.xlsx, sheet_name='All countries', keep_default_na=False)
    d = d[d.area > 0].copy()

    def lookup(r):
        ck = cnorm(r.country)
        for lvl in (r.sub_sub_region, r.sub_region, r.region):
            if lvl:
                v = lk.get((ck, norm(lvl)))
                if v:
                    return v
        # Region names such as "Algeria Total" / "<Country> - other" fall back to country row.
        return lk.get((ck, None)) if (not r.region or 'total' in r.region.lower()) else None

    res = d.apply(lookup, axis=1)
    d['gst'] = [v[0] if v else None for v in res]
    d['zone'] = [v[1] if v else None for v in res]
    d['matched'] = d.gst.notna()

    total = d.area.sum()
    unm = d[~d.matched]
    print(f'World 2016 area {total:,.0f} ha; unmatched {unm.area.sum():,.0f} ha '
          f'({100 * unm.area.sum() / total:.2f}%)')
    um = unm.groupby(['country', 'region', 'sub_region', 'sub_sub_region']).area.sum() \
        .sort_values(ascending=False)
    print('Top unmatched regions:')
    print(um.head(30).round(0).to_string())

    out = []
    for prime, g in d.groupby('prime'):
        m = g[g.matched]
        ta, ma = g.area.sum(), m.area.sum()
        rec = dict(prime=prime, area_2016_ha=round(ta, 1),
                   matched_area_pct=round(100 * ma / ta, 1) if ta else 0)
        if ma > 0:
            for z in ('cool', 'temperate', 'warm', 'hot'):
                rec[f'{z}_pct'] = round(100 * m.loc[m.zone == z, 'area'].sum() / ma, 1)
            gst = (m.gst * m.area).sum() / ma
            rec['avg_gst_c'] = round(gst, 2)
            rec['climate_class'] = classify(gst)
        out.append(rec)
    o = pd.DataFrame(out)

    # Validation against the authors' Table 77.
    t = pd.read_csv(a.table77)
    t['published_avg_gst_c'] = t.avg_gst_c
    names = {norm(p): p for p in o.prime}

    def to_prime(v):
        # Table 77 CSV truncates 'Muscat Blanc à Petits Grains (G)' to '... ('.
        if v.endswith('('):
            return v + 'G)' if (v + 'G)') in set(o.prime) else None
        return v if v in set(o.prime) else names.get(norm(v))
    t['prime'] = t.variety.map(to_prime)
    miss = t[t.prime.isna()].variety.tolist()
    if miss:
        print('Table 77 varieties without a prime match:', miss)
    v = t.dropna(subset=['prime']).merge(o, on='prime', suffixes=('_pub', ''))
    v['err'] = (v.avg_gst_c - v.published_avg_gst_c).abs()
    v['same'] = v.avg_gst_c.map(classify) == v.published_avg_gst_c.map(classify)
    print(f'\nValidation on {len(v)} varieties: GST MAE {v.err.mean():.3f}, max {v.err.max():.2f} '
          f'({v.loc[v.err.idxmax(), "variety"]}); same class {v.same.sum()}/{len(v)} '
          f'({100 * v.same.mean():.1f}%)')
    print(v[~v.same][['variety', 'published_avg_gst_c', 'avg_gst_c']].to_string())
    print(v.sort_values('err', ascending=False).head(8)[['variety', 'published_avg_gst_c', 'avg_gst_c', 'err']].to_string())

    o = o.merge(t[['prime', 'published_avg_gst_c']], on='prime', how='left')
    o = o.sort_values('area_2016_ha', ascending=False)
    o = o[['prime', 'area_2016_ha', 'matched_area_pct', 'cool_pct', 'temperate_pct',
           'warm_pct', 'hot_pct', 'avg_gst_c', 'climate_class', 'published_avg_gst_c']]
    o.to_csv(a.out, index=False)
    print(f'Wrote {a.out} ({len(o)} primes)')


if __name__ == '__main__':
    main()
