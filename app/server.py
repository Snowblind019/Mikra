#!/usr/bin/env python3
"""
Mikra: local server.

Runs a small web server on 127.0.0.1 and opens the app in a browser window.
Only the Python standard library is required. edge-tts is optional (pronunciation audio).

  python app/server.py              # start and open the app
  python app/server.py --no-browser # start only, print the address
  python app/server.py --port 8800
"""
import argparse
import collections
import functools
import glob
import hmac
import ipaddress
import json
import os
import platform
import re
import secrets
import shutil
import socket
import sqlite3
import subprocess
import sys
import threading
import time
import traceback
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(APP_DIR)
WEB_DIR = os.path.realpath(os.path.join(ROOT, "web"))
DB_PATH = os.path.join(ROOT, "data", "mikra.db")
VERSION = "2.2.1"
MAX_BODY = 64 * 1024 * 1024  # userdata.json is a few MB at most; anything bigger is a mistake

# Sent with every response. The page only loads its own files, so other sites can't frame it,
# inject scripts into it, or embed its API responses.
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                               "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; "
                               "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
}

sys.path.insert(0, APP_DIR)
import tts  # noqa: E402


# --------------------------------------------------------------------------- platform helpers

def is_wsl():
    if platform.system() != "Linux":
        return False
    try:
        with open("/proc/version", encoding="utf-8", errors="ignore") as fh:
            return "microsoft" in fh.read().lower()
    except OSError:
        return False


def user_data_dir():
    override = os.environ.get("MIKRA_DATA") or os.environ.get("HEBREW_READER_DATA")
    if override:
        return override
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        new, old = os.path.join(base, "Mikra"), os.path.join(base, "HebrewReader")
    elif sys.platform == "darwin":
        new, old = os.path.expanduser("~/Library/Application Support/Mikra"), os.path.expanduser("~/Library/Application Support/HebrewReader")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
        new, old = os.path.join(base, "mikra"), os.path.join(base, "hebrew-reader")
    # the app used to be called Hebrew Reader: move its saved progress to the new folder once
    if not os.path.exists(new) and os.path.isdir(old):
        try:
            os.rename(old, new)
        except OSError:
            try:
                shutil.copytree(old, new)
            except OSError:
                return old
    return new


USER_DIR = user_data_dir()
USER_FILE = os.path.join(USER_DIR, "userdata.json")
BACKUP_DIR = os.path.join(USER_DIR, "backups")
AUDIO_DIR = os.path.join(USER_DIR, "audio-cache")
KEY_FILE = os.path.join(USER_DIR, "server-key")

# The API needs a secret cookie, like in the Android app. Other programs and other user accounts can reach
# 127.0.0.1 too; without the key they only get the page's own files, never your progress. The key lives in your
# user folder (readable only by you). The launcher opens the browser with a one-time start link, which /__start
# swaps for the key as a cookie: a browser's command line can be read by other user accounts, so it never holds
# the key itself. The link printed in the terminal has the key, for opening Mikra by hand.
KEY = None


def cookie_name(port):
    # Browsers send a localhost cookie to every port, so each port gets its own name: two copies of Mikra with
    # different data folders (different keys) don't overwrite each other's cookie.
    return "mikra_key_%d" % port


_start_lock = threading.Lock()
_start_tokens = {}  # one-time start token -> time it expires


def new_start_token():
    t = secrets.token_hex(16)
    now = time.time()
    with _start_lock:
        for k in [k for k, exp in _start_tokens.items() if exp < now]:
            del _start_tokens[k]
        _start_tokens[t] = now + 120
    return t


def use_start_token(t):
    with _start_lock:
        exp = _start_tokens.pop(t, None)  # one use only
    return exp is not None and exp >= time.time()


def key_proof(nonce):
    return hmac.new(KEY.encode("ascii"), b"mikra-ping:" + nonce.encode("ascii"), "sha256").hexdigest()


def load_key():
    try:
        with open(KEY_FILE, encoding="ascii") as fh:
            k = fh.read().strip()
        if re.fullmatch(r"[0-9a-f]{48}", k):
            return k
    except (OSError, ValueError):
        pass
    k = secrets.token_hex(24)
    os.makedirs(USER_DIR, exist_ok=True)
    tmp = KEY_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as fh:
        fh.write(k + "\n")
    if os.name != "nt":
        os.chmod(tmp, 0o600)  # in case an old .tmp file was left with other permissions
    os.replace(tmp, KEY_FILE)
    return k


def start_url(port, token=None):
    """The start link: with a one-time token for the browser's command line, with the key for the terminal."""
    t = token or KEY
    return "http://localhost:%d/__start?t=%s" % (port, t) if t else "http://localhost:%d/" % port


# --------------------------------------------------------------------------- database

_local = threading.local()


def strip_accents(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


@functools.lru_cache(maxsize=64)
def _compiled(pattern):
    return re.compile(pattern)


def _regexp(pattern, s):
    return 1 if s is not None and _compiled(pattern).search(s) else 0


def db():
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.execute("PRAGMA query_only=1")
        conn.create_function("unacc", 1, strip_accents, deterministic=True)
        conn.create_function("regexp", 2, _regexp, deterministic=True)
        _local.conn = conn
    return conn


def num(q, name, default, lo, hi):
    """Integer query parameter, clamped. Negative LIMIT in SQLite means 'no limit', so clamping matters."""
    raw = q.get(name)
    if raw in (None, ""):
        return default
    try:
        v = int(raw)
    except (TypeError, ValueError):
        raise ValueError("%s must be a whole number" % name)
    return max(lo, min(hi, v))


def like_escape(s):
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@functools.lru_cache(maxsize=1)
def books():
    rows = db().execute("SELECT idx, code, usfx, ro, en, he, he_tr, chapters FROM books ORDER BY idx").fetchall()
    return [dict(zip(("idx", "code", "usfx", "ro", "en", "he", "he_tr", "chapters"), r)) for r in rows]


@functools.lru_cache(maxsize=1)
def meta():
    return dict(db().execute("SELECT k, v FROM meta").fetchall())


@functools.lru_cache(maxsize=96)
def chapter(book, ch):
    """Hebrew words, Cornilescu text and the links between them, one row per verse:
    [verse, verse id, Romanian text, Romanian token offsets, packed Hebrew words, links]."""
    row = db().execute("SELECT data FROM chapters WHERE book=? AND ch=?", (book, ch)).fetchone()
    if not row:
        return None
    data = json.loads(zlib.decompress(row[0]).decode("utf-8"))
    # the Romanian text is stored once, in the verses table
    if any(not v[2] for v in data):
        texts = dict(db().execute("SELECT id, ro FROM verses WHERE book=? AND ch=?", (book, ch)).fetchall())
        for v in data:
            if not v[2]:
                v[2] = texts.get(v[1], "")
    return data


@functools.lru_cache(maxsize=1)
def has_kjv():
    try:
        return meta().get("kjv") == "1" and db().execute("SELECT 1 FROM en_chapters LIMIT 1").fetchone() is not None
    except sqlite3.Error:
        return False


@functools.lru_cache(maxsize=96)
def en_chapter(book, ch):
    """KJV for a chapter: {verse id: [text, token offsets, links, italic token indexes]}."""
    if not has_kjv():
        return {}
    row = db().execute("SELECT data FROM en_chapters WHERE book=? AND ch=?", (book, ch)).fetchone()
    if not row:
        return {}
    rows = json.loads(zlib.decompress(row[0]).decode("utf-8"))
    ids = [r[1] for r in rows]
    texts = {}
    for i in range(0, len(ids), 500):
        part = ids[i:i + 500]
        texts.update(db().execute("SELECT id, text FROM en_verses WHERE id IN (%s)" % ",".join("?" * len(part)), part))
    return {r[1]: [texts.get(r[1], ""), r[2], r[3], r[4]] for r in rows}


def version(q):
    return "kjv" if q.get("t") == "kjv" and has_kjv() else "ro"


def side_of(book, ch, vrow, ver):
    """(text, token offsets, links) of the Bible shown next to the Hebrew."""
    if ver == "kjv":
        e = en_chapter(book, ch).get(vrow[1])
        if e:
            return e[0], e[1], e[2]
        return "", [], []
    return vrow[2], vrow[3], vrow[5]


def verse_by_id(vid):
    r = db().execute("SELECT book, ch, v FROM verses WHERE id=?", (vid,)).fetchone()
    if not r:
        return None, None
    data = chapter(r[0], r[1])
    for vrow in data:
        if vrow[1] == vid:
            return (r[0], r[1], r[2]), vrow
    return (r[0], r[1], r[2]), None


def lemma_row(key):
    r = db().execute("SELECT data, freq, rank, family FROM lemmas WHERE key=?", (key,)).fetchone()
    if not r:
        return None
    d = json.loads(r[0])
    d["freq"], d["rank"], d["family_id"] = r[1], r[2], r[3]
    d.setdefault("gloss_ro", "")
    d.setdefault("en", [])
    return d


BRIEF_FIELDS = ("key", "freq", "rank", "gloss", "hebrew", "translit", "glossRo")


@functools.lru_cache(maxsize=1)
def _brief_cols():
    return "key, freq, rank, gloss, hebrew, translit, " + ("gloss_ro" if "gloss_ro" in lemma_columns() else "''")


def lemma_brief(keys):
    """Short record per word: key, frequency, rank, English gloss, Hebrew, transliteration, Romanian meaning."""
    keys = [k for k in keys if k]
    if not keys:
        return {}
    out = {}
    for i in range(0, len(keys), 500):
        chunk = keys[i:i + 500]
        q = "SELECT %s FROM lemmas WHERE key IN (%s)" % (_brief_cols(), ",".join("?" * len(chunk)))
        for r in db().execute(q, chunk):
            out[r[0]] = dict(zip(BRIEF_FIELDS, r))
    return out


def family(fid):
    if not fid:
        return None
    r = db().execute("SELECT data FROM families WHERE id=?", (fid,)).fetchone()
    if not r:
        return None
    fam = json.loads(r[0])
    brief = lemma_brief([m["key"] for m in fam["members"] if m.get("key")])
    for m in fam["members"]:
        b = brief.get(m.get("key"))
        if b:
            m["freq"], m["gloss"], m["hebrew"], m["translit"], m["glossRo"] = \
                b["freq"], b["gloss"], b["hebrew"], b["translit"], b["glossRo"]
        else:
            m["freq"] = 0
    return fam


@functools.lru_cache(maxsize=4096)
def morph_info(code):
    r = db().execute("SELECT data FROM morph WHERE code=?", (code,)).fetchone()
    return json.loads(r[0]) if r else None


@functools.lru_cache(maxsize=1)
def lemma_columns():
    return {r[1] for r in db().execute("PRAGMA table_info(lemmas)")}


@functools.lru_cache(maxsize=1)
def total_tokens():
    return db().execute("SELECT SUM(freq) FROM lemmas WHERE key NOT LIKE 'H9%'").fetchone()[0] or 1


@functools.lru_cache(maxsize=40)
def book_lemmas(book):
    out = {}
    for ch, data in db().execute("SELECT ch, data FROM chapter_lemmas WHERE book=? ORDER BY ch", (book,)):
        out[ch] = json.loads(data)
    return out


# --------------------------------------------------------------------------- references

def _book_names():
    names = {}
    for b in books():
        variants = {b["code"], b["usfx"], b["ro"], b["en"], b["he_tr"]}
        for n in variants:
            names[strip_accents(n).replace(" ", "")] = b["idx"]
    extra = {"ps": 18, "psalm": 18, "psalmi": 18, "psalmul": 18, "gn": 0, "gen": 0, "ex": 1, "exod": 1,
             "dt": 4, "deut": 4, "judecatori": 6, "jud": 6, "1imp": 10, "2imp": 11, "1regi": 10, "2regi": 11,
             "1kings": 10, "2kings": 11, "1kgs": 10, "2kgs": 11, "1sam": 8, "2sam": 9, "1chr": 12, "2chr": 13,
             "1cron": 12, "2cron": 13, "eccl": 20, "ecl": 20, "cant": 21, "cantarea": 21, "song": 21,
             "songofsolomon": 21, "is": 22, "ier": 23, "plang": 24, "plangeri": 24, "ezec": 25, "ezek": 25,
             "dan": 26, "os": 27, "ioel": 28, "joel": 28, "ob": 30, "obad": 30, "iona": 31, "jonah": 31,
             "mica": 32, "nah": 33, "hab": 34, "tef": 35, "zef": 35, "zeph": 35, "hag": 36, "zah": 37,
             "zech": 37, "mal": 38, "prov": 19, "pr": 19, "iov": 17, "est": 16, "neem": 15, "ezra": 14,
             "rut": 7, "ruth": 7, "ios": 5, "josh": 5, "num": 3, "lev": 2, "psalms": 18, "proverbs": 19}
    names.update(extra)
    return names


REF_RE = re.compile(r"^\s*([1-3]?\s*[^\d\s:.,][^\d:.,]*?)\s*(\d+)?(?:\s*[:.,]\s*(\d+))?\s*$")


def parse_ref(q):
    # References are short. Collapsing spaces and capping the length keeps the pattern from backtracking for
    # minutes on a long run of spaces (it is cubic in the number of spaces).
    q = re.sub(r"\s+", " ", q or "").strip()
    if len(q) > 40:
        return None
    m = REF_RE.match(q)
    if not m:
        return None
    name = strip_accents(m.group(1)).replace(" ", "").replace(".", "")
    names = _book_names()
    idx = names.get(name)
    if idx is None:
        cands = [v for k, v in names.items() if k.startswith(name)] if len(name) >= 2 else []
        cands = sorted(set(cands))
        if len(cands) != 1:
            return None
        idx = cands[0]
    ch = int(m.group(2)) if m.group(2) else 1
    v = int(m.group(3)) if m.group(3) else None
    b = books()[idx]
    if ch < 1 or ch > b["chapters"]:
        return None
    return {"book": idx, "ch": ch, "v": v}


# --------------------------------------------------------------------------- API handlers

HEB_RE = re.compile(r"[֐-׿]")
NIQ_RE = re.compile(r"[֑-ׇ]")


def api_info(q):
    return {"version": VERSION, "built": meta().get("built"), "aligned": meta().get("aligned") == "1",
            "kjv": has_kjv(), "userDir": USER_DIR, "tts": tts.status(), "platform": platform.system(), "wsl": is_wsl()}


def api_books(q):
    return books()


def api_chapter(q):
    """Both Bibles come back together, so switching between them needs no new request."""
    b, c = int(q["b"]), int(q["c"])
    data = chapter(b, c)
    if data is None:
        return {"error": "not found"}, 404
    en = en_chapter(b, c)
    keys = [k for k in book_lemmas(b).get(c, {}) if not k.startswith("H9")]
    brief = lemma_brief(keys)
    return {"book": b, "ch": c, "verses": data, "en": [en.get(v[1]) for v in data] if en else None,
            "chapters": books()[b]["chapters"],
            "glossRo": {k: d["glossRo"] for k, d in brief.items() if d.get("glossRo")}}


def api_lemma(q):
    key = q["k"]
    d = lemma_row(key)
    if not d:
        return {"error": "not found"}, 404
    d["family"] = family(d.get("family_id"))
    d["totalTokens"] = total_tokens()
    d["nForms"] = db().execute("SELECT COUNT(*) FROM forms WHERE lemma=?", (key,)).fetchone()[0] if _has_table("forms") else 0
    return d


@functools.lru_cache(maxsize=8)
def _has_table(name):
    return db().execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def api_morph(q):
    out = {}
    for code in (q.get("codes") or "").split(",")[:64]:
        code = code.strip()
        if code:
            out[code] = morph_info(code)
    return out


def _context_for(vid, wi, ver="ro"):
    ref, vrow = verse_by_id(vid)
    if not vrow:
        return None
    words = vrow[4]
    text, tok, links = side_of(ref[0], ref[1], vrow, ver)
    hits = sorted({links[i] for i in range(0, len(links), 3) if links[i + 1] == wi})
    return {"book": ref[0], "ch": ref[1], "v": ref[2], "t": ver, "text": text, "tok": tok, "hits": hits,
            "words": [w[0] + w[7] for w in words], "w": wi}


def api_occ(q):
    key = q["k"]
    off = num(q, "offset", 0, 0, 10 ** 7)
    lim = num(q, "limit", 25, 1, 100)
    book = q.get("book")
    ver = version(q)
    where, args = "lemma=?", [key]
    if book not in (None, ""):
        where += " AND verse IN (SELECT id FROM verses WHERE book=?)"
        args.append(int(book))
    total = db().execute(f"SELECT COUNT(*) FROM occ WHERE {where}", args).fetchone()[0]
    rows = db().execute(f"SELECT verse, w FROM occ WHERE {where} ORDER BY verse, w LIMIT ? OFFSET ?",
                        args + [lim, off]).fetchall()
    per_book = db().execute(
        "SELECT v.book, COUNT(*) FROM occ o JOIN verses v ON v.id=o.verse WHERE o.lemma=? GROUP BY v.book ORDER BY v.book",
        (key,)).fetchall()
    return {"total": total, "offset": off, "items": [c for c in (_context_for(v, w, ver) for v, w in rows) if c],
            "perBook": per_book}


def api_forms(q):
    """Every form of a word in the text, most common first, with its grammar code and first place it occurs."""
    key = q["k"]
    if not _has_table("forms"):
        return {"items": [], "total": 0}
    rows = db().execute("SELECT f.form, f.morph, f.n, v.book, v.ch, v.v, f.w FROM forms f JOIN verses v ON v.id=f.verse "
                        "WHERE f.lemma=? ORDER BY f.n DESC, f.form LIMIT 400", (key,)).fetchall()
    return {"total": sum(r[2] for r in rows),
            "items": [{"form": f, "morph": m, "n": n, "b": b, "c": c, "v": v, "w": w} for f, m, n, b, c, v, w in rows]}


def api_verse(q):
    b, c, v = int(q["b"]), int(q["c"]), int(q["v"])
    data = chapter(b, c) or []
    for row in data:
        if row[0] == v:
            return {"book": b, "ch": c, "verse": row, "en": en_chapter(b, c).get(row[1])}
    return {"error": "not found"}, 404


def api_search(q):
    text = (q.get("q") or "").strip()[:200]
    if not text:
        return {"ref": None, "lemmas": [], "verses": []}
    out = {"ref": parse_ref(text), "lemmas": [], "verses": [], "q": text}
    lim = 40
    if re.match(r"^[Hh]\d{1,4}[a-zA-Z]?$", text):
        n = int(re.sub(r"\D", "", text))
        rows = db().execute("SELECT key FROM lemmas WHERE key LIKE ? ORDER BY freq DESC LIMIT 20",
                            (f"H{n:04d}%",)).fetchall()
        out["lemmas"] = list(lemma_brief([r[0] for r in rows]).values())
    elif HEB_RE.search(text):
        cons = NIQ_RE.sub("", text)
        rows = db().execute("SELECT key FROM lemmas WHERE cons LIKE ? ESCAPE '\\' AND freq>0 ORDER BY (cons=?) DESC, freq DESC LIMIT ?",
                            (f"%{like_escape(cons)}%", cons, lim)).fetchall()
        out["lemmas"] = sorted(lemma_brief([r[0] for r in rows]).values(), key=lambda x: -(x["freq"] or 0))
    else:
        t = strip_accents(text)
        tl = t.replace("-", "").replace("'", "").replace(".", "")
        te, tle = like_escape(t), like_escape(tl)
        cols = lemma_columns()
        extra = [c for c in ("ro", "gloss_ro") if c in cols]
        clause = "".join(" OR unacc(%s) LIKE ? ESCAPE '\\'" % c for c in extra)
        args = [f"%{te}%", f"{tle}%"] + [f"%{te}%"] * len(extra) + [lim]
        rows = db().execute(
            "SELECT key FROM lemmas WHERE freq>0 AND (lower(gloss) LIKE ? ESCAPE '\\' OR replace(replace(translit,'.',''),'''','') LIKE ? ESCAPE '\\'"
            + clause + ") ORDER BY freq DESC LIMIT ?", args).fetchall()
        out["lemmas"] = sorted(lemma_brief([r[0] for r in rows]).values(), key=lambda x: -(x["freq"] or 0))
        if len(t) >= 3 and not out["ref"]:
            if version(q) == "kjv":
                vrows = db().execute("SELECT v.id, v.book, v.ch, v.v, e.text FROM en_verses e JOIN verses v ON v.id=e.id "
                                     "WHERE lower(e.text) LIKE ? ESCAPE '\\' ORDER BY v.id LIMIT 60", (f"%{te}%",)).fetchall()
            else:
                vrows = db().execute("SELECT id, book, ch, v, ro FROM verses WHERE unacc(ro) LIKE ? ESCAPE '\\' ORDER BY id LIMIT 60",
                                     (f"%{te}%",)).fetchall()
            out["verses"] = [{"book": b, "ch": c, "v": v, "text": tx} for _, b, c, v, tx in vrows]
    return out


def api_chapter_vocab(q):
    b, c = int(q["b"]), int(q["c"])
    counts = book_lemmas(b).get(c, {})
    brief = lemma_brief(list(counts.keys()))
    items = []
    for k, n in counts.items():
        if k.startswith("H9"):
            continue
        d = brief.get(k)
        if not d:
            continue
        d = dict(d)
        d["inChapter"] = n
        items.append(d)
    items.sort(key=lambda x: (-(x["freq"] or 0)))
    return {"items": items, "tokens": sum(n for k, n in counts.items() if not k.startswith("H9"))}


def api_coverage(q, body):
    known = body.get("known") if isinstance(body, dict) else None
    if not isinstance(known, list):
        raise ValueError("expected {\"known\": [...]}")
    known = {k for k in known if isinstance(k, str)}
    out_books = []
    total_known = 0
    total = 0
    for b in books():
        chs = book_lemmas(b["idx"])
        chapters = []
        btot = bkn = 0
        for ch in range(1, b["chapters"] + 1):
            c = chs.get(ch, {})
            tot = sum(n for k, n in c.items() if not k.startswith("H9"))
            kn = sum(n for k, n in c.items() if k in known)
            chapters.append([kn, tot])
            btot += tot; bkn += kn
        out_books.append({"idx": b["idx"], "known": bkn, "total": btot, "chapters": chapters})
        total += btot; total_known += bkn
    return {"known": total_known, "total": total, "books": out_books}


def api_lemma_brief(q, body):
    keys = body.get("keys") if isinstance(body, dict) else None
    if not isinstance(keys, list):
        raise ValueError("expected {\"keys\": [...]}")
    return lemma_brief([k for k in keys[:20000] if isinstance(k, str)])


def api_freqlist(q):
    lim = num(q, "limit", 200, 1, 12000)
    off = num(q, "offset", 0, 0, 10 ** 6)
    rows = db().execute("SELECT key FROM lemmas WHERE freq>0 AND rank IS NOT NULL ORDER BY rank LIMIT ? OFFSET ?",
                        (lim, off)).fetchall()
    brief = lemma_brief([r[0] for r in rows])
    return {"total": total_tokens(), "items": [brief[r[0]] for r in rows if r[0] in brief]}


def api_random_lemmas(q):
    n = num(q, "n", 12, 1, 100)
    maxrank = num(q, "maxrank", 1500, 1, 10 ** 6)
    rows = db().execute("SELECT key FROM lemmas WHERE rank IS NOT NULL AND rank<=? AND key NOT LIKE 'H9%' "
                        "ORDER BY random() LIMIT ?", (maxrank, n)).fetchall()
    return list(lemma_brief([r[0] for r in rows]).values())


@functools.lru_cache(maxsize=1)
def _morph_codes():
    if _has_table("morphs"):
        return db().execute("SELECT id, code FROM morphs").fetchall()
    return []


_LONE_SURROGATE = re.compile("[\ud800-\udfff]")


def json_text(obj):
    """JSON for files and answers. A lone surrogate (half an emoji, from a note cut in the middle of one) can't be
    written as UTF-8, so it is written as an escape; the page reads back the same text. Whole emoji are one
    character in Python and are not touched."""
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return _LONE_SURROGATE.sub(lambda m: "\\u%04x" % ord(m.group()), text)


@functools.lru_cache(maxsize=1)
def lesson_patterns():
    """The grammar-code patterns the lessons use (the `search: "..."` lines in web/js/lessons). Only these are run:
    Python's regex engine holds the whole server while it matches, so one pattern like (.*)*x could freeze the app."""
    found = set()
    for path in glob.glob(os.path.join(WEB_DIR, "js", "lessons", "*.js")):
        with open(path, encoding="utf-8") as fh:
            found.update(re.findall(r'\bsearch:\s*"([^"\\]+)"', fh.read()))
    return frozenset(found)


def api_morphsearch(q):
    pattern = q.get("re") or ""
    lim = num(q, "limit", 12, 1, 60)
    book = q.get("book")
    ver = version(q)
    if pattern not in lesson_patterns():
        return {"error": "bad pattern"}, 400
    try:
        rx = _compiled(pattern)
    except re.error:
        return {"error": "bad pattern"}, 400
    codes = _morph_codes()
    if codes:  # grammar codes are stored once; match them, then look up the words that use them
        ids = [i for i, code in codes if rx.search(code)]
        if not ids:
            return {"items": []}
        where, args = "mid IN (%s)" % ",".join("?" * len(ids)), list(ids)
    else:
        where, args = "regexp(?, morph)", [pattern]
    if book not in (None, ""):
        where += " AND verse IN (SELECT id FROM verses WHERE book=?)"
        args.append(int(book))
    rows = db().execute(f"SELECT verse, w FROM occ WHERE {where} ORDER BY random() LIMIT ?", args + [lim]).fetchall()
    rows = sorted(rows)
    return {"items": [c for c in (_context_for(v, w, ver) for v, w in rows) if c]}


# --------------------------------------------------------------------------- word decks

DECKS = ("top100", "top500", "top1000", "top2000", "freq10", "names")


def api_deck(q):
    """Ready-made lists of words to learn, most useful first."""
    d = q.get("id") or ""
    if d.startswith("top") and d[3:].isdigit():
        n = max(1, min(int(d[3:]), 5000))
        rows = db().execute("SELECT key FROM lemmas WHERE freq>0 AND rank IS NOT NULL AND key NOT LIKE 'H9%' "
                            "ORDER BY rank LIMIT ?", (n,)).fetchall()
        keys = [r[0] for r in rows]
    elif d == "freq10":
        rows = db().execute("SELECT key FROM lemmas WHERE freq>=10 AND key NOT LIKE 'H9%' "
                            "AND json_extract(data, '$.morph') NOT LIKE 'N:%' ORDER BY freq DESC").fetchall()
        keys = [r[0] for r in rows]
    elif d == "names":
        rows = db().execute("SELECT key FROM lemmas WHERE freq>=2 AND key NOT LIKE 'H9%' "
                            "AND json_extract(data, '$.morph') LIKE 'N:%' ORDER BY freq DESC").fetchall()
        keys = [r[0] for r in rows]
    elif d.startswith("book:"):
        b = int(d[5:])
        counts = collections.Counter()
        for c in book_lemmas(b).values():
            counts.update(c)
        keys = [k for k, _ in counts.most_common() if not k.startswith("H9")]
    elif d.startswith("chapter:"):
        b, c = (int(x) for x in d[8:].split("."))
        counts = collections.Counter(book_lemmas(b).get(c, {}))
        keys = [k for k, _ in counts.most_common() if not k.startswith("H9")]
    else:
        raise ValueError("unknown deck")
    brief = lemma_brief(keys)
    return {"id": d, "items": [brief[k] for k in keys if k in brief]}


# --------------------------------------------------------------------------- audio download

# Same marks the app strips before asking for audio (hebrew.js stripCantillation), so cached files match exactly.
_JS_CANT = re.compile("[֑-ֽֿ֯׀׃-׆]")
ADONAI, ELOHIM, YAHWEH = "אֲדֹנָי", "אֱלֹהִים", "יַהְוֶה"


def speak_lemma(hebrew, key, divine):
    # mirrors speakableLemma() in hebrew.js
    if key.startswith("H3068") and divine == "adonai":
        return ADONAI
    if key.startswith("H3069") and divine == "adonai":
        return ELOHIM
    if key.startswith(("H3068", "H3069")) and divine == "yahweh":
        return YAHWEH
    return _JS_CANT.sub("", hebrew or "")


def speak_word(p, divine):
    # mirrors speakableWord() in hebrew.js
    tags = p[3].split("/")
    parts = []
    for i, m in enumerate(p[0].split("/")):
        tag = tags[i] if i < len(tags) else ""
        if tag.startswith("H3068") and divine in ("adonai", "yahweh"):
            m = ADONAI if divine == "adonai" else YAHWEH
        elif tag.startswith("H3069") and divine in ("adonai", "yahweh"):
            m = ELOHIM if divine == "adonai" else YAHWEH
        parts.append(m)
    return _JS_CANT.sub("", "".join(parts))


def speak_verse(words, divine):
    # mirrors verseSpeakable() in hebrew.js
    out = [speak_word(p, divine) for p in words if not (len(p) > 8 and (p[8] or {}).get("x") == "X")]
    return re.sub(r"\s+", " ", " ".join(out)).strip()


_prefetch_lock = threading.Lock()
_prefetch = {"running": False, "scope": "", "done": 0, "failed": 0, "total": 0, "cancel": False,
             "error": "", "started": 0.0, "finished": 0.0}


def _prefetch_texts(scope, book, divine):
    texts = []
    if scope == "words":
        for key, heb in db().execute("SELECT key, hebrew FROM lemmas WHERE freq>0 AND key NOT LIKE 'H9%' ORDER BY rank"):
            texts.append(speak_lemma(heb, key, divine))
    elif scope == "forms":
        for lemma, form in db().execute("SELECT lemma, form FROM forms ORDER BY n DESC"):
            if lemma.startswith(("H3068", "H3069")):
                continue  # the Divine Name is swapped in by the app; these few are fetched when first played
            texts.append(form)
    elif scope == "book":
        b = int(book)
        for ch in range(1, books()[b]["chapters"] + 1):
            for vrow in chapter(b, ch) or []:
                texts.append(speak_verse(vrow[4], divine))
    seen, out = set(), []
    for t in texts:
        t = t.strip()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _run_prefetch(texts, voice, rates):
    from concurrent.futures import ThreadPoolExecutor

    def one(job):
        if _prefetch["cancel"]:
            return
        text, rate = job
        _path, err = tts.synthesize(text, voice, rate, AUDIO_DIR)
        with _prefetch_lock:
            if err:
                _prefetch["failed"] += 1
                _prefetch["error"] = err
            else:
                _prefetch["done"] += 1
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(one, [(t, r) for t in texts for r in rates]))
    finally:
        with _prefetch_lock:
            _prefetch["running"] = False
            _prefetch["finished"] = time.time()


def api_audio_prefetch(q, body):
    body = body if isinstance(body, dict) else {}
    if not tts.available():
        return {"error": "edge-tts is not installed"}, 409
    scope = body.get("scope")
    if scope not in ("words", "forms", "book"):
        raise ValueError("scope must be words, forms or book")
    voice = body.get("voice") if body.get("voice") in tts.VOICES else "he-IL-AvriNeural"
    divine = body.get("divineName") if body.get("divineName") in ("adonai", "yahweh", "as-written") else "adonai"
    rates = ["+0%"]
    slow = body.get("slowRate")
    if body.get("slow") and isinstance(slow, str) and re.fullmatch(r"[+-][0-9]{1,2}%", slow):
        rates.append(slow)
    book = 0
    if scope == "book":
        try:
            book = int(body.get("book", 0))
        except (TypeError, ValueError):
            raise ValueError("book must be a number")
        if not 0 <= book < len(books()):
            raise ValueError("no such book")
    # Check and claim in one step, so a double click can't start two downloads that share one progress counter.
    with _prefetch_lock:
        if _prefetch["running"]:
            return {"error": "already running", "status": dict(_prefetch)}, 409
        _prefetch.update(running=True, scope=scope if scope != "book" else "book:%d" % book,
                         done=0, failed=0, total=0, cancel=False, error="", started=time.time(), finished=0.0)
    try:
        texts = _prefetch_texts(scope, book, divine)
    except Exception:
        with _prefetch_lock:
            _prefetch.update(running=False, finished=time.time())
        raise
    with _prefetch_lock:
        _prefetch["total"] = len(texts) * len(rates)
    threading.Thread(target=_run_prefetch, args=(texts, voice, rates), daemon=True).start()
    with _prefetch_lock:
        return dict(_prefetch)


def api_audio_status(q):
    with _prefetch_lock:
        st = dict(_prefetch)
    st["available"] = tts.available()
    if q.get("cache"):
        files = size = 0
        for root, _dirs, names in os.walk(AUDIO_DIR):
            for n in names:
                if n.endswith(".mp3"):
                    files += 1
                    try:
                        size += os.path.getsize(os.path.join(root, n))
                    except OSError:
                        pass
        st["cacheFiles"], st["cacheBytes"] = files, size
    return st


def api_audio_cancel(q, body):
    with _prefetch_lock:
        _prefetch["cancel"] = True
    return {"ok": True}


RESTORE_POINTS_KEPT = 10


def api_restore_point(q, body):
    """Copies userdata.json to backups/restore-point-<time>.json before something replaces it
    (restoring a backup, deleting all progress). The daily backups alone could lose a whole day of study."""
    with _save_lock:
        if not os.path.exists(USER_FILE):
            return {"ok": True, "file": ""}
        os.makedirs(BACKUP_DIR, exist_ok=True)
        name = "restore-point-%s.json" % time.strftime("%Y%m%d-%H%M%S")
        shutil.copy2(USER_FILE, os.path.join(BACKUP_DIR, name))
        old = sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith("restore-point-"))
        for f in old[:-RESTORE_POINTS_KEPT]:
            try:
                os.remove(os.path.join(BACKUP_DIR, f))
            except OSError:
                pass
    return {"ok": True, "file": name}


def api_start_token(q, body):
    """A one-time start link for a second start of Mikra, which opens the browser on this running copy."""
    return {"t": new_start_token()}


def api_audio_clear(q, body):
    with _prefetch_lock:
        if _prefetch["running"]:
            return {"error": "a download is running"}, 409
    shutil.rmtree(AUDIO_DIR, ignore_errors=True)
    return {"ok": True}


def api_audio_counts(q):
    words = db().execute("SELECT COUNT(DISTINCT hebrew) FROM lemmas WHERE freq>0 AND key NOT LIKE 'H9%'").fetchone()[0]
    forms = db().execute("SELECT COUNT(DISTINCT form) FROM forms").fetchone()[0] if _has_table("forms") else 0
    per_book = dict(db().execute("SELECT book, COUNT(*) FROM verses GROUP BY book").fetchall())
    return {"words": words, "forms": forms, "verses": [per_book.get(b["idx"], 0) for b in books()]}


def api_tts(q):
    text = q.get("text") or ""
    voice = q.get("voice") or "he-IL-AvriNeural"
    rate = q.get("rate") or "+0%"
    path, err = tts.synthesize(text, voice, rate, AUDIO_DIR)
    if err:
        return {"error": err}, 503
    return ("file", path, "audio/mpeg")


def read_userdata():
    """The saved progress. A file that can't be read right now (too many open files, say) raises, so the page gets
    an error instead of an empty start: a save made from that empty start would replace the real file."""
    try:
        with open(USER_FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return {}
    except ValueError:
        # Damaged file: move it aside once and start clean. (Copying it left a new copy on every page load.)
        with _save_lock:
            try:
                with open(USER_FILE, encoding="utf-8") as fh:
                    return json.load(fh)  # a save replaced it in the meantime
            except FileNotFoundError:
                return {}
            except ValueError:
                pass
            os.replace(USER_FILE, USER_FILE + ".broken-" + time.strftime("%Y%m%d-%H%M%S"))
        return {}


_save_lock = threading.Lock()
_rev_cache = {"stat": None, "rev": 0}


def _file_stat():
    try:
        st = os.stat(USER_FILE)
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def current_rev():
    """Revision number stored in userdata.json. Every save bumps it, so a window holding old data
    (a second tab, or a second copy of the app) can't silently overwrite newer progress."""
    st = _file_stat()
    if st is None:
        return 0
    if _rev_cache["stat"] == st:
        return _rev_cache["rev"]
    try:
        with open(USER_FILE, encoding="utf-8") as fh:
            rev = json.load(fh).get("_rev", 0)
        rev = rev if isinstance(rev, int) and rev >= 0 else 0
    except FileNotFoundError:
        rev = 0
    except (ValueError, AttributeError):
        rev = 0  # damaged: a save may replace it (the daily backup keeps the old file)
    # any other OSError: the save fails with an error instead of replacing a file it couldn't read
    _rev_cache.update(stat=st, rev=rev)
    return rev


def write_userdata(data):
    """Returns (new_rev, None) on success or (None, current_rev) when the sender's copy is out of date."""
    with _save_lock:
        base = data.pop("_baseRev", None)
        rev = current_rev()
        if base is not None and base != rev:
            return None, rev
        os.makedirs(USER_DIR, exist_ok=True)
        os.makedirs(BACKUP_DIR, exist_ok=True)
        # one backup per day, keep the last 14
        today = time.strftime("%Y-%m-%d")
        bpath = os.path.join(BACKUP_DIR, f"userdata-{today}.json")
        if os.path.exists(USER_FILE) and not os.path.exists(bpath):
            shutil.copy2(USER_FILE, bpath)
            old = sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith("userdata-"))
            for f in old[:-14]:
                try:
                    os.remove(os.path.join(BACKUP_DIR, f))
                except OSError:
                    pass
        data["_rev"] = rev + 1
        tmp = USER_FILE + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write(json_text(data))
                fh.flush()
                os.fsync(fh.fileno())  # so a crash or power cut can't leave an empty file behind
            os.replace(tmp, USER_FILE)
        except BaseException:
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise
        _rev_cache.update(stat=_file_stat(), rev=rev + 1)
        return rev + 1, None


GET_ROUTES = {
    "/api/info": api_info,
    "/api/books": api_books,
    "/api/chapter": api_chapter,
    "/api/lemma": api_lemma,
    "/api/morph": api_morph,
    "/api/occ": api_occ,
    "/api/verse": api_verse,
    "/api/search": api_search,
    "/api/chapter_vocab": api_chapter_vocab,
    "/api/freqlist": api_freqlist,
    "/api/random_lemmas": api_random_lemmas,
    "/api/morphsearch": api_morphsearch,
    "/api/forms": api_forms,
    "/api/deck": api_deck,
    "/api/audio/status": api_audio_status,
    "/api/audio/counts": api_audio_counts,
    "/api/tts": api_tts,
}

POST_ROUTES = {
    "/api/coverage": api_coverage,
    "/api/lemma_brief": api_lemma_brief,
    "/api/audio/prefetch": api_audio_prefetch,
    "/api/audio/cancel": api_audio_cancel,
    "/api/audio/clear": api_audio_clear,
    "/api/restore_point": api_restore_point,
    "/api/start_token": api_start_token,
}

MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".mp3": "audio/mpeg", ".txt": "text/plain; charset=utf-8",
}


def static_path(url_path):
    """Maps a URL path to a file inside web/, or None. Decodes %xx, follows symlinks, refuses anything outside web/."""
    rel = urllib.parse.unquote(url_path).lstrip("/\\") or "index.html"
    if "\x00" in rel:
        return None
    full = os.path.realpath(os.path.join(WEB_DIR, rel))
    try:
        if os.path.commonpath([WEB_DIR, full]) != WEB_DIR:
            return None
    except ValueError:  # different drive on Windows
        return None
    return full if os.path.isfile(full) else None


def _is_local_name(name):
    if name.lower() == "localhost":
        return True
    try:
        ipaddress.ip_address(name)
        return True
    except ValueError:
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = "Mikra/" + VERSION

    def log_message(self, fmt, *args):  # quiet
        if os.environ.get("MIKRA_DEBUG") or os.environ.get("HEBREW_READER_DEBUG"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        super().end_headers()

    def _send_json(self, obj, status=200):
        body = json_text(obj).encode("utf-8")
        gz = "gzip" in (self.headers.get("Accept-Encoding") or "") and len(body) > 4096
        if gz:
            import gzip
            body = gzip.compress(body, 5)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, ctype=None, cache=True):
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            self.send_error(404)
            return
        ext = os.path.splitext(path)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", ctype or MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=86400" if (cache and ext in (".woff2", ".mp3")) else "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _host_ok(self):
        # Only answer requests addressed to this machine by IP or "localhost". A web page that points its own
        # domain at 127.0.0.1 (DNS rebinding) sends its domain name here and is refused.
        host = (self.headers.get("Host") or "").strip()
        if not host:
            return True
        if host.startswith("["):
            name = host[1:host.find("]")] if "]" in host else ""
        else:
            name = host.rsplit(":", 1)[0] if host.count(":") == 1 else host
        return _is_local_name(name)

    def _same_origin(self):
        # Browsers label every request with where it came from. Only this app's own page may use the API;
        # without this, any website open in the same browser could overwrite your saved progress.
        site = self.headers.get("Sec-Fetch-Site")
        if site and site not in ("same-origin", "none"):
            return False
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        host = self.headers.get("Host") or ""
        return bool(host) and origin == "http://" + host

    def _key_ok(self):
        if not KEY:
            return True
        want = cookie_name(self.server.server_address[1])
        for part in (self.headers.get("Cookie") or "").split(";"):
            name, _, value = part.partition("=")
            if name.strip() == want and hmac.compare_digest(value.strip().encode("utf-8"), KEY.encode("ascii")):
                return True
        return False

    def _start(self, q):
        # The launcher opens this address with a one-time token (or you open the printed link with the key); the
        # window gets the key as a cookie the API checks from then on. A used or wrong token still goes to the
        # app, which then explains how to open Mikra (a browser that restores its old tabs reopens this address).
        t = q.get("t") or ""
        ok = bool(KEY) and (hmac.compare_digest(t.encode("utf-8"), KEY.encode("ascii")) or use_start_token(t))
        self.send_response(302)
        self.send_header("Location", "/")
        if ok:
            self.send_header("Set-Cookie", "%s=%s; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict"
                             % (cookie_name(self.server.server_address[1]), KEY))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _ping(self, q):
        # A second start of Mikra asks whether this server has the same key, without sending the key: something
        # else could be listening on the port. The answer proves the key without revealing it.
        nonce = q.get("n") or ""
        if not KEY or not re.fullmatch(r"[0-9a-f]{32}", nonce):
            self.send_error(400)
            return
        self._send_json({"proof": key_proof(nonce)})

    def do_GET(self):
        if not self._host_ok():
            self.send_error(403)
            return
        url = urllib.parse.urlparse(self.path)
        path = url.path
        if path.startswith("/api/") and not self._same_origin():
            self.send_error(403)
            return
        q = {k: v[-1] for k, v in urllib.parse.parse_qs(url.query).items()}
        if path == "/__start":
            self._start(q)
            return
        if path == "/__ping":
            self._ping(q)
            return
        if path.startswith("/api/") and not self._key_ok():
            self._send_json({"error": "no key"}, 403)
            return
        try:
            if path == "/api/userdata":
                self._send_json(read_userdata())
                return
            if path in GET_ROUTES:
                res = GET_ROUTES[path](q)
                if isinstance(res, tuple) and res and res[0] == "file":
                    self._send_file(res[1], res[2])
                    return
                status = 200
                if isinstance(res, tuple):
                    res, status = res
                self._send_json(res, status)
                return
            if path.startswith("/api/"):
                self._send_json({"error": "unknown endpoint"}, 404)
                return
            full = static_path(path)
            if full is None:
                self.send_error(404)
                return
            self._send_file(full)
        except (KeyError, ValueError, OverflowError) as e:
            self._send_json({"error": "bad request: %s" % e}, 400)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc()
            try:
                self._send_json({"error": "server error"}, 500)
            except Exception:
                pass

    def do_PUT(self):
        self.do_POST()

    def do_POST(self):
        if not self._host_ok() or not self._same_origin():
            self.send_error(403)
            return
        if not self._key_ok():
            self._send_json({"error": "no key"}, 403)
            return
        # Requiring JSON also means a cross-site page would need a CORS preflight, which this server never grants.
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            self.send_error(415)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length < 0:
            self.send_error(400)
            return
        if length > MAX_BODY:
            self.send_error(413)
            return
        url = urllib.parse.urlparse(self.path)
        try:
            raw = self.rfile.read(length) if length else b""
            body = json.loads(raw.decode("utf-8")) if raw else None
            if url.path == "/api/userdata":
                if not isinstance(body, dict):
                    self._send_json({"error": "expected an object"}, 400)
                    return
                rev, conflict = write_userdata(body)
                if rev is None:
                    self._send_json({"error": "conflict", "rev": conflict}, 409)
                    return
                self._send_json({"ok": True, "saved": time.strftime("%H:%M:%S"), "rev": rev})
                return
            if url.path in POST_ROUTES:
                res = POST_ROUTES[url.path]({}, body)
                status = 200
                if isinstance(res, tuple):
                    res, status = res
                self._send_json(res, status)
                return
            self._send_json({"error": "unknown endpoint"}, 404)
        except (ValueError, KeyError, OverflowError) as e:
            self._send_json({"error": "bad request: %s" % e}, 400)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc()
            try:
                self._send_json({"error": "server error"}, 500)
            except Exception:
                pass


# --------------------------------------------------------------------------- browser launch

def running_instance(port):
    """What already serves this port: "ours" (a Mikra that proved it has this data folder's key), "old" (a Mikra
    from before 2.2.1, which has no key), or None (nothing, something else, or a Mikra with another data folder;
    then this one starts on the next free port, since it saves to a different file). The key is never sent to a
    server that hasn't proved it has it."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    nonce = secrets.token_hex(16)
    try:
        with opener.open("http://127.0.0.1:%d/__ping?n=%s" % (port, nonce), timeout=1.5) as r:
            proof = json.loads(r.read(4096).decode("utf-8")).get("proof")
        ok = KEY and isinstance(proof, str) and hmac.compare_digest(proof.encode("utf-8"), key_proof(nonce).encode("ascii"))
        return "ours" if ok else None
    except urllib.error.HTTPError as e:
        server = e.headers.get("Server") or ""
        if e.code == 404 and server.startswith(("Mikra/", "HebrewReader/")) and not takes_key(server):
            return "old"
        return None
    except Exception:
        return None


def running_start_token(port):
    """A one-time start link from the running copy (it proved it has the key, so the key can be sent to it)."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request("http://127.0.0.1:%d/api/start_token" % port, data=b"{}", method="POST",
                                 headers={"Content-Type": "application/json", "Cookie": "%s=%s" % (cookie_name(port), KEY)})
    try:
        with opener.open(req, timeout=1.5) as r:
            t = json.loads(r.read(4096).decode("utf-8")).get("t")
        return t if isinstance(t, str) and re.fullmatch(r"[0-9a-f]{32}", t) else None
    except Exception:
        return None


def takes_key(server):
    """Whether that Mikra knows /__start (2.2.1 and later)."""
    try:
        name, ver = server.split()[0].split("/", 1)
        return name == "Mikra" and tuple(int(x) for x in ver.split(".")[:3]) >= (2, 2, 1)
    except ValueError:
        return False


def find_free_port(preferred, host="127.0.0.1"):
    for port in [preferred] + list(range(preferred + 1, preferred + 40)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if os.name != "nt":
                # ignore sockets left in TIME_WAIT by a previous run (Linux/macOS semantics)
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, port))
                return port
            except OSError:
                continue
    return 0


def _spawn(cmd):
    try:
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                         start_new_session=(os.name != "nt"))
        return True
    except OSError:
        return False


def open_app(url, mode):
    """mode: auto (app window if a Chromium-type browser exists, else default browser), app, browser, none"""
    if mode == "none":
        return
    if is_wsl():
        edge_paths = ["/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
                      "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"]
        if mode in ("auto", "app"):
            for p in edge_paths:
                if os.path.exists(p) and _spawn([p, "--app=" + url]):
                    return
        for cmd in (["wslview", url], ["cmd.exe", "/c", "start", "", url], ["explorer.exe", url]):
            if shutil.which(cmd[0]) and _spawn(cmd):
                return
        webbrowser.open(url)
        return
    if os.name == "nt":
        if mode in ("auto", "app"):
            cands = [os.path.join(os.environ.get(v, ""), r"Microsoft\Edge\Application\msedge.exe")
                     for v in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
            cands += [os.path.join(os.environ.get(v, ""), r"Google\Chrome\Application\chrome.exe")
                      for v in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA")]
            for p in cands:
                if os.path.isfile(p) and _spawn([p, "--app=" + url]):
                    return
        webbrowser.open(url)
        return
    # Linux / macOS
    if mode in ("auto", "app"):
        for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser",
                     "microsoft-edge", "microsoft-edge-stable", "vivaldi-stable"):
            exe = shutil.which(name)
            if exe and _spawn([exe, "--app=" + url]):
                return
        # Flatpak browsers (common on Fedora)
        if shutil.which("flatpak"):
            for app_id in ("com.google.Chrome", "org.chromium.Chromium", "com.brave.Browser", "com.microsoft.Edge"):
                r = subprocess.run(["flatpak", "info", app_id], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if r.returncode == 0 and _spawn(["flatpak", "run", app_id, "--app=" + url]):
                    return
    if shutil.which("xdg-open") and _spawn(["xdg-open", url]):
        return
    webbrowser.open(url)


def main():
    ap = argparse.ArgumentParser(description="Mikra")
    env_port = os.environ.get("MIKRA_PORT") or os.environ.get("HEBREW_READER_PORT") or "8723"
    ap.add_argument("--port", type=int, default=int(env_port) if env_port.isdigit() else 8723)
    ap.add_argument("--no-browser", action="store_true", help="do not open a window")
    ap.add_argument("--host", default="127.0.0.1", help="address to listen on (default 127.0.0.1, only this computer)")
    ap.add_argument("--window", choices=["auto", "app", "browser", "none"], default="auto",
                    help="auto: app window when Chrome/Edge/Chromium is installed, otherwise your default browser")
    args = ap.parse_args()

    if not os.path.exists(DB_PATH):
        print("The database is missing: %s" % DB_PATH)
        print("Build it with:  python build/build_db.py")
        sys.exit(1)
    os.makedirs(USER_DIR, exist_ok=True)
    global KEY
    KEY = load_key()
    running = running_instance(args.port)
    if running:
        # A second server would save to the same file as the first one; open the running copy instead.
        if running == "ours":
            print("Mikra is already running. Open it at %s" % start_url(args.port))
            launch = start_url(args.port, running_start_token(args.port) or KEY)
        else:
            launch = "http://localhost:%d/" % args.port
            print("Mikra is already running. Open it at %s" % launch)
        if not args.no_browser:
            open_app(launch, args.window)
        return
    port = find_free_port(args.port, args.host)
    if not port:
        print("No free port found near %d" % args.port)
        sys.exit(1)
    class Server(ThreadingHTTPServer):
        daemon_threads = True
        allow_reuse_address = os.name != "nt"  # on Windows this flag would let two servers share a port

    httpd = Server((args.host, port), Handler)
    print("Mikra is running. Open it at %s" % start_url(port))
    if not lesson_patterns():
        print("Warning: no lesson patterns found in web/js/lessons, so \"Find it in the Bible\" in Grammar won't work.")
    if args.host not in ("127.0.0.1", "localhost"):
        print("Warning: listening on %s. Other devices on your network can use Mikra with the link above (put this"
              " computer's address in place of localhost). The connection is not encrypted, so only do this on a"
              " network you trust." % args.host)
    print("Your progress is saved in %s" % USER_DIR)
    st = tts.status()
    print("Audio: %s" % st["message"])
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.6, open_app, args=(start_url(port, new_start_token()), args.window)).start()
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
