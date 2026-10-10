#!/usr/bin/env python3
"""
Extracts the King James Old Testament with Strong's numbers from the CrossWire / eBible SWORD module
(engKJV2006eb, public domain) into build/data/kjv-ot.tsv.gz, which build_db.py and add_extras.py read.

You only need this to refresh that file. It needs the SWORD command line tool and the module:
    Ubuntu / Debian:  sudo apt install diatheke sword-text-kjv
Output, one verse per line:  book_index <TAB> chapter <TAB> verse <TAB> text
The text keeps <w savlm="strong:H1234">word</w> tags and <transChange type="added">italic words</transChange>.
"""
import gzip
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "kjv-ot.tsv.gz")
MODULE = "engKJV2006eb"

# SWORD book names, in the app's book order, with chapter counts
BOOKS = [("Genesis", 50), ("Exodus", 40), ("Leviticus", 27), ("Numbers", 36), ("Deuteronomy", 34), ("Joshua", 24),
         ("Judges", 21), ("Ruth", 4), ("I Samuel", 31), ("II Samuel", 24), ("I Kings", 22), ("II Kings", 25),
         ("I Chronicles", 29), ("II Chronicles", 36), ("Ezra", 10), ("Nehemiah", 13), ("Esther", 10), ("Job", 42),
         ("Psalms", 150), ("Proverbs", 31), ("Ecclesiastes", 12), ("Song of Solomon", 8), ("Isaiah", 66),
         ("Jeremiah", 52), ("Lamentations", 5), ("Ezekiel", 48), ("Daniel", 12), ("Hosea", 14), ("Joel", 3),
         ("Amos", 9), ("Obadiah", 1), ("Jonah", 4), ("Micah", 7), ("Nahum", 3), ("Habakkuk", 3), ("Zephaniah", 3),
         ("Haggai", 2), ("Zechariah", 14), ("Malachi", 4)]

KEEP = re.compile(r'(<w\b[^>]*>|</w>|<transChange\b[^>]*>|</transChange>)')


def clean(fragment):
    # keep word tags and added-word markers, drop every other tag
    parts = KEEP.split(fragment)
    out = []
    for i, p in enumerate(parts):
        if i % 2 == 1:
            if p.startswith("<w"):
                m = re.search(r'savlm="([^"]*)"', p) or re.search(r'lemma="([^"]*)"', p)
                nums = re.findall(r"strong:(H\d+)", m.group(1)) if m else []
                out.append('<w s="%s">' % " ".join(nums) if nums else "<w>")
            elif p.startswith("<transChange"):
                out.append("<a>")
            elif p == "</transChange>":
                out.append("</a>")
            else:
                out.append(p)
        else:
            out.append(re.sub(r"<[^>]+>", "", p))
    text = "".join(out)
    text = text.replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", text).strip()


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    rows = 0
    with gzip.open(OUT, "wt", encoding="utf-8") as fh:
        for bi, (name, nch) in enumerate(BOOKS):
            for ch in range(1, nch + 1):
                raw = subprocess.run(["diatheke", "-b", MODULE, "-k", "%s %d" % (name, ch)],
                                     capture_output=True, text=True, check=True).stdout
                raw = raw.rsplit("(%s)" % MODULE, 1)[0]
                marks = list(re.finditer(r"%s (\d+):(\d+): " % re.escape(name), raw))
                for i, m in enumerate(marks):
                    c, v = int(m.group(1)), int(m.group(2))
                    body = raw[m.end(): marks[i + 1].start() if i + 1 < len(marks) else len(raw)]
                    # diatheke repeats a psalm title before every verse; it belongs to verse 1 only
                    title_m = None
                    if i + 1 < len(marks):
                        body = re.sub(r"<title\b.*?</title>", "", body, flags=re.S)
                    pre = raw[(marks[i - 1].end() if i else 0): m.start()]
                    if v == 1:
                        title_m = re.search(r"<title\b[^>]*>(.*?)</title>", pre if i else raw[:m.start()], re.S)
                    text = clean(body)
                    if title_m:
                        text = "<t>" + clean(title_m.group(1)) + "</t> " + text
                    fh.write("%d\t%d\t%d\t%s\n" % (bi, c, v, text))
                    rows += 1
    print("wrote", rows, "verses to", OUT)


if __name__ == "__main__":
    main()
