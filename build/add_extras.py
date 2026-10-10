#!/usr/bin/env python3
"""
Adds to an existing data/mikra.db:
  - the King James Old Testament (from build/data/kjv-ot.tsv.gz) with links from each English word to the Hebrew word
    it translates. The KJV text carries Strong's numbers, so most links are exact; small words like "the", "and",
    "in" are linked to the matching Hebrew prefix.
  - how the KJV translates each dictionary word (like the Cornilescu list)
  - a short Romanian meaning for each dictionary word, taken from how Cornilescu translates it
  - every form of every word that occurs in the text, with its grammar code and count

build_db.py runs this at the end. You can also run it alone on a built database:
    python build/add_extras.py
"""
import collections
import gzip
import json
import os
import re
import sqlite3
import sys
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from build_db import cluster_renderings, strip_cantillation  # noqa: E402
from ro_glosses import RO_OVERRIDES  # noqa: E402

DEFAULT_DB = os.path.join(ROOT, "data", "mikra.db")
KJV_FILE = os.path.join(HERE, "data", "kjv-ot.tsv.gz")

EN_TOKEN = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?|\d+")
TAG = re.compile(r'<(/?)(w|a|t)(?: s="([^"]*)")?>')

# untagged English words that translate a Hebrew prefix, by the prefix's tag
FUNCTION_WORDS = {
    "the": ("H9009",), "and": ("H9002", "H9001"), "but": ("H9002",), "then": ("H9001", "H9002"),
    "in": ("H9003",), "with": ("H9003",), "by": ("H9003",), "into": ("H9003",),
    "to": ("H9005",), "unto": ("H9005",), "for": ("H9005",),
    "from": ("H9006",), "than": ("H9006",), "as": ("H9004",), "like": ("H9004",),
    # possessive words before a noun -> the noun's suffix
    "my": ("H9020",), "thy": ("H9021", "H9022"), "his": ("H9023",), "her": ("H9024",), "our": ("H9025",),
    "your": ("H9026", "H9027", "H9021", "H9022"), "their": ("H9028", "H9029"),
}
# object words after a verb or preposition -> its suffix
OBJECT_WORDS = {
    "me": ("H9030", "H9020", "H9040"), "thee": ("H9031", "H9032", "H9021", "H9022"), "him": ("H9033", "H9023"),
    "her": ("H9034", "H9024"), "us": ("H9035", "H9025"), "you": ("H9036", "H9037", "H9026", "H9027"),
    "them": ("H9038", "H9039", "H9028", "H9029"), "it": ("H9033", "H9034"),
}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def snum(tag):
    m = re.match(r"^H(\d{1,4})", tag or "")
    return int(m.group(1)) if m else None


def parse_kjv(text):
    """Returns plain text, token offsets, the Strong's numbers of each token's group, group ids, italic flags."""
    text = re.sub(r"\s*¶\s*", " ", text).strip()  # paragraph marks of printed editions
    plain, toks, nums, groups, added = [], [], [], [], []
    pos = 0
    cur_nums, cur_group, in_added = (), -1, False
    gid = 0
    i = 0
    for m in TAG.finditer(text + "<t>"):
        chunk = text[i:m.start()]
        if chunk:
            for t in EN_TOKEN.finditer(chunk):
                toks.append((pos + t.start(), pos + t.end()))
                nums.append(cur_nums)
                groups.append(cur_group)
                added.append(in_added)
            plain.append(chunk)
            pos += len(chunk)
        i = m.end()
        closing, name, s = m.group(1), m.group(2), m.group(3)
        if name == "w":
            if closing:
                cur_nums, cur_group = (), -1
            else:
                cur_nums = tuple(n for n in (snum(x) for x in (s or "").split()) if n)
                gid += 1
                cur_group = gid
        elif name == "a":
            in_added = not closing
    return "".join(plain), toks, nums, groups, added


def link_verse(words, toks, nums, groups, added, text):
    """words: packed Hebrew words. Returns flat [tok, word, morph, ...]."""
    # Hebrew morphemes by Strong's number, in order
    heb = collections.defaultdict(list)
    prefixes = {}  # word index -> {tag: morph index}
    nwords = max(1, len(words))
    for wi, p in enumerate(words):
        extra = p[8] if len(p) > 8 else {}
        if extra.get("x") == "X":
            continue
        tags = p[3].split("/")
        for mi, tag in enumerate(tags):
            n = snum(tag)
            if n is None:
                continue
            if n >= 9000:
                prefixes.setdefault(wi, {})[tag[:5]] = mi
            else:
                heb[n].append((wi, mi))
    # English groups by Strong's number
    order = []  # (group id, numbers, first token index)
    seen = set()
    for ti, g in enumerate(groups):
        if g > 0 and g not in seen and nums[ti]:
            seen.add(g)
            order.append((g, nums[ti], ti))
    ntok = max(1, len(toks))
    group_target = {}
    counts = collections.Counter()
    totals = collections.Counter(n for _, ns, _ in order for n in ns[:1])
    for g, ns, ti in order:
        targets = []
        for n in ns:
            occ = heb.get(n)
            if not occ:
                continue
            if totals[n] == len(occ):
                targets.append(occ[counts[n]])
            else:  # different counts: closest by position in the verse
                rel = ti / ntok
                targets.append(min(occ, key=lambda o: abs(o[0] / nwords - rel)))
            counts[n] += 1
        if targets:
            group_target[g] = targets
    links = []
    for ti, g in enumerate(groups):
        for wi, mi in group_target.get(g, ()):
            links += [ti, wi, mi]
    # function words just before a linked word -> that word's prefix
    for ti in range(len(toks)):
        if groups[ti] > 0 or added[ti]:
            continue
        word = text[toks[ti][0]:toks[ti][1]].lower()
        want = FUNCTION_WORDS.get(word)
        for look in ((1, 2, 3) if want else ()):
            j = ti + look
            if j >= len(toks):
                break
            if groups[j] > 0:
                for wi, _ in group_target.get(groups[j], ()):
                    pre = prefixes.get(wi, {})
                    for tag in want:
                        if tag in pre:
                            links += [ti, wi, pre[tag]]
                            break
                break
        # "him", "them" ... right after a linked word
        want = OBJECT_WORDS.get(word)
        if want and ti > 0 and groups[ti - 1] > 0:
            for wi, _ in group_target.get(groups[ti - 1], ()):
                pre = prefixes.get(wi, {})
                for tag in want:
                    if tag in pre:
                        links += [ti, wi, pre[tag]]
                        break
    return links


def run(db_path=DEFAULT_DB):
    db = sqlite3.connect(db_path)
    db.executescript("""
    DROP TABLE IF EXISTS en_chapters; DROP TABLE IF EXISTS en_verses; DROP TABLE IF EXISTS forms;
    CREATE TABLE en_chapters(book INTEGER, ch INTEGER, data BLOB, PRIMARY KEY(book, ch));
    CREATE TABLE en_verses(id INTEGER PRIMARY KEY, text TEXT);
    CREATE TABLE forms(lemma TEXT, form TEXT, morph TEXT, n INTEGER, verse INTEGER, w INTEGER);
    """)
    cols = {r[1] for r in db.execute("PRAGMA table_info(lemmas)")}
    if "gloss_ro" not in cols:
        db.execute("ALTER TABLE lemmas ADD COLUMN gloss_ro TEXT")

    kjv = {}
    if os.path.exists(KJV_FILE):
        with gzip.open(KJV_FILE, "rt", encoding="utf-8") as fh:
            for line in fh:
                b, c, v, t = line.rstrip("\n").split("\t", 3)
                kjv[(int(b), int(c), int(v))] = t
    log("KJV verses:", len(kjv))

    renderings = collections.defaultdict(collections.Counter)
    forms = {}
    total_links = 0
    for book, ch, blob in db.execute("SELECT book, ch, data FROM chapters ORDER BY book, ch").fetchall():
        verses = json.loads(zlib.decompress(blob))
        en_rows = []
        for vrow in verses:
            v, vid, _ro, _tok, words = vrow[0], vrow[1], vrow[2], vrow[3], vrow[4]
            # forms
            for wi, p in enumerate(words):
                extra = p[8] if len(p) > 8 else {}
                if extra.get("x") == "X" or not p[6]:
                    continue
                codes = p[4]
                lang = codes[:1] or "H"
                code_list = [lang + c for c in codes[1:].split("/")]
                main = code_list[p[5]] if p[5] < len(code_list) else code_list[-1]
                form = strip_cantillation(p[0].replace("/", ""))
                key = (p[6], form, main)
                if key in forms:
                    forms[key][0] += 1
                else:
                    forms[key] = [1, vid, wi]
            # English
            raw = kjv.get((book, ch, v))
            if raw is None:
                en_rows.append([v, vid, [], [], []])
                continue
            text, toks, nums, groups, added = parse_kjv(raw)
            links = link_verse(words, toks, nums, groups, added, text)
            total_links += len(links) // 3
            db.execute("INSERT INTO en_verses VALUES(?,?)", (vid, text))
            # the text itself lives in en_verses (searchable); the chapter blob only has offsets and links
            en_rows.append([v, vid, [x for ab in toks for x in ab], links, [i for i, a in enumerate(added) if a]])
            # renderings: English words linked to each Hebrew word's main part
            by_word = collections.defaultdict(list)
            for i in range(0, len(links), 3):
                t, wi, mi = links[i], links[i + 1], links[i + 2]
                if mi == words[wi][5]:
                    by_word[wi].append(t)
            for wi, ts in by_word.items():
                ts = sorted(set(ts))
                gr, cur = [], [ts[0]]
                for t in ts[1:]:
                    if t == cur[-1] + 1:
                        cur.append(t)
                    else:
                        gr.append(cur)
                        cur = [t]
                gr.append(cur)
                phrase = " ".join(" ".join(text[toks[i][0]:toks[i][1]] for i in g) for g in gr)
                renderings[words[wi][6]][phrase] += 1
        blob = zlib.compress(json.dumps(en_rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)
        db.execute("INSERT INTO en_chapters VALUES(?,?,?)", (book, ch, blob))
    log("KJV links:", total_links)

    db.executemany("INSERT INTO forms VALUES(?,?,?,?,?,?)",
                   [(k[0], k[1], k[2], f[0], f[1], f[2]) for k, f in forms.items()])
    db.execute("CREATE INDEX forms_lemma ON forms(lemma)")
    log("word forms:", len(forms))

    # KJV renderings and Romanian meanings per dictionary word
    n_ro = 0
    for key, data in db.execute("SELECT key, data FROM lemmas").fetchall():
        d = json.loads(data)
        d["en"] = cluster_renderings(renderings.get(key, collections.Counter()))
        gloss_ro = RO_OVERRIDES.get(key) or romanian_gloss(d.get("ro") or [], ":V" in (d.get("morph") or ""))
        if gloss_ro:
            n_ro += 1
        d["gloss_ro"] = gloss_ro
        db.execute("UPDATE lemmas SET data=?, gloss_ro=? WHERE key=?",
                   (json.dumps(d, ensure_ascii=False, separators=(",", ":")), gloss_ro, key))
    log("Romanian meanings:", n_ro)
    slim(db)
    db.execute("INSERT OR REPLACE INTO meta VALUES('kjv', ?)", ("1" if kjv else "0",))
    db.execute("INSERT OR REPLACE INTO meta VALUES('extras', ?)", (time.strftime("%Y-%m-%d %H:%M"),))
    db.commit()
    db.execute("VACUUM")
    db.close()
    log("done", db_path, "%.1f MB" % (os.path.getsize(db_path) / 1e6))


def slim(db):
    """Keeps the database under GitHub's 50 MB warning without losing anything:
    the Romanian text is kept once (in verses, the server puts it back into each chapter), and the grammar
    codes of the 305,000 word rows point into a small table instead of repeating the text."""
    for book, ch, blob in db.execute("SELECT book, ch, data FROM chapters").fetchall():
        verses = json.loads(zlib.decompress(blob))
        if any(v[2] for v in verses):
            for v in verses:
                v[2] = ""
            blob = zlib.compress(json.dumps(verses, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)
            db.execute("UPDATE chapters SET data=? WHERE book=? AND ch=?", (blob, book, ch))
    cols = {r[1] for r in db.execute("PRAGMA table_info(occ)")}
    if "morph" in cols:
        db.executescript("""
        DROP TABLE IF EXISTS morphs;
        CREATE TABLE morphs(id INTEGER PRIMARY KEY, code TEXT UNIQUE);
        INSERT INTO morphs(code) SELECT DISTINCT morph FROM occ ORDER BY morph;
        CREATE TABLE occ_new(lemma TEXT, verse INTEGER, w INTEGER, mid INTEGER);
        INSERT INTO occ_new SELECT o.lemma, o.verse, o.w, m.id FROM occ o JOIN morphs m ON m.code = o.morph ORDER BY o.rowid;
        DROP TABLE occ;
        ALTER TABLE occ_new RENAME TO occ;
        CREATE INDEX occ_lemma ON occ(lemma);
        """)
    log("slimmed chapters and word rows")


def _close_form(cand, head):
    """True when cand looks like another form of the same word as head, not a different shorter word
    that the clustering lumped in (trei / treizeci, mie / miel, putut / putere)."""
    a, b = cand.lower(), head.lower()
    if a == b:
        return True
    if len(a.split()) != len(b.split()):
        return False
    if b.startswith(a):
        rest = b[len(a):]
        if rest in ("ului", "ilor", "elor"):  # Moabului, Sionului: the plain name is the better meaning
            return True
        return len(rest) <= 3 and not (rest == "l" and not a.endswith("u"))
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n >= min(len(a), len(b)) - 1


def _verb_form(word, cands):
    """Dictionary form of a verb, when the renderings confirm it (căutat + căuta -> a căuta, fugi + fugit -> a fugi)."""
    if " " in word:
        return None
    low = {c.lower() for c in cands}
    w = word.lower()
    if w.endswith(("at", "it")) and w[:-1] in low:
        return "a " + word[:-1]
    if w.endswith("ât") and w[:-2] + "î" in low:
        return "a " + word[:-2] + "î"
    if len(w) > 3 and w[-1] in "aiî" and (w + "t" in low or (w[-1] == "î" and w[:-1] + "ât" in low)):
        return "a " + word
    return None


def romanian_gloss(ro, is_verb=False):
    """Short Romanian meaning from Cornilescu's renderings: the plainest form of the top one or two.
    Verbs become "a ..." when the renderings show the infinitive."""
    if not ro:
        return ""
    out = []
    first = ro[0][1]
    for head, n, forms in ro[:2]:
        if out and n < 0.3 * first:
            break
        cands = [head] + [f for f in forms if _close_form(f, head)]
        best = min(cands, key=lambda s: (len(s), cands.index(s)))
        if head[:1].isupper():
            best = best[:1].upper() + best[1:]
        if is_verb:
            best = _verb_form(best, [head] + list(forms)) or best
        if best.lower() not in (x.lower() for x in out):
            out.append(best)
    return ", ".join(out)


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB)
