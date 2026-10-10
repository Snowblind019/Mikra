#!/usr/bin/env python3
"""
Builds data/mikra.db from public data sources.

Sources (downloaded into build/sources/ if missing):
  - STEPBible TAHOT: Hebrew OT tagged word by word (CC BY 4.0, STEPBible.org / Tyndale House)
  - STEPBible TBESH: brief Hebrew lexicon, abridged BDB (CC BY 4.0)
  - STEPBible TEHMC: Hebrew morphology code explanations (CC BY 4.0)
  - OpenScriptures HebrewLexicon: LexicalIndex, AugIndex, HebrewStrong (CC BY 4.0, BDB and Strong's are public domain)
  - Romanian Cornilescu (RCCV, public domain) from seven1m/open-bibles

Optional step: Romanian to Hebrew word alignment with eflomal (pip install eflomal snowballstemmer).
Without eflomal the app still works, the Cornilescu hover links are just missing.
At the end add_extras.py adds the KJV (from build/data/kjv-ot.tsv.gz, linked by its Strong's numbers),
Romanian meanings and the word forms table.

Usage:
  python build/build_db.py            # download what is missing, build everything
  python build/build_db.py --no-align # skip word alignment
"""
import argparse
import collections
import json
import os
import re
import sqlite3
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "sources")
DB_PATH = os.path.join(ROOT, "data", "mikra.db")

STEP = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/"
OSHB = "https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master/"
OPENBIBLES = "https://raw.githubusercontent.com/seven1m/open-bibles/master/"

TAHOT_FILES = [
    "TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
    "TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt",
]
TBESH_FILE = "TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt"
TEHMC_FILE = "TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt"
RO_FILE = "ron-rccv.usfx.xml"

DOWNLOADS = (
    [(f, STEP + "Translators Amalgamated OT+NT/" + f) for f in TAHOT_FILES]
    + [(TBESH_FILE, STEP + "Lexicons/" + TBESH_FILE),
       (TEHMC_FILE, STEP + "Morphology codes/" + TEHMC_FILE),
       ("LexicalIndex.xml", OSHB + "LexicalIndex.xml"),
       ("AugIndex.xml", OSHB + "AugIndex.xml"),
       ("HebrewStrong.xml", OSHB + "HebrewStrong.xml"),
       (RO_FILE, OPENBIBLES + RO_FILE)]
)

# code, usfx id, Romanian name, English name, Hebrew name, Hebrew name transliterated
BOOKS = [
    ("Gen", "GEN", "Geneza", "Genesis", "בְּרֵאשִׁית", "Bereshit"),
    ("Exo", "EXO", "Exodul", "Exodus", "שְׁמוֹת", "Shemot"),
    ("Lev", "LEV", "Leviticul", "Leviticus", "וַיִּקְרָא", "Vayikra"),
    ("Num", "NUM", "Numeri", "Numbers", "בְּמִדְבַּר", "Bemidbar"),
    ("Deu", "DEU", "Deuteronomul", "Deuteronomy", "דְּבָרִים", "Devarim"),
    ("Jos", "JOS", "Iosua", "Joshua", "יְהוֹשֻׁעַ", "Yehoshua"),
    ("Jdg", "JDG", "Judecători", "Judges", "שׁוֹפְטִים", "Shoftim"),
    ("Rut", "RUT", "Rut", "Ruth", "רוּת", "Rut"),
    ("1Sa", "1SA", "1 Samuel", "1 Samuel", "שְׁמוּאֵל א", "Shmuel Alef"),
    ("2Sa", "2SA", "2 Samuel", "2 Samuel", "שְׁמוּאֵל ב", "Shmuel Bet"),
    ("1Ki", "1KI", "1 Împărați", "1 Kings", "מְלָכִים א", "Melakhim Alef"),
    ("2Ki", "2KI", "2 Împărați", "2 Kings", "מְלָכִים ב", "Melakhim Bet"),
    ("1Ch", "1CH", "1 Cronici", "1 Chronicles", "דִּבְרֵי הַיָּמִים א", "Divrei HaYamim Alef"),
    ("2Ch", "2CH", "2 Cronici", "2 Chronicles", "דִּבְרֵי הַיָּמִים ב", "Divrei HaYamim Bet"),
    ("Ezr", "EZR", "Ezra", "Ezra", "עֶזְרָא", "Ezra"),
    ("Neh", "NEH", "Neemia", "Nehemiah", "נְחֶמְיָה", "Nechemyah"),
    ("Est", "EST", "Estera", "Esther", "אֶסְתֵּר", "Ester"),
    ("Job", "JOB", "Iov", "Job", "אִיּוֹב", "Iyov"),
    ("Psa", "PSA", "Psalmii", "Psalms", "תְּהִלִּים", "Tehillim"),
    ("Pro", "PRO", "Proverbele", "Proverbs", "מִשְׁלֵי", "Mishlei"),
    ("Ecc", "ECC", "Eclesiastul", "Ecclesiastes", "קֹהֶלֶת", "Kohelet"),
    ("Sng", "SNG", "Cântarea cântărilor", "Song of Songs", "שִׁיר הַשִּׁירִים", "Shir HaShirim"),
    ("Isa", "ISA", "Isaia", "Isaiah", "יְשַׁעְיָהוּ", "Yeshayahu"),
    ("Jer", "JER", "Ieremia", "Jeremiah", "יִרְמְיָהוּ", "Yirmeyahu"),
    ("Lam", "LAM", "Plângerile lui Ieremia", "Lamentations", "אֵיכָה", "Eikhah"),
    ("Ezk", "EZK", "Ezechiel", "Ezekiel", "יְחֶזְקֵאל", "Yechezkel"),
    ("Dan", "DAN", "Daniel", "Daniel", "דָּנִיֵּאל", "Daniyyel"),
    ("Hos", "HOS", "Osea", "Hosea", "הוֹשֵׁעַ", "Hoshea"),
    ("Jol", "JOL", "Ioel", "Joel", "יוֹאֵל", "Yoel"),
    ("Amo", "AMO", "Amos", "Amos", "עָמוֹס", "Amos"),
    ("Oba", "OBA", "Obadia", "Obadiah", "עֹבַדְיָה", "Ovadyah"),
    ("Jon", "JON", "Iona", "Jonah", "יוֹנָה", "Yonah"),
    ("Mic", "MIC", "Mica", "Micah", "מִיכָה", "Mikhah"),
    ("Nam", "NAM", "Naum", "Nahum", "נַחוּם", "Nachum"),
    ("Hab", "HAB", "Habacuc", "Habakkuk", "חֲבַקּוּק", "Chavakkuk"),
    ("Zep", "ZEP", "Țefania", "Zephaniah", "צְפַנְיָה", "Tzefanyah"),
    ("Hag", "HAG", "Hagai", "Haggai", "חַגַּי", "Chaggai"),
    ("Zec", "ZEC", "Zaharia", "Zechariah", "זְכַרְיָה", "Zekharyah"),
    ("Mal", "MAL", "Maleahi", "Malachi", "מַלְאָכִי", "Malakhi"),
]
BOOK_INDEX = {b[0]: i for i, b in enumerate(BOOKS)}
USFX_INDEX = {b[1]: i for i, b in enumerate(BOOKS)}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# --------------------------------------------------------------------------- downloads

def ensure_sources():
    os.makedirs(SRC, exist_ok=True)
    for name, url in DOWNLOADS:
        path = os.path.join(SRC, name)
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            continue
        quoted = urllib.parse.quote(url, safe=":/")
        log("downloading", name)
        req = urllib.request.Request(quoted, headers={"User-Agent": "mikra-build"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(path + ".part", "wb") as f:
                while True:
                    chunk = r.read(1 << 16)
                    if not chunk:
                        break
                    f.write(chunk)
        except BaseException:
            # don't leave a half-downloaded file behind
            try:
                os.remove(path + ".part")
            except OSError:
                pass
            raise
        os.replace(path + ".part", path)


# --------------------------------------------------------------------------- helpers

def nfc(s):
    return unicodedata.normalize("NFC", s)


def ro_norm(s):
    # cedilla forms to the correct comma-below Romanian letters
    return (s.replace("ş", "ș").replace("Ş", "Ș").replace("ţ", "ț").replace("Ţ", "Ț"))


CANT_RE = re.compile("[֑-ֽ֯׀׃-׆ֿ]")
NIQQUD_RE = re.compile("[֑-ׇ]")


def strip_cantillation(s):
    # keeps vowels, dagesh, shin/sin dots; removes accents, meteg, paseq, sof pasuq, nun hafukha
    return CANT_RE.sub("", s)


def consonants(s):
    return NIQQUD_RE.sub("", s).replace("־", " ")


# --------------------------------------------------------------------------- TAHOT

REF_RE = re.compile(r"^([1-3]?[A-Z][a-z]{1,2})\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#(\d+)=(.*)$")


def parse_tahot():
    """Returns dict (book_idx, ch, v) -> list of words, in file order."""
    verses = collections.OrderedDict()
    bad = 0
    for fname in TAHOT_FILES:
        with open(os.path.join(SRC, fname), encoding="utf-8-sig") as fh:
            for line in fh:
                if not line or line[0] in "#\t \n" or "#" not in line[:30]:
                    continue
                cols = line.rstrip("\n").split("\t")
                m = REF_RE.match(cols[0])
                if not m:
                    continue
                book, ch, v, hch, hv, wnum, wtype = m.groups()
                if book not in BOOK_INDEX:
                    continue
                cols += [""] * (12 - len(cols))
                heb_raw, translit, gloss, dstrongs, grammar = cols[1:6]
                meaning_var, spelling_var = cols[6], cols[7]
                expanded = cols[11]
                try:
                    w = make_word(heb_raw, translit, gloss, dstrongs, grammar, expanded)
                except Exception:  # pragma: no cover
                    bad += 1
                    continue
                w["n"] = wnum
                t = wtype.split("(")[0]
                if t and t != "L":
                    w["x"] = t  # Q (Qere), R (restored), X (from LXX), LA... etc
                var = " ".join(x.strip() for x in (meaning_var, spelling_var) if x.strip())
                if var:
                    w["var"] = var
                key = (BOOK_INDEX[book], int(ch), int(v))
                if hch:
                    w["hr"] = f"{hch}:{hv}"
                verses.setdefault(key, []).append(w)
    log("TAHOT words:", sum(len(x) for x in verses.values()), "verses:", len(verses), "parse errors:", bad)
    return verses


def split_morphs(s):
    return [p for p in s.split("/")]


def make_word(heb_raw, translit, gloss, dstrongs, grammar, expanded):
    heb_raw = nfc(heb_raw.strip())
    # punctuation after backslashes: maqaf, sof pasuq, paseq, paragraph marks
    parts = heb_raw.split("\\")
    word = parts[0]
    punct = "".join(parts[1:]).replace("/", "")
    morphs = [m for m in word.split("/")]
    # remove empty morph pieces (e.g. a leading "/" quirk)
    morphs = [m for m in morphs if m != ""] or [word]

    tags = dstrongs.split("\\")[0].replace("+", "")
    tag_list = tags.split("/") if tags else []
    main = 0
    clean_tags = []
    for i, t in enumerate(tag_list):
        if "{" in t:
            main = i
        clean_tags.append(t.replace("{", "").replace("}", "").strip())

    gram = grammar.strip()
    lang = gram[:1] if gram[:1] in ("H", "A") else "H"
    gparts = gram[1:].split("/") if gram else []
    gparts = [lang + g for g in gparts]

    tl = translit.strip().split("/")
    gl = [g.strip() for g in gloss.strip().split("/")]

    n = len(morphs)
    # Line up per-morpheme fields. They agree in >99.9% of words; pad when they do not.
    def fit(lst, fill=""):
        lst = list(lst)
        if len(lst) < n:
            lst += [fill] * (n - len(lst))
        return lst[:n] if len(lst) > n else lst

    if len(clean_tags) != n:
        # keep the main tag on the main morpheme as best we can
        if len(clean_tags) > n:
            main_tag = clean_tags[main]
            clean_tags = clean_tags[:n]
            main = min(main, n - 1)
            clean_tags[main] = main_tag
        else:
            clean_tags = fit(clean_tags)
    w = {
        "h": morphs,
        "t": fit(tl),
        "g": fit(gl),
        "s": clean_tags,
        "m": fit(gparts),
        "k": main,
    }
    if punct:
        w["p"] = punct
    return w


# --------------------------------------------------------------------------- Romanian

def parse_romanian():
    with open(os.path.join(SRC, RO_FILE), encoding="utf-8-sig") as fh:
        t = fh.read()
    out = {}
    names = {}
    for bid, body in re.findall(r'<book id="(\w+)">(.*?)</book>', t, re.S):
        if bid not in USFX_INDEX:
            continue
        bi = USFX_INDEX[bid]
        h = re.search(r"<h>(.*?)</h>", body)
        if h:
            names[bi] = h.group(1).strip()
        ch = 0
        # tokens: chapter marks, verse marks, paragraph marks
        pos = 0
        cur = None
        buf = []

        def flush():
            if cur is not None:
                txt = "".join(buf)
                txt = re.sub(r"<f\b.*?</f>|<x\b.*?</x>", "", txt, flags=re.S)
                txt = re.sub(r"<[^>]+>", "", txt)
                txt = re.sub(r"\s+", " ", txt).strip()
                out[cur] = ro_norm(nfc(txt))

        for m in re.finditer(r'<c id="(\d+)"\s*/>|<v id="([\d\-]+)"\s*/>|<p\b[^>]*/?>|<ve\s*/>', body):
            if cur is not None:
                buf.append(body[pos:m.start()])
            pos = m.end()
            if m.group(1):
                flush(); cur = None; buf = []
                ch = int(m.group(1))
            elif m.group(2):
                flush(); buf = []
                vid = m.group(2)
                vstart = int(vid.split("-")[0])
                cur = (bi, ch, vstart)
            else:
                if cur is not None:
                    buf.append(" ")
        if cur is not None:
            buf.append(body[pos:])
            flush()
    log("Romanian verses:", len(out))
    return out, names


TOKEN_RE = re.compile(r"[A-Za-zĂÂÎȘȚăâîșțÀ-ÿ]+|\d+")


def ro_tokens(text):
    return [(m.start(), m.end()) for m in TOKEN_RE.finditer(text)]


# --------------------------------------------------------------------------- lexicon

def parse_tbesh():
    entries = {}
    with open(os.path.join(SRC, TBESH_FILE), encoding="utf-8-sig") as fh:
        for line in fh:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 8 or not re.match(r"^H\d{4}", cols[0]):
                continue
            estrong = cols[0].strip()
            d = cols[1].strip()
            dm = re.match(r"^(H\d{4}[A-Za-z]?)\s*=\s*(.*)$", d)
            if not dm:
                continue
            dstrong, relation = dm.group(1), dm.group(2).strip()
            entries[dstrong] = {
                "estrong": estrong,
                "dstrong": dstrong,
                "relation": relation,
                "ustrong": cols[2].strip().rstrip(","),
                "hebrew": nfc(cols[3].strip()),
                "translit": cols[4].strip(),
                "morph": cols[5].strip(),
                "gloss": cols[6].strip(),
                "meaning": cols[7].strip(),
            }
    log("TBESH entries:", len(entries))
    return entries


def parse_tehmc():
    codes = {}
    with open(os.path.join(SRC, TEHMC_FILE), encoding="utf-8-sig") as fh:
        lines = fh.read().split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("FULL MORPHOLOGY CODES"))
    cur = None
    for l in lines[start:]:
        cols = l.split("\t")
        if cols and re.match(r"^[HA][A-Za-z0-9]+$", cols[0]) and len(cols) > 1 and "Function=" in cols[1]:
            cur = cols[0]
            codes[cur] = {"full": cols[1].strip(), "short": "", "plain": "", "example": ""}
            continue
        if cur and len(cols) > 1 and cols[0] == "":
            txt = cols[1].strip()
            if not txt:
                continue
            c = codes[cur]
            if txt.startswith('"') and not c["short"]:
                c["short"] = txt.strip('"')
            elif txt.startswith("Example:"):
                c["example"] = txt[len("Example:"):].strip()
            elif not c["plain"]:
                c["plain"] = txt
        elif l.startswith("$"):
            cur = None
    log("morph codes:", len(codes))
    return codes


NS = "{http://openscriptures.github.com/morphhb/namespace}"


def parse_lexical_index():
    tree = ET.parse(os.path.join(SRC, "LexicalIndex.xml"))
    entries = {}
    for e in tree.getroot().iter(NS + "entry"):
        eid = e.get("id")
        w = e.find(NS + "w")
        x = e.find(NS + "xref")
        et = e.find(NS + "etym")
        pos = e.find(NS + "pos")
        d = e.find(NS + "def")
        entries[eid] = {
            "w": nfc(w.text or "") if w is not None else "",
            "xlit": w.get("xlit", "") if w is not None else "",
            "pos": pos.text if pos is not None else "",
            "def": d.text if d is not None else "",
            "strong": x.get("strong") if x is not None else None,
            "aug": x.get("aug") if x is not None else None,
            "twot": x.get("twot") if x is not None else None,
            "etype": et.get("type") if et is not None else None,
            "root": et.get("root") if et is not None else None,
            "etext": (et.text or "").strip() if et is not None else "",
        }
    aug = {}
    for w in ET.parse(os.path.join(SRC, "AugIndex.xml")).getroot().iter(NS + "w"):
        aug[w.get("aug")] = w.text
    log("lexical index entries:", len(entries), "aug:", len(aug))
    return entries, aug


def parse_strong_xml():
    tree = ET.parse(os.path.join(SRC, "HebrewStrong.xml"))
    out = {}

    def text_of(el):
        if el is None:
            return ""
        parts = []
        for t in el.itertext():
            parts.append(t)
        return re.sub(r"\s+", " ", "".join(parts)).strip()

    for e in tree.getroot().iter(NS + "entry"):
        eid = e.get("id")  # H157
        w = e.find(NS + "w")
        out[eid] = {
            "pron": w.get("pron", "") if w is not None else "",
            "xlit": w.get("xlit", "") if w is not None else "",
            "pos": w.get("pos", "") if w is not None else "",
            "source": text_of(e.find(NS + "source")),
            "meaning": text_of(e.find(NS + "meaning")),
            "usage": text_of(e.find(NS + "usage")),
        }
        # derivation links: from H###
        src = e.find(NS + "source")
        if src is not None:
            out[eid]["from"] = [x.get("src") for x in src.iter(NS + "w") if x.get("src")]
    log("Strong's entries:", len(out))
    return out


# --------------------------------------------------------------------------- lemma keys

def strong_num(tag):
    m = re.match(r"^H(\d{4})", tag)
    return int(m.group(1)) if m else None


class Lex:
    def __init__(self, tbesh):
        self.tbesh = tbesh

    def key(self, dstrong):
        """Learning key: one key per dictionary word.
        Names keep their individual dStrong (each person or place is its own entry),
        ordinary words collapse the meaning-level split (H0776G/H0776H -> H0776)."""
        e = self.tbesh.get(dstrong)
        if not e:
            n = strong_num(dstrong)
            return f"H{n:04d}" if n is not None else dstrong
        if e["morph"].startswith("N:") or dstrong.startswith("H9"):
            return dstrong
        return e["estrong"]


# --------------------------------------------------------------------------- alignment

def symmetrize_gdfa(fwd, rev, n_src, n_trg):
    """grow-diag-final-and. fwd/rev are sets of (s, t)."""
    union = fwd | rev
    a = set(fwd & rev)
    neighbors = [(-1, 0), (0, -1), (1, 0), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    aligned_s = {s for s, _ in a}
    aligned_t = {t for _, t in a}
    added = True
    while added:
        added = False
        for (s, t) in sorted(a):
            for ds, dt in neighbors:
                ns, nt = s + ds, t + dt
                if 0 <= ns < n_src and 0 <= nt < n_trg and (ns, nt) in union and (ns, nt) not in a:
                    if ns not in aligned_s or nt not in aligned_t:
                        a.add((ns, nt)); aligned_s.add(ns); aligned_t.add(nt); added = True
    for (s, t) in sorted(union):
        if (s not in aligned_s and t not in aligned_t) and (s, t) not in a:
            a.add((s, t)); aligned_s.add(s); aligned_t.add(t)
    return a


def run_alignment(rows):
    """rows: list of dicts with ro_text, ro_tok (offsets), words.
    Adds row['links'] = [[ro_tok_idx, word_idx, morph_idx], ...]"""
    try:
        import eflomal
        import snowballstemmer
    except ImportError:
        log("eflomal / snowballstemmer not installed, skipping alignment")
        return False
    stem = snowballstemmer.stemmer("romanian")
    src_lines, trg_lines, trg_maps = [], [], []
    for r in rows:
        toks = [r["ro_text"][a:b].lower() for a, b in r["ro_tok"]]
        stems = stem.stemWords(toks) if toks else []
        src_lines.append(" ".join(stems) if stems else "∅")
        tmap = []
        ttoks = []
        for wi, w in enumerate(r["words"]):
            if w.get("x") == "X":
                continue
            for mi, tag in enumerate(w["s"]):
                n = strong_num(tag) if tag else None
                if n is None:
                    continue
                ttoks.append(f"H{n}")
                tmap.append((wi, mi))
        trg_lines.append(" ".join(ttoks) if ttoks else "∅")
        trg_maps.append(tmap)
    log("aligning", len(rows), "verses with eflomal (this takes a few minutes)")
    tmpdir = os.path.join(HERE, "tmp")
    os.makedirs(tmpdir, exist_ok=True)
    fwd_path = os.path.join(tmpdir, "fwd.links")
    rev_path = os.path.join(tmpdir, "rev.links")
    aligner = eflomal.Aligner(model=3, n_samplers=4, rel_iterations=2.0)
    aligner.align(src_lines, trg_lines, links_filename_fwd=fwd_path, links_filename_rev=rev_path, quiet=True)

    def read_links(p):
        res = []
        with open(p) as fh:
            for line in fh:
                s = set()
                for pair in line.split():
                    a, b = pair.split("-")
                    s.add((int(a), int(b)))
                res.append(s)
        return res

    fwd = read_links(fwd_path)
    rev = read_links(rev_path)
    total = 0
    for r, f, rv, tmap in zip(rows, fwd, rev, trg_maps):
        n_src = len(r["ro_tok"])
        n_trg = len(tmap)
        if not n_src or not n_trg:
            r["links"] = []
            continue
        sym = symmetrize_gdfa(f, rv, n_src, n_trg)
        links = []
        for s, t in sorted(sym):
            if s < n_src and t < n_trg:
                wi, mi = tmap[t]
                links.append([s, wi, mi])
        r["links"] = links
        total += len(links)
    log("alignment links:", total)
    return True


# --------------------------------------------------------------------------- renderings

def _fold(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))


def _same_word(a, b):
    """Rough test that two Romanian words are forms of one word (dumnezeu / dumnezeului, iubesc / iubit)."""
    a, b = _fold(a), _fold(b)
    if a == b:
        return True
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n >= 3 and n >= min(len(a), len(b)) - 2


def cluster_renderings(counter, top=8):
    """Group Romanian renderings that are forms of the same word.
    Returns [[display, count, [other forms]], ...]."""
    lower = collections.Counter()
    caps = collections.Counter()
    for phrase, n in counter.items():
        k = phrase.lower()
        lower[k] += n
        if phrase[:1].isupper():
            caps[k] += n
    clusters = []
    for phrase, n in lower.most_common():
        words = phrase.split()
        for c in clusters:
            hw = c["head"].split()
            if len(hw) == len(words) and all(_same_word(x, y) for x, y in zip(hw, words)):
                c["n"] += n
                c["forms"].append(phrase)
                break
        else:
            clusters.append({"head": phrase, "n": n, "forms": []})
    clusters.sort(key=lambda c: -c["n"])
    out = []
    for c in clusters[:top]:
        head = c["head"]
        if caps[head] >= 0.8 * lower[head]:
            head = head[:1].upper() + head[1:]
        out.append([head, c["n"], c["forms"][:4]])
    return out


# --------------------------------------------------------------------------- build

def pack_word(w):
    """Compact word record sent to the app:
    [hebrew morphs, translit, gloss, strongs, morph codes, main index, lemma key, punctuation, extra]
    Morpheme pieces are joined with "/"; morph codes carry the language letter only once."""
    m = w["m"]
    lang = (m[0][:1] if m and m[0] else "H") or "H"
    mstr = lang + "/".join(x[1:] for x in m)
    arr = ["/".join(w["h"]), "/".join(w["t"]), "/".join(w["g"]), "/".join(w["s"]), mstr,
           w["k"], w["l"], w.get("p", "")]
    extra = {k: w[k] for k in ("x", "var", "hr", "ti") if k in w}
    if extra:
        arr.append(extra)
    return arr


def build(args):
    if not args.offline:
        ensure_sources()
    tahot = parse_tahot()
    ro, ro_names = parse_romanian()
    tbesh = parse_tbesh()
    tehmc = parse_tehmc()
    lexidx, aug = parse_lexical_index()
    strongs = parse_strong_xml()
    lex = Lex(tbesh)

    # ---- merge Hebrew and Romanian by English (Romanian) versification
    keys = sorted(set(k for k in tahot) | set(k for k in ro if k[0] < len(BOOKS)))
    rows = []
    missing_ro, missing_he = [], []
    for key in keys:
        bi, ch, v = key
        if v == 0:
            continue  # psalm titles are merged into verse 1 below
        words = []
        title_words = tahot.get((bi, ch, 0), []) if v == 1 else []
        for w in title_words:
            w = dict(w); w["ti"] = 1
            words.append(w)
        words += tahot.get(key, [])
        text = ro.get(key, "")
        if not text:
            missing_ro.append(key)
        if not words:
            missing_he.append(key)
        rows.append({"key": key, "ro_text": text, "ro_tok": ro_tokens(text), "words": words})
    log("verses:", len(rows), "missing Romanian:", len(missing_ro), "missing Hebrew:", len(missing_he))
    for k in missing_ro[:30]:
        log("  no Romanian for", BOOKS[k[0]][0], k[1], k[2])
    for k in missing_he[:30]:
        log("  no Hebrew for", BOOKS[k[0]][0], k[1], k[2])

    # lemma key per word (main morpheme)
    for r in rows:
        for w in r["words"]:
            tag = w["s"][w["k"]] if w["s"] else ""
            w["l"] = lex.key(tag) if tag else ""

    aligned = False
    if not args.no_align:
        aligned = run_alignment(rows)

    # ---- frequencies and Cornilescu renderings
    freq = collections.Counter()
    dfreq = collections.Counter()
    renderings = collections.defaultdict(collections.Counter)
    for r in rows:
        toks = r["ro_tok"]
        for wi, w in enumerate(r["words"]):
            if w.get("x") == "X":
                continue
            if w["l"]:
                freq[w["l"]] += 1
                dfreq[w["s"][w["k"]] if w["s"] else ""] += 1
            for tag in w["s"]:
                if tag.startswith("H9"):
                    freq[tag] += 0  # keep key present
        if aligned:
            by_word = collections.defaultdict(list)
            for s, wi, mi in r.get("links", []):
                w = r["words"][wi]
                if mi == w["k"]:
                    by_word[wi].append(s)
            for wi, ss in by_word.items():
                ss = sorted(set(ss))
                # group consecutive Romanian tokens into phrases
                groups, cur = [], [ss[0]]
                for s in ss[1:]:
                    if s == cur[-1] + 1:
                        cur.append(s)
                    else:
                        groups.append(cur); cur = [s]
                groups.append(cur)
                phrase = " ".join(" ".join(r["ro_text"][toks[i][0]:toks[i][1]] for i in g) for g in groups)
                w = r["words"][wi]
                renderings[w["l"]][phrase] += 1

    # ---- word families (roots) from the OpenScriptures lexical index
    def lex_id_for(estrong):
        m = re.match(r"^H(\d{4})([a-z]?)$", estrong)
        if not m:
            return None
        k = str(int(m.group(1))) + m.group(2)
        return aug.get(k) or aug.get(str(int(m.group(1))))

    def root_of(eid, depth=0):
        e = lexidx.get(eid)
        if not e or depth > 6:
            return eid
        if e["etype"] == "sub" and e["etext"]:
            parent = e["etext"].split(",")[0].strip()
            return root_of(parent, depth + 1)
        return eid

    def key_for_lexid(eid):
        e = lexidx.get(eid)
        if not e or not e["strong"] or not e["strong"].isdigit():
            return None
        n = int(e["strong"])
        return f"H{n:04d}{e['aug'] or ''}"

    families = {}

    def family_members(root_id):
        if root_id in families:
            return families[root_id]
        seen, order = set(), []
        stack = [root_id]
        while stack:
            eid = stack.pop(0)
            if eid in seen:
                continue
            seen.add(eid)
            order.append(eid)
            e = lexidx.get(eid)
            if e and e["etype"] == "main" and e["etext"]:
                for c in e["etext"].split(","):
                    c = c.strip()
                    if c:
                        stack.append(c)
        families[root_id] = order
        return order

    # ---- write database
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    tmp = DB_PATH + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript("""
    PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
    CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE books(idx INTEGER PRIMARY KEY, code TEXT, usfx TEXT, ro TEXT, en TEXT, he TEXT, he_tr TEXT, chapters INTEGER);
    CREATE TABLE verses(id INTEGER PRIMARY KEY, book INTEGER, ch INTEGER, v INTEGER, ro TEXT);
    CREATE INDEX verses_ref ON verses(book, ch, v);
    CREATE TABLE chapters(book INTEGER, ch INTEGER, data BLOB, PRIMARY KEY(book, ch));
    CREATE TABLE occ(lemma TEXT, verse INTEGER, w INTEGER, morph TEXT);
    CREATE INDEX occ_lemma ON occ(lemma);
    CREATE TABLE lemmas(key TEXT PRIMARY KEY, data TEXT, freq INTEGER, rank INTEGER, gloss TEXT, hebrew TEXT, cons TEXT, translit TEXT, family TEXT, ro TEXT);
    CREATE INDEX lemmas_family ON lemmas(family);
    CREATE TABLE families(id TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE morph(code TEXT PRIMARY KEY, data TEXT);
    CREATE TABLE chapter_lemmas(book INTEGER, ch INTEGER, data TEXT, PRIMARY KEY(book, ch));
    """)
    chapters = collections.Counter()
    for r in rows:
        bi, ch, v = r["key"]
        chapters[bi] = max(chapters[bi], ch)
    for i, b in enumerate(BOOKS):
        db.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?)",
                   (i, b[0], b[1], b[2], b[3], b[4], b[5], chapters[i]))

    occ_rows = []
    ch_lem = collections.defaultdict(collections.Counter)
    chap_data = collections.defaultdict(list)
    for vid, r in enumerate(rows, start=1):
        bi, ch, v = r["key"]
        db.execute("INSERT INTO verses VALUES(?,?,?,?,?)", (vid, bi, ch, v, r["ro_text"]))
        flat_tok = [x for ab in r["ro_tok"] for x in ab]
        flat_links = [x for l in r.get("links", []) for x in l]
        chap_data[(bi, ch)].append([v, vid, r["ro_text"], flat_tok, [pack_word(w) for w in r["words"]], flat_links])
        for wi, w in enumerate(r["words"]):
            if w.get("x") == "X":
                continue
            occ_rows.append((w["l"], vid, wi, "/".join(w["m"])))
            if w["l"]:
                ch_lem[(bi, ch)][w["l"]] += 1
    for (bi, ch), verses in chap_data.items():
        blob = zlib.compress(json.dumps(verses, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)
        db.execute("INSERT INTO chapters VALUES(?,?,?)", (bi, ch, blob))
    db.executemany("INSERT INTO occ VALUES(?,?,?,?)", occ_rows)
    for (bi, ch), c in ch_lem.items():
        db.execute("INSERT INTO chapter_lemmas VALUES(?,?,?)", (bi, ch, json.dumps(c, separators=(",", ":"))))

    # lemmas: one row per learning key that occurs in the text (plus every TBESH key for lookups)
    by_key = collections.defaultdict(list)
    for d, e in tbesh.items():
        by_key[lex.key(d)].append(e)
    ranked = [k for k, _ in freq.most_common() if not k.startswith("H9")]
    rank = {k: i + 1 for i, k in enumerate(ranked)}
    family_rows = {}
    lemma_count = 0
    for key, ents in by_key.items():
        # pick the representative entry: the one that is not "a Meaning of"/"a Part of" another, else first
        # representative entry: the sense that occurs most in the text, then the main (unrelated) one
        ents_sorted = sorted(ents, key=lambda e: (-dfreq.get(e["dstrong"], 0), bool(e["relation"]), e["dstrong"]))
        rep = ents_sorted[0]
        senses = []
        for e in sorted(ents, key=lambda e: e["dstrong"]):
            senses.append({"d": e["dstrong"], "gloss": e["gloss"], "rel": e["relation"]})
        n = strong_num(rep["dstrong"])
        st = strongs.get(f"H{n}") if n else None
        lid = lex_id_for(rep["estrong"]) if not key.startswith("H9") else None
        fam_id = None
        root_letters = None
        if lid:
            rid = root_of(lid)
            fam_id = rid
            re_ = lexidx.get(rid, {})
            root_letters = re_.get("root") or re_.get("w")
            if rid not in family_rows:
                members = []
                for mid in family_members(rid):
                    me = lexidx.get(mid)
                    if not me:
                        continue
                    members.append({
                        "key": key_for_lexid(mid),
                        "w": me["w"], "xlit": me["xlit"], "pos": me["pos"], "def": me["def"],
                        "twot": me["twot"],
                    })
                family_rows[rid] = {"id": rid, "root": root_letters, "root_xlit": re_.get("xlit"),
                                    "root_def": re_.get("def"), "is_root": bool(re_.get("root")),
                                    "members": members}
        data = {
            "key": key,
            "dstrong": rep["dstrong"],
            "hebrew": rep["hebrew"],
            "translit": rep["translit"],
            "morph": rep["morph"],
            "gloss": rep["gloss"],
            "meaning": rep["meaning"],
            "senses": senses if len(senses) > 1 else [],
            "strong": st,
            "twot": lexidx.get(lid, {}).get("twot") if lid else None,
            "ro": cluster_renderings(renderings.get(key, collections.Counter())),
        }
        f = freq.get(key, 0)
        ro_words = " | ".join([x[0] for x in data["ro"]] + [f for x in data["ro"] for f in x[2]])
        db.execute("INSERT INTO lemmas VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (key, json.dumps(data, ensure_ascii=False, separators=(",", ":")), f, rank.get(key),
                    rep["gloss"], rep["hebrew"], consonants(rep["hebrew"]), rep["translit"], fam_id, ro_words))
        lemma_count += 1
    for rid, fam in family_rows.items():
        db.execute("INSERT INTO families VALUES(?,?)", (rid, json.dumps(fam, ensure_ascii=False, separators=(",", ":"))))
    for code, d in tehmc.items():
        db.execute("INSERT INTO morph VALUES(?,?)", (code, json.dumps(d, ensure_ascii=False, separators=(",", ":"))))
    db.execute("INSERT INTO meta VALUES('built', ?)", (time.strftime("%Y-%m-%d %H:%M"),))
    db.execute("INSERT INTO meta VALUES('aligned', ?)", ("1" if aligned else "0",))
    db.execute("INSERT INTO meta VALUES('version', '1')")
    db.commit()
    db.execute("VACUUM")
    db.close()
    os.replace(tmp, DB_PATH)
    log("lemmas:", lemma_count, "families:", len(family_rows))
    # KJV, Romanian meanings, word forms
    import add_extras
    add_extras.run(DB_PATH)
    log("wrote", DB_PATH, f"{os.path.getsize(DB_PATH)/1e6:.1f} MB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-align", action="store_true", help="skip Romanian-Hebrew word alignment")
    ap.add_argument("--offline", action="store_true", help="do not download, use build/sources as is")
    build(ap.parse_args())
