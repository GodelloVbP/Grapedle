"""Extract world climate shares per variety from Table 77 of the 2020 ebook.

Source: Anderson, K. and S. Nelgen, Which Winegrape Varieties are Grown
Where? A Global Empirical Picture (revised edition), University of Adelaide
Press, 2020, Table 77 (world section, 2016 columns). Shares of each variety's
bearing area in cool, temperate, warm and hot regions, plus area-weighted
average growing season temperature (GST, deg C), for the top ~130 varieties.

The PDF is not committed. Convert it first, then run:

    pdftotext -layout winegrapes-revised-ebook-0920.pdf ebook.txt
    python scripts/extract_table77.py ebook.txt [output.csv]
"""

import csv
import re
import sys

NUM = r"-?\d+(?:\.\d+)?"
ROW = re.compile(r"^(.+?)\s+((?:" + NUM + r"\s+){11}" + NUM + r")$")
SUBTOTALS = {"Top 120", "All", "white varieties", "red varieties"}
SECTION = re.compile(r"^(Old World|New World|World)(?: \(cont\.\))?\s+2000\s+2016")


def main(text_path, out_path):
    lines = open(text_path, encoding="utf-8").read().split("\n")
    start = next(i for i, l in enumerate(lines) if l.strip().startswith("Table 77: Shares of Old World"))
    section, world = None, {}
    for line in lines[start:]:
        s = line.strip()
        # Table 78 (national shares) follows directly; stop there.
        if s.startswith("Table 78"):
            break
        m = SECTION.match(s)
        if m:
            section = m.group(1)
            continue
        m = ROW.match(s)
        # Skip subtotal rows ("Top 120", "All", "white varieties").
        if m and section == "World" and m.group(1).strip() not in SUBTOTALS:
            v = m.group(2).split()
            # Columns: 2000 area, cool, temp, warm, hot, GST, then the same for 2016.
            world[m.group(1).strip()] = v[6:]

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["variety", "area_2016_ha", "cool_pct", "temperate_pct", "warm_pct", "hot_pct", "avg_gst_c"])
        for name, vals in world.items():
            w.writerow([name] + vals)
    print(f"{len(world)} varieties written to {out_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "data/source/climate_2016_table77.csv")
