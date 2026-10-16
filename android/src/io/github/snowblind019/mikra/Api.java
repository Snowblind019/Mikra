package io.github.snowblind019.mikra;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/**
 * The app's API, ported line by line from app/server.py so the phone app answers exactly like the desktop one.
 * Keep the two in step: a change to an endpoint in server.py belongs here too.
 */
final class Api {
    static final String VERSION = "2.4.0";
    // userdata.json is a few MB at most. Lower than the desktop's 64 MB: the phone holds the body, its text and the parsed
    // data in memory at the same time.
    static final long MAX_BODY = 24L * 1024 * 1024;

    /** A request the app should not have sent: answered with 400, like KeyError/ValueError in server.py. */
    static final class BadRequest extends RuntimeException {
        BadRequest(String msg) { super(msg); }
    }

    /** What an endpoint returns: JSON with a status, or a file. */
    static final class Result {
        final int status;
        final Object json;
        final File file;
        final String mime;
        Result(int status, Object json) { this.status = status; this.json = json; this.file = null; this.mime = null; }
        Result(File file, String mime) { this.status = 200; this.json = null; this.file = file; this.mime = mime; }
    }

    private final Db db;
    private final Speech speech;
    private final String platform;
    final File userDir, userFile, backupDir;

    Api(Db db, Speech speech, File userDir, String platform) {
        this(db, speech, userDir, new File(userDir, "backups"), platform);
    }

    /** backupDir: on the phone the backups live outside the folder Android copies to the cloud (it has a size limit). */
    Api(Db db, Speech speech, File userDir, File backupDir, String platform) {
        this.db = db;
        this.speech = speech;
        this.platform = platform;
        this.userDir = userDir;
        this.userFile = new File(userDir, "userdata.json");
        this.backupDir = backupDir;
    }

    // ================================================================== database helpers

    private List<Object[]> q(String sql, Object... args) { return db.query(sql, args); }

    private Object one(String sql, Object... args) {
        List<Object[]> r = db.query(sql, args);
        return r.isEmpty() ? null : r.get(0)[0];
    }

    static long asLong(Object o) {
        if (o instanceof Number) return ((Number) o).longValue();
        if (o == null) return 0;
        try { return Long.parseLong(o.toString().trim()); } catch (NumberFormatException e) { return 0; }
    }

    private static boolean truthy(Object o) {
        if (o == null) return false;
        if (o instanceof String) return !((String) o).isEmpty();
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) return ((Number) o).doubleValue() != 0;
        if (o instanceof List) return !((List<?>) o).isEmpty();
        if (o instanceof Map) return !((Map<?, ?>) o).isEmpty();
        return true;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> L(Object o) { return (List<Object>) o; }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> M(Object o) { return (Map<String, Object>) o; }

    private static String placeholders(int n) {
        StringBuilder b = new StringBuilder(n * 2);
        for (int i = 0; i < n; i++) { if (i > 0) b.append(','); b.append('?'); }
        return b.toString();
    }

    /** Accent-free lower case, like strip_accents() in server.py (ș becomes s, ă becomes a). */
    static String stripAccents(String s) {
        String n = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD);
        StringBuilder b = new StringBuilder(n.length());
        for (int i = 0; i < n.length(); ) {
            int cp = n.codePointAt(i);
            i += Character.charCount(cp);
            int t = Character.getType(cp);
            if (t != Character.NON_SPACING_MARK && t != Character.ENCLOSING_MARK && t != Character.COMBINING_SPACING_MARK) b.appendCodePoint(cp);
        }
        return b.toString().toLowerCase(Locale.ROOT);
    }

    /** SQLite's LIKE ignores case only for A to Z. */
    private static String asciiLower(String s) {
        if (s == null) return null;
        char[] c = s.toCharArray();
        for (int i = 0; i < c.length; i++) if (c[i] >= 'A' && c[i] <= 'Z') c[i] = (char) (c[i] + 32);
        return new String(c);
    }

    static String inflate(byte[] data) {
        Inflater inf = new Inflater();
        try {
            inf.setInput(data);
            ByteArrayOutputStream out = new ByteArrayOutputStream(data.length * 4);
            byte[] buf = new byte[16384];
            while (!inf.finished()) {
                int n = inf.inflate(buf);
                if (n == 0 && (inf.needsInput() || inf.needsDictionary())) break;
                out.write(buf, 0, n);
            }
            return new String(out.toByteArray(), "UTF-8");
        } catch (DataFormatException e) {
            throw new IllegalStateException("bad chapter data", e);
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        } finally {
            inf.end();
        }
    }

    /** A small least-recently-used cache, like functools.lru_cache. */
    private static final class Lru<K, V> extends LinkedHashMap<K, V> {
        private final int max;
        Lru(int max) { super(16, 0.75f, true); this.max = max; }
        @Override protected boolean removeEldestEntry(Map.Entry<K, V> e) { return size() > max; }
    }

    private static String param(Map<String, String> q, String name) {
        String v = q.get(name);
        if (v == null) throw new BadRequest("'" + name + "'");
        return v;
    }

    private static int intOf(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            throw new BadRequest("invalid literal for int() with base 10: '" + s + "'");
        }
    }

    /** Integer query parameter, clamped (a negative LIMIT in SQLite means no limit). */
    private static long num(Map<String, String> q, String name, long def, long lo, long hi) {
        String raw = q.get(name);
        if (raw == null || raw.isEmpty()) return def;
        long v;
        try {
            v = Long.parseLong(raw.trim());
        } catch (NumberFormatException e) {
            if (raw.trim().matches("[+-]?[0-9]+")) v = raw.trim().startsWith("-") ? Long.MIN_VALUE : Long.MAX_VALUE;
            else throw new BadRequest(name + " must be a whole number");
        }
        return Math.max(lo, Math.min(hi, v));
    }

    private static boolean isBlank(String s) { return s == null || s.isEmpty(); }

    // ================================================================== cached tables

    private List<Map<String, Object>> books;
    private Map<String, String> meta;
    private Boolean hasKjv;
    private Set<String> lemmaColumns;
    private Long totalTokens;
    private final Map<String, Boolean> hasTable = new HashMap<String, Boolean>();
    private final Lru<Long, List<Object>> chapterCache = new Lru<Long, List<Object>>(96);
    private final Lru<Long, Map<Long, List<Object>>> enCache = new Lru<Long, Map<Long, List<Object>>>(96);
    private final Lru<Long, Map<Long, Map<String, Object>>> bookLemmaCache = new Lru<Long, Map<Long, Map<String, Object>>>(40);
    private final Lru<String, Object> morphCache = new Lru<String, Object>(4096);
    private List<Object[]> morphCodes;
    private Map<String, Integer> bookNames;

    synchronized List<Map<String, Object>> books() {
        if (books == null) {
            String[] cols = {"idx", "code", "usfx", "ro", "en", "he", "he_tr", "chapters"};
            List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
            for (Object[] r : q("SELECT idx, code, usfx, ro, en, he, he_tr, chapters FROM books ORDER BY idx")) {
                Map<String, Object> m = new LinkedHashMap<String, Object>();
                for (int i = 0; i < cols.length; i++) m.put(cols[i], r[i]);
                out.add(m);
            }
            books = Collections.unmodifiableList(out);
        }
        return books;
    }

    synchronized Map<String, String> meta() {
        if (meta == null) {
            Map<String, String> m = new HashMap<String, String>();
            for (Object[] r : q("SELECT k, v FROM meta")) m.put(String.valueOf(r[0]), r[1] == null ? null : String.valueOf(r[1]));
            meta = m;
        }
        return meta;
    }

    private Map<String, Object> book(long idx) {
        List<Map<String, Object>> b = books();
        if (idx < 0 || idx >= b.size()) throw new BadRequest("no such book");
        return b.get((int) idx);
    }

    /** A cache key that is different for every (book, chapter) pair. */
    private static Long chapterKey(long book, long ch) {
        return (book << 32) ^ (ch & 0xFFFFFFFFL);
    }

    /** Hebrew words, Cornilescu text and the links between them, one row per verse. */
    List<Object> chapter(long book, long ch) {
        Long key = chapterKey(book, ch);
        synchronized (chapterCache) {
            List<Object> c = chapterCache.get(key);
            if (c != null) return c;
        }
        List<Object[]> rows = q("SELECT data FROM chapters WHERE book=? AND ch=?", book, ch);
        if (rows.isEmpty()) return null;
        List<Object> data = L(Json.parse(inflate((byte[]) rows.get(0)[0])));
        boolean missing = false;
        for (Object v : data) if (!truthy(L(v).get(2))) missing = true;
        // the Romanian text is stored once, in the verses table
        if (missing) {
            Map<Long, String> texts = new HashMap<Long, String>();
            for (Object[] r : q("SELECT id, ro FROM verses WHERE book=? AND ch=?", book, ch)) texts.put(asLong(r[0]), (String) r[1]);
            for (Object v : data) {
                List<Object> row = L(v);
                if (!truthy(row.get(2))) {
                    String t = texts.get(asLong(row.get(1)));
                    row.set(2, t == null ? "" : t);
                }
            }
        }
        synchronized (chapterCache) { chapterCache.put(key, data); }
        return data;
    }

    synchronized boolean hasKjv() {
        if (hasKjv == null) {
            boolean ok;
            try {
                ok = "1".equals(meta().get("kjv")) && !q("SELECT 1 FROM en_chapters LIMIT 1").isEmpty();
            } catch (RuntimeException e) {
                ok = false;
            }
            hasKjv = ok;
        }
        return hasKjv;
    }

    /** KJV for a chapter: {verse id: [text, token offsets, links, italic token indexes]}. */
    Map<Long, List<Object>> enChapter(long book, long ch) {
        if (!hasKjv()) return Collections.emptyMap();
        Long key = chapterKey(book, ch);
        synchronized (enCache) {
            Map<Long, List<Object>> c = enCache.get(key);
            if (c != null) return c;
        }
        List<Object[]> blob = q("SELECT data FROM en_chapters WHERE book=? AND ch=?", book, ch);
        if (blob.isEmpty()) return Collections.emptyMap();
        List<Object> rows = L(Json.parse(inflate((byte[]) blob.get(0)[0])));
        List<Object> ids = new ArrayList<Object>();
        for (Object r : rows) ids.add(L(r).get(1));
        Map<Long, String> texts = new HashMap<Long, String>();
        for (int i = 0; i < ids.size(); i += 500) {
            List<Object> part = ids.subList(i, Math.min(ids.size(), i + 500));
            for (Object[] r : q("SELECT id, text FROM en_verses WHERE id IN (" + placeholders(part.size()) + ")", part.toArray()))
                texts.put(asLong(r[0]), (String) r[1]);
        }
        Map<Long, List<Object>> out = new LinkedHashMap<Long, List<Object>>();
        for (Object o : rows) {
            List<Object> r = L(o);
            Long id = asLong(r.get(1));
            String t = texts.get(id);
            out.put(id, Json.list(t == null ? "" : t, r.get(2), r.get(3), r.get(4)));
        }
        synchronized (enCache) { enCache.put(key, out); }
        return out;
    }

    private String version(Map<String, String> q) {
        return "kjv".equals(q.get("t")) && hasKjv() ? "kjv" : "ro";
    }

    /** (text, token offsets, links) of the Bible shown next to the Hebrew. */
    private Object[] sideOf(long book, long ch, List<Object> vrow, String ver) {
        if ("kjv".equals(ver)) {
            List<Object> e = enChapter(book, ch).get(asLong(vrow.get(1)));
            if (e != null) return new Object[]{e.get(0), e.get(1), e.get(2)};
            return new Object[]{"", new ArrayList<Object>(), new ArrayList<Object>()};
        }
        return new Object[]{vrow.get(2), vrow.get(3), vrow.get(5)};
    }

    /** {ref: [book, ch, v], row} for a verse id; ref is null when there is no such verse. */
    private Object[] verseById(long vid) {
        List<Object[]> r = q("SELECT book, ch, v FROM verses WHERE id=?", vid);
        if (r.isEmpty()) return new Object[]{null, null};
        long b = asLong(r.get(0)[0]), c = asLong(r.get(0)[1]), v = asLong(r.get(0)[2]);
        long[] ref = {b, c, v};
        List<Object> data = chapter(b, c);
        if (data != null) for (Object o : data) if (asLong(L(o).get(1)) == vid) return new Object[]{ref, L(o)};
        return new Object[]{ref, null};
    }

    private Map<String, Object> lemmaRow(String key) {
        List<Object[]> rows = q("SELECT data, freq, rank, family FROM lemmas WHERE key=?", key);
        if (rows.isEmpty()) return null;
        Object[] r = rows.get(0);
        Map<String, Object> d = M(Json.parse((String) r[0]));
        d.put("freq", r[1]);
        d.put("rank", r[2]);
        d.put("family_id", r[3]);
        if (!d.containsKey("gloss_ro")) d.put("gloss_ro", "");
        if (!d.containsKey("en")) d.put("en", new ArrayList<Object>());
        return d;
    }

    private static final String[] BRIEF_FIELDS = {"key", "freq", "rank", "gloss", "hebrew", "translit", "glossRo"};

    synchronized Set<String> lemmaColumns() {
        if (lemmaColumns == null) {
            Set<String> s = new HashSet<String>();
            for (Object[] r : q("PRAGMA table_info(lemmas)")) s.add(String.valueOf(r[1]));
            lemmaColumns = s;
        }
        return lemmaColumns;
    }

    private String briefCols() {
        return "key, freq, rank, gloss, hebrew, translit, " + (lemmaColumns().contains("gloss_ro") ? "gloss_ro" : "''");
    }

    /** Short record per word: key, frequency, rank, English gloss, Hebrew, transliteration, Romanian meaning. */
    Map<String, Map<String, Object>> lemmaBrief(List<String> keysIn) {
        List<String> keys = new ArrayList<String>();
        for (String k : keysIn) if (k != null && !k.isEmpty()) keys.add(k);
        Map<String, Map<String, Object>> out = new LinkedHashMap<String, Map<String, Object>>();
        if (keys.isEmpty()) return out;
        String cols = briefCols();
        for (int i = 0; i < keys.size(); i += 500) {
            List<String> chunk = keys.subList(i, Math.min(keys.size(), i + 500));
            for (Object[] r : q("SELECT " + cols + " FROM lemmas WHERE key IN (" + placeholders(chunk.size()) + ")", chunk.toArray())) {
                Map<String, Object> m = new LinkedHashMap<String, Object>();
                for (int j = 0; j < BRIEF_FIELDS.length; j++) m.put(BRIEF_FIELDS[j], r[j]);
                out.put((String) r[0], m);
            }
        }
        return out;
    }

    private Map<String, Object> family(Object fid) {
        if (!truthy(fid)) return null;
        List<Object[]> r = q("SELECT data FROM families WHERE id=?", fid);
        if (r.isEmpty()) return null;
        Map<String, Object> fam = M(Json.parse((String) r.get(0)[0]));
        List<String> keys = new ArrayList<String>();
        for (Object o : L(fam.get("members"))) { Object k = M(o).get("key"); if (truthy(k)) keys.add((String) k); }
        Map<String, Map<String, Object>> brief = lemmaBrief(keys);
        for (Object o : L(fam.get("members"))) {
            Map<String, Object> m = M(o);
            Map<String, Object> b = brief.get(m.get("key"));
            if (b != null) {
                m.put("freq", b.get("freq"));
                m.put("gloss", b.get("gloss"));
                m.put("hebrew", b.get("hebrew"));
                m.put("translit", b.get("translit"));
                m.put("glossRo", b.get("glossRo"));
            } else {
                m.put("freq", 0L);
            }
        }
        return fam;
    }

    private Object morphInfo(String code) {
        synchronized (morphCache) {
            if (morphCache.containsKey(code)) return morphCache.get(code);
        }
        List<Object[]> r = q("SELECT data FROM morph WHERE code=?", code);
        Object v = r.isEmpty() ? null : Json.parse((String) r.get(0)[0]);
        synchronized (morphCache) { morphCache.put(code, v); }
        return v;
    }

    synchronized long totalTokens() {
        if (totalTokens == null) {
            long t = asLong(one("SELECT SUM(freq) FROM lemmas WHERE key NOT LIKE 'H9%'"));
            totalTokens = t == 0 ? 1 : t;
        }
        return totalTokens;
    }

    private boolean hasTable(String name) {
        synchronized (hasTable) {
            Boolean b = hasTable.get(name);
            if (b == null) {
                b = !q("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", name).isEmpty();
                hasTable.put(name, b);
            }
            return b;
        }
    }

    /** {chapter: {word key: count}} for one book. */
    Map<Long, Map<String, Object>> bookLemmas(long book) {
        synchronized (bookLemmaCache) {
            Map<Long, Map<String, Object>> c = bookLemmaCache.get(book);
            if (c != null) return c;
        }
        Map<Long, Map<String, Object>> out = new LinkedHashMap<Long, Map<String, Object>>();
        for (Object[] r : q("SELECT ch, data FROM chapter_lemmas WHERE book=? ORDER BY ch", book)) out.put(asLong(r[0]), M(Json.parse((String) r[1])));
        synchronized (bookLemmaCache) { bookLemmaCache.put(book, out); }
        return out;
    }

    private Map<String, Object> chapterLemmas(long book, long ch) {
        Map<String, Object> m = bookLemmas(book).get(ch);
        return m == null ? new LinkedHashMap<String, Object>() : m;
    }

    // ================================================================== references

    private synchronized Map<String, Integer> bookNames() {
        if (bookNames != null) return bookNames;
        Map<String, Integer> names = new HashMap<String, Integer>();
        for (Map<String, Object> b : books()) {
            int idx = (int) asLong(b.get("idx"));
            for (String f : new String[]{"code", "usfx", "ro", "en", "he_tr"}) {
                Object n = b.get(f);
                names.put(stripAccents(n == null ? "" : n.toString()).replace(" ", ""), idx);
            }
        }
        Object[] extra = {"ps", 18, "psalm", 18, "psalmi", 18, "psalmul", 18, "gn", 0, "gen", 0, "ex", 1, "exod", 1,
            "dt", 4, "deut", 4, "judecatori", 6, "jud", 6, "1imp", 10, "2imp", 11, "1regi", 10, "2regi", 11,
            "1kings", 10, "2kings", 11, "1kgs", 10, "2kgs", 11, "1sam", 8, "2sam", 9, "1chr", 12, "2chr", 13,
            "1cron", 12, "2cron", 13, "eccl", 20, "ecl", 20, "cant", 21, "cantarea", 21, "song", 21,
            "songofsolomon", 21, "is", 22, "ier", 23, "plang", 24, "plangeri", 24, "ezec", 25, "ezek", 25,
            "dan", 26, "os", 27, "ioel", 28, "joel", 28, "ob", 30, "obad", 30, "iona", 31, "jonah", 31,
            "mica", 32, "nah", 33, "hab", 34, "tef", 35, "zef", 35, "zeph", 35, "hag", 36, "zah", 37,
            "zech", 37, "mal", 38, "prov", 19, "pr", 19, "iov", 17, "est", 16, "neem", 15, "ezra", 14,
            "rut", 7, "ruth", 7, "ios", 5, "josh", 5, "num", 3, "lev", 2, "psalms", 18, "proverbs", 19};
        for (int i = 0; i < extra.length; i += 2) names.put((String) extra[i], (Integer) extra[i + 1]);
        bookNames = names;
        return names;
    }

    private static final String WS = "[\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
    private static final Pattern REF_RE = Pattern.compile(
        "^\\s*([1-3]?\\s*[^\\d\\s:.,][^\\d:.,]*?)\\s*(\\d+)?(?:\\s*[:.,]\\s*(\\d+))?\\s*$");

    Map<String, Object> parseRef(String qs) {
        // References are short; collapsing spaces and capping the length keeps the pattern from backtracking.
        qs = (qs == null ? "" : qs).replaceAll(WS + "+", " ").trim();
        if (qs.length() > 40) return null;
        Matcher m = REF_RE.matcher(qs);
        if (!m.matches()) return null;
        String name = stripAccents(m.group(1)).replace(" ", "").replace(".", "");
        Map<String, Integer> names = bookNames();
        Integer idx = names.get(name);
        if (idx == null) {
            TreeSet<Integer> cands = new TreeSet<Integer>();
            if (name.length() >= 2) for (Map.Entry<String, Integer> e : names.entrySet()) if (e.getKey().startsWith(name)) cands.add(e.getValue());
            if (cands.size() != 1) return null;
            idx = cands.first();
        }
        long ch, v = -1;
        try {
            ch = m.group(2) != null ? Long.parseLong(m.group(2)) : 1;
            if (m.group(3) != null) v = Long.parseLong(m.group(3));
        } catch (NumberFormatException e) {
            return null;
        }
        Map<String, Object> b = books().get(idx);
        if (ch < 1 || ch > asLong(b.get("chapters"))) return null;
        return Json.obj("book", (long) idx, "ch", ch, "v", v < 0 ? null : (Object) v);
    }

    // ================================================================== endpoints (GET)

    Result get(String path, Map<String, String> q) throws IOException {
        if (path.equals("/api/info")) return ok(info());
        if (path.equals("/api/books")) return ok(books());
        if (path.equals("/api/chapter")) return apiChapter(q);
        if (path.equals("/api/lemma")) return apiLemma(q);
        if (path.equals("/api/morph")) return apiMorph(q);
        if (path.equals("/api/occ")) return apiOcc(q);
        if (path.equals("/api/verse")) return apiVerse(q);
        if (path.equals("/api/search")) return apiSearch(q);
        if (path.equals("/api/chapter_vocab")) return apiChapterVocab(q);
        if (path.equals("/api/freqlist")) return apiFreqlist(q);
        if (path.equals("/api/random_lemmas")) return apiRandomLemmas(q);
        if (path.equals("/api/morphsearch")) return apiMorphsearch(q);
        if (path.equals("/api/forms")) return apiForms(q);
        if (path.equals("/api/deck")) return apiDeck(q);
        if (path.equals("/api/audio/status")) return apiAudioStatus(q);
        if (path.equals("/api/audio/counts")) return apiAudioCounts();
        if (path.equals("/api/tts")) return apiTts(q);
        return null;
    }

    private static Result ok(Object o) { return new Result(200, o); }

    private static Result notFound() { return new Result(404, Json.obj("error", "not found")); }

    Map<String, Object> info() {
        return Json.obj("version", VERSION, "built", meta().get("built"), "aligned", "1".equals(meta().get("aligned")),
            "kjv", hasKjv(), "userDir", userDir.getPath(), "tts", speech.status(), "platform", platform, "wsl", false);
    }

    private Result apiChapter(Map<String, String> q) {
        long b = intOf(param(q, "b")), c = intOf(param(q, "c"));
        List<Object> data = chapter(b, c);
        if (data == null) return notFound();
        Map<Long, List<Object>> en = enChapter(b, c);
        List<String> keys = new ArrayList<String>();
        for (String k : chapterLemmas(b, c).keySet()) if (!k.startsWith("H9")) keys.add(k);
        Map<String, Map<String, Object>> brief = lemmaBrief(keys);
        Object enList = null;
        if (!en.isEmpty()) {
            List<Object> a = new ArrayList<Object>();
            for (Object v : data) a.add(en.get(asLong(L(v).get(1))));
            enList = a;
        }
        Map<String, Object> glossRo = new LinkedHashMap<String, Object>();
        for (Map.Entry<String, Map<String, Object>> e : brief.entrySet()) {
            Object g = e.getValue().get("glossRo");
            if (truthy(g)) glossRo.put(e.getKey(), g);
        }
        return ok(Json.obj("book", b, "ch", c, "verses", data, "en", enList, "chapters", book(b).get("chapters"), "glossRo", glossRo));
    }

    private Result apiLemma(Map<String, String> q) {
        String key = param(q, "k");
        Map<String, Object> d = lemmaRow(key);
        if (d == null) return notFound();
        d.put("family", family(d.get("family_id")));
        d.put("totalTokens", totalTokens());
        d.put("nForms", hasTable("forms") ? asLong(one("SELECT COUNT(*) FROM forms WHERE lemma=?", key)) : 0L);
        return ok(d);
    }

    private Result apiMorph(Map<String, String> q) {
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        String codes = q.get("codes") == null ? "" : q.get("codes");
        String[] parts = codes.split(",", -1);
        for (int i = 0; i < parts.length && i < 64; i++) {
            String code = parts[i].trim();
            if (!code.isEmpty()) out.put(code, morphInfo(code));
        }
        return ok(out);
    }

    private Map<String, Object> contextFor(long vid, long wi, String ver) {
        Object[] found = verseById(vid);
        long[] ref = (long[]) found[0];
        List<Object> vrow = L(found[1]);
        if (vrow == null) return null;
        List<Object> words = L(vrow.get(4));
        Object[] side = sideOf(ref[0], ref[1], vrow, ver);
        List<Object> links = L(side[2]);
        TreeSet<Long> hits = new TreeSet<Long>();
        for (int i = 0; i + 1 < links.size(); i += 3) if (asLong(links.get(i + 1)) == wi) hits.add(asLong(links.get(i)));
        List<Object> ws = new ArrayList<Object>();
        for (Object w : words) { List<Object> p = L(w); ws.add(String.valueOf(p.get(0)) + String.valueOf(p.get(7))); }
        return Json.obj("book", ref[0], "ch", ref[1], "v", ref[2], "t", ver, "text", side[0], "tok", side[1],
            "hits", new ArrayList<Object>(hits), "words", ws, "w", wi);
    }

    private List<Object> contexts(List<Object[]> rows, String ver) {
        List<Object> items = new ArrayList<Object>();
        for (Object[] r : rows) {
            Map<String, Object> c = contextFor(asLong(r[0]), asLong(r[1]), ver);
            if (c != null) items.add(c);
        }
        return items;
    }

    private Result apiOcc(Map<String, String> q) {
        String key = param(q, "k");
        long off = num(q, "offset", 0, 0, 10000000L);
        long lim = num(q, "limit", 25, 1, 100);
        String book = q.get("book");
        String ver = version(q);
        String where = "lemma=?";
        List<Object> args = new ArrayList<Object>();
        args.add(key);
        if (!isBlank(book)) {
            where += " AND verse IN (SELECT id FROM verses WHERE book=?)";
            args.add((long) intOf(book));
        }
        long total = asLong(one("SELECT COUNT(*) FROM occ WHERE " + where, args.toArray()));
        List<Object> a2 = new ArrayList<Object>(args);
        a2.add(lim);
        a2.add(off);
        List<Object[]> rows = q("SELECT verse, w FROM occ WHERE " + where + " ORDER BY verse, w LIMIT ? OFFSET ?", a2.toArray());
        List<Object> perBook = new ArrayList<Object>();
        for (Object[] r : q("SELECT v.book, COUNT(*) FROM occ o JOIN verses v ON v.id=o.verse WHERE o.lemma=? GROUP BY v.book ORDER BY v.book", key))
            perBook.add(Json.list(r[0], r[1]));
        return ok(Json.obj("total", total, "offset", off, "items", contexts(rows, ver), "perBook", perBook));
    }

    private Result apiForms(Map<String, String> q) {
        String key = param(q, "k");
        if (!hasTable("forms")) return ok(Json.obj("items", new ArrayList<Object>(), "total", 0L));
        List<Object[]> rows = q("SELECT f.form, f.morph, f.n, v.book, v.ch, v.v, f.w FROM forms f JOIN verses v ON v.id=f.verse "
            + "WHERE f.lemma=? ORDER BY f.n DESC, f.form LIMIT 400", key);
        long total = 0;
        List<Object> items = new ArrayList<Object>();
        for (Object[] r : rows) {
            total += asLong(r[2]);
            items.add(Json.obj("form", r[0], "morph", r[1], "n", r[2], "b", r[3], "c", r[4], "v", r[5], "w", r[6]));
        }
        return ok(Json.obj("total", total, "items", items));
    }

    private Result apiVerse(Map<String, String> q) {
        long b = intOf(param(q, "b")), c = intOf(param(q, "c")), v = intOf(param(q, "v"));
        List<Object> data = chapter(b, c);
        if (data != null) {
            for (Object o : data) {
                List<Object> row = L(o);
                if (asLong(row.get(0)) == v) return ok(Json.obj("book", b, "ch", c, "verse", row, "en", enChapter(b, c).get(asLong(row.get(1)))));
            }
        }
        return notFound();
    }

    // ------------------------------------------------------------------ search

    private static final Pattern STRONG_RE = Pattern.compile("^[Hh]\\d{1,4}[a-zA-Z]?$");
    private static final Pattern HEB_RE = Pattern.compile("[֐-׿]");
    private static final Pattern NIQ_RE = Pattern.compile("[֑-ׇ]");

    static String likeEscape(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** One row per word, with the text the search compares against already folded. Built on the first search. */
    private static final class LemmaText {
        String key; long freq; String gloss, translit, ro, glossRo;
    }

    private volatile List<LemmaText> lemmaTexts;
    private volatile List<long[]> verseIds;
    private volatile List<String> verseTexts;
    // The search lists take a moment to build. They have their own lock, so the first search doesn't hold up
    // books(), meta() and the other tables nearly every request needs (they lock the Api itself).
    private final Object searchLock = new Object();

    private List<LemmaText> lemmaTexts() {
        synchronized (searchLock) {
            if (lemmaTexts == null) {
                Set<String> cols = lemmaColumns();
                String sql = "SELECT key, freq, gloss, translit, " + (cols.contains("ro") ? "ro" : "NULL") + ", "
                    + (cols.contains("gloss_ro") ? "gloss_ro" : "NULL") + " FROM lemmas WHERE freq>0 ORDER BY rowid";
                List<LemmaText> out = new ArrayList<LemmaText>();
                for (Object[] r : q(sql)) {
                    LemmaText t = new LemmaText();
                    t.key = (String) r[0];
                    t.freq = asLong(r[1]);
                    t.gloss = r[2] == null ? null : asciiLower((String) r[2]);
                    t.translit = r[3] == null ? null : asciiLower(((String) r[3]).replace(".", "").replace("'", ""));
                    t.ro = cols.contains("ro") ? asciiLower(stripAccents((String) r[4])) : null;
                    t.glossRo = cols.contains("gloss_ro") ? asciiLower(stripAccents((String) r[5])) : null;
                    out.add(t);
                }
                lemmaTexts = out;
            }
            return lemmaTexts;
        }
    }

    private void loadVerseTexts() {
        synchronized (searchLock) {
            if (verseIds != null) return;
            List<long[]> ids = new ArrayList<long[]>();
            List<String> texts = new ArrayList<String>();
            for (Object[] r : q("SELECT id, book, ch, v, ro FROM verses ORDER BY id")) {
                ids.add(new long[]{asLong(r[0]), asLong(r[1]), asLong(r[2]), asLong(r[3])});
                texts.add(asciiLower(stripAccents((String) r[4])));
            }
            verseTexts = texts;
            verseIds = ids;
        }
    }

    private static final Comparator<Map<String, Object>> BY_FREQ = new Comparator<Map<String, Object>>() {
        @Override public int compare(Map<String, Object> a, Map<String, Object> b) {
            return Long.compare(asLong(b.get("freq")), asLong(a.get("freq")));
        }
    };

    private List<Object> byFreq(Map<String, Map<String, Object>> brief) {
        List<Map<String, Object>> l = new ArrayList<Map<String, Object>>(brief.values());
        Collections.sort(l, BY_FREQ); // stable, like sorted() in Python
        return new ArrayList<Object>(l);
    }

    private static String strip(String s) {
        int a = 0, b = s.length();
        while (a < b && (Character.isWhitespace(s.charAt(a)) || Character.isSpaceChar(s.charAt(a)))) a++;
        while (b > a && (Character.isWhitespace(s.charAt(b - 1)) || Character.isSpaceChar(s.charAt(b - 1)))) b--;
        return s.substring(a, b);
    }

    private Result apiSearch(Map<String, String> q) {
        String text = strip(q.get("q") == null ? "" : q.get("q"));
        if (text.length() > 200) text = text.substring(0, 200);
        if (text.isEmpty()) return ok(Json.obj("ref", null, "lemmas", new ArrayList<Object>(), "verses", new ArrayList<Object>()));
        Map<String, Object> out = Json.obj("ref", parseRef(text), "lemmas", new ArrayList<Object>(), "verses", new ArrayList<Object>(), "q", text);
        int lim = 40;
        if (STRONG_RE.matcher(text).matches()) {
            int n = Integer.parseInt(text.replaceAll("\\D", ""));
            List<String> keys = new ArrayList<String>();
            for (Object[] r : q("SELECT key FROM lemmas WHERE key LIKE ? ORDER BY freq DESC LIMIT 20", String.format(Locale.ROOT, "H%04d%%", n))) keys.add((String) r[0]);
            out.put("lemmas", new ArrayList<Object>(lemmaBrief(keys).values()));
        } else if (HEB_RE.matcher(text).find()) {
            String cons = NIQ_RE.matcher(text).replaceAll("");
            List<String> keys = new ArrayList<String>();
            for (Object[] r : q("SELECT key FROM lemmas WHERE cons LIKE ? ESCAPE '\\' AND freq>0 ORDER BY (cons=?) DESC, freq DESC LIMIT ?",
                "%" + likeEscape(cons) + "%", cons, (long) lim)) keys.add((String) r[0]);
            out.put("lemmas", byFreq(lemmaBrief(keys)));
        } else {
            String t = stripAccents(text);
            String tl = t.replace("-", "").replace("'", "").replace(".", "");
            String needle = asciiLower(t), prefix = asciiLower(tl);
            // the same test as the SQL in server.py (which uses a Python function SQLite on the phone doesn't have)
            List<LemmaText> hits = new ArrayList<LemmaText>();
            for (LemmaText x : lemmaTexts()) {
                if ((x.gloss != null && x.gloss.contains(needle)) || (x.translit != null && x.translit.startsWith(prefix))
                    || (x.ro != null && x.ro.contains(needle)) || (x.glossRo != null && x.glossRo.contains(needle))) hits.add(x);
            }
            Collections.sort(hits, new Comparator<LemmaText>() {
                @Override public int compare(LemmaText a, LemmaText b) { return Long.compare(b.freq, a.freq); }
            });
            List<String> keys = new ArrayList<String>();
            for (int i = 0; i < hits.size() && i < lim; i++) keys.add(hits.get(i).key);
            out.put("lemmas", byFreq(lemmaBrief(keys)));
            if (t.codePointCount(0, t.length()) >= 3 && out.get("ref") == null) {
                List<Object> verses = new ArrayList<Object>();
                if ("kjv".equals(version(q))) {
                    for (Object[] r : q("SELECT v.id, v.book, v.ch, v.v, e.text FROM en_verses e JOIN verses v ON v.id=e.id "
                        + "WHERE lower(e.text) LIKE ? ESCAPE '\\' ORDER BY v.id LIMIT 60", "%" + likeEscape(t) + "%"))
                        verses.add(Json.obj("book", r[1], "ch", r[2], "v", r[3], "text", r[4]));
                } else {
                    loadVerseTexts();
                    List<long[]> found = new ArrayList<long[]>();
                    for (int i = 0; i < verseTexts.size() && found.size() < 60; i++) if (verseTexts.get(i).contains(needle)) found.add(verseIds.get(i));
                    if (!found.isEmpty()) {
                        Object[] ids = new Object[found.size()];
                        for (int i = 0; i < ids.length; i++) ids[i] = found.get(i)[0];
                        Map<Long, String> texts = new HashMap<Long, String>();
                        for (Object[] r : q("SELECT id, ro FROM verses WHERE id IN (" + placeholders(ids.length) + ")", ids)) texts.put(asLong(r[0]), (String) r[1]);
                        for (long[] f : found) verses.add(Json.obj("book", f[1], "ch", f[2], "v", f[3], "text", texts.get(f[0])));
                    }
                }
                out.put("verses", verses);
            }
        }
        return ok(out);
    }

    private Result apiChapterVocab(Map<String, String> q) {
        long b = intOf(param(q, "b")), c = intOf(param(q, "c"));
        Map<String, Object> counts = chapterLemmas(b, c);
        Map<String, Map<String, Object>> brief = lemmaBrief(new ArrayList<String>(counts.keySet()));
        List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
        long tokens = 0;
        for (Map.Entry<String, Object> e : counts.entrySet()) {
            if (e.getKey().startsWith("H9")) continue;
            tokens += asLong(e.getValue());
            Map<String, Object> d = brief.get(e.getKey());
            if (d == null) continue;
            d = new LinkedHashMap<String, Object>(d);
            d.put("inChapter", e.getValue());
            items.add(d);
        }
        Collections.sort(items, BY_FREQ);
        return ok(Json.obj("items", items, "tokens", tokens));
    }

    private Result apiFreqlist(Map<String, String> q) {
        long lim = num(q, "limit", 200, 1, 12000);
        long off = num(q, "offset", 0, 0, 1000000);
        List<String> keys = new ArrayList<String>();
        for (Object[] r : q("SELECT key FROM lemmas WHERE freq>0 AND rank IS NOT NULL ORDER BY rank LIMIT ? OFFSET ?", lim, off)) keys.add((String) r[0]);
        Map<String, Map<String, Object>> brief = lemmaBrief(keys);
        List<Object> items = new ArrayList<Object>();
        for (String k : keys) if (brief.containsKey(k)) items.add(brief.get(k));
        return ok(Json.obj("total", totalTokens(), "items", items));
    }

    private Result apiRandomLemmas(Map<String, String> q) {
        long n = num(q, "n", 12, 1, 100);
        long maxrank = num(q, "maxrank", 1500, 1, 1000000);
        List<String> keys = new ArrayList<String>();
        for (Object[] r : q("SELECT key FROM lemmas WHERE rank IS NOT NULL AND rank<=? AND key NOT LIKE 'H9%' ORDER BY random() LIMIT ?", maxrank, n)) keys.add((String) r[0]);
        return ok(new ArrayList<Object>(lemmaBrief(keys).values()));
    }

    private synchronized List<Object[]> morphCodes() {
        if (morphCodes == null) morphCodes = hasTable("morphs") ? q("SELECT id, code FROM morphs") : new ArrayList<Object[]>();
        return morphCodes;
    }

    private volatile Assets lessonSource;
    private Set<String> lessonPatterns;
    private final Object lessonLock = new Object();

    /** Where the grammar lessons are read from (the web/ files), for the patterns morphsearch accepts. */
    void setLessonSource(Assets assets) { lessonSource = assets; }

    private static final Pattern LESSON_FILE = Pattern.compile("from \"\\./([a-z0-9_-]+\\.js)\"");
    private static final Pattern LESSON_SEARCH = Pattern.compile("\\bsearch:\\s*\"([^\"\\\\]+)\"");

    /**
     * The grammar-code patterns the lessons use (the search: "..." lines in web/js/lessons). Only these are run, like
     * lesson_patterns() in server.py: a pattern like (.*)*x would keep a server thread busy for minutes.
     */
    private Set<String> lessonPatterns() {
        synchronized (lessonLock) {
            if (lessonPatterns == null) {
                Set<String> found = new HashSet<String>();
                Assets a = lessonSource;
                byte[] index = a == null ? null : a.read("js/lessons/index.js");
                if (index != null) {
                    Matcher f = LESSON_FILE.matcher(utf8(index));
                    while (f.find()) {
                        byte[] lesson = a.read("js/lessons/" + f.group(1));
                        if (lesson == null) continue;
                        Matcher m = LESSON_SEARCH.matcher(utf8(lesson));
                        while (m.find()) found.add(m.group(1));
                    }
                }
                lessonPatterns = found;
            }
            return lessonPatterns;
        }
    }

    private static String utf8(byte[] b) {
        try {
            return new String(b, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    private Result apiMorphsearch(Map<String, String> q) {
        String pattern = q.get("re") == null ? "" : q.get("re");
        long lim = num(q, "limit", 12, 1, 60);
        String book = q.get("book");
        String ver = version(q);
        if (!lessonPatterns().contains(pattern)) return new Result(400, Json.obj("error", "bad pattern"));
        Pattern rx;
        try {
            rx = Pattern.compile(pattern);
        } catch (PatternSyntaxException e) {
            return new Result(400, Json.obj("error", "bad pattern"));
        }
        List<Object> ids = new ArrayList<Object>();
        for (Object[] r : morphCodes()) if (r[1] != null && rx.matcher((String) r[1]).find()) ids.add(asLong(r[0]));
        if (ids.isEmpty()) return ok(Json.obj("items", new ArrayList<Object>()));
        // The ids are written into the query as numbers: they come from the database itself (never from the request),
        // and a pattern can match over a thousand codes, more than the 999 "?" that SQLite allows on Android 7 to 11.
        StringBuilder in = new StringBuilder();
        for (Object id : ids) in.append(in.length() == 0 ? "" : ",").append(asLong(id));
        String where = "mid IN (" + in + ")";
        List<Object> args = new ArrayList<Object>();
        if (!isBlank(book)) {
            where += " AND verse IN (SELECT id FROM verses WHERE book=?)";
            args.add((long) intOf(book));
        }
        args.add(lim);
        List<Object[]> rows = q("SELECT verse, w FROM occ WHERE " + where + " ORDER BY random() LIMIT ?", args.toArray());
        Collections.sort(rows, new Comparator<Object[]>() {
            @Override public int compare(Object[] a, Object[] b) {
                int c = Long.compare(asLong(a[0]), asLong(b[0]));
                return c != 0 ? c : Long.compare(asLong(a[1]), asLong(b[1]));
            }
        });
        return ok(Json.obj("items", contexts(rows, ver)));
    }

    // ------------------------------------------------------------------ word decks

    private static boolean morphIsName(String data) {
        Object m = M(Json.parse(data)).get("morph");
        if (!(m instanceof String)) return false;
        return asciiLower((String) m).startsWith("n:");
    }

    private static boolean morphIsSet(String data) {
        return M(Json.parse(data)).get("morph") instanceof String;
    }

    private static List<String> mostCommon(Map<String, Long> counts) {
        List<Map.Entry<String, Long>> e = new ArrayList<Map.Entry<String, Long>>(counts.entrySet());
        Collections.sort(e, new Comparator<Map.Entry<String, Long>>() {
            @Override public int compare(Map.Entry<String, Long> a, Map.Entry<String, Long> b) { return Long.compare(b.getValue(), a.getValue()); }
        });
        List<String> keys = new ArrayList<String>();
        for (Map.Entry<String, Long> x : e) if (!x.getKey().startsWith("H9")) keys.add(x.getKey());
        return keys;
    }

    /** Ready-made lists of words to learn, most useful first. */
    private Result apiDeck(Map<String, String> q) {
        String d = q.get("id") == null ? "" : q.get("id");
        List<String> keys = new ArrayList<String>();
        if (d.startsWith("top") && d.length() > 3 && d.substring(3).matches("[0-9]+")) {
            String digits = d.substring(3);
            long n = digits.length() > 9 ? 5000 : Math.max(1, Math.min(Long.parseLong(digits), 5000));
            for (Object[] r : q("SELECT key FROM lemmas WHERE freq>0 AND rank IS NOT NULL AND key NOT LIKE 'H9%' ORDER BY rank LIMIT ?", n)) keys.add((String) r[0]);
        } else if (d.equals("freq10")) {
            for (Object[] r : q("SELECT key, data FROM lemmas WHERE freq>=10 AND key NOT LIKE 'H9%' ORDER BY freq DESC"))
                if (morphIsSet((String) r[1]) && !morphIsName((String) r[1])) keys.add((String) r[0]);
        } else if (d.equals("names")) {
            for (Object[] r : q("SELECT key, data FROM lemmas WHERE freq>=2 AND key NOT LIKE 'H9%' ORDER BY freq DESC"))
                if (morphIsName((String) r[1])) keys.add((String) r[0]);
        } else if (d.startsWith("book:")) {
            long b = intOf(d.substring(5));
            Map<String, Long> counts = new LinkedHashMap<String, Long>();
            for (Map<String, Object> c : bookLemmas(b).values())
                for (Map.Entry<String, Object> e : c.entrySet()) {
                    Long old = counts.get(e.getKey());
                    counts.put(e.getKey(), (old == null ? 0 : old) + asLong(e.getValue()));
                }
            keys = mostCommon(counts);
        } else if (d.startsWith("chapter:")) {
            String[] p = d.substring(8).split("\\.", -1);
            if (p.length != 2) throw new BadRequest("chapter deck must look like chapter:BOOK.CHAPTER");
            long b = intOf(p[0]), c = intOf(p[1]);
            Map<String, Long> counts = new LinkedHashMap<String, Long>();
            for (Map.Entry<String, Object> e : chapterLemmas(b, c).entrySet()) counts.put(e.getKey(), asLong(e.getValue()));
            keys = mostCommon(counts);
        } else {
            throw new BadRequest("unknown deck");
        }
        Map<String, Map<String, Object>> brief = lemmaBrief(keys);
        List<Object> items = new ArrayList<Object>();
        for (String k : keys) if (brief.containsKey(k)) items.add(brief.get(k));
        return ok(Json.obj("id", d, "items", items));
    }

    // ------------------------------------------------------------------ audio

    private static Map<String, Object> idleStatus() {
        return Json.obj("running", false, "scope", "", "done", 0L, "failed", 0L, "total", 0L, "cancel", false,
            "error", "", "started", 0.0, "finished", 0.0);
    }

    private Result apiAudioStatus(Map<String, String> q) {
        Map<String, Object> st = idleStatus();
        st.put("available", speech.available());
        st.put("tts", speech.status());
        if (!isBlank(q.get("cache"))) {
            long[] fs = new long[2];
            countFiles(speech.cacheDir(), speech.cacheExt(), fs, 0);
            st.put("cacheFiles", fs[0]);
            st.put("cacheBytes", fs[1]);
        }
        return ok(st);
    }

    private static void countFiles(File dir, String ext, long[] acc, int depth) {
        File[] list = dir == null || depth > 4 ? null : dir.listFiles();
        if (list == null) return;
        for (File f : list) {
            if (f.isDirectory()) countFiles(f, ext, acc, depth + 1);
            else if (f.getName().endsWith(ext)) { acc[0]++; acc[1] += f.length(); }
        }
    }

    private Result apiAudioCounts() {
        long words = asLong(one("SELECT COUNT(DISTINCT hebrew) FROM lemmas WHERE freq>0 AND key NOT LIKE 'H9%'"));
        long forms = hasTable("forms") ? asLong(one("SELECT COUNT(DISTINCT form) FROM forms")) : 0;
        Map<Long, Long> perBook = new HashMap<Long, Long>();
        for (Object[] r : q("SELECT book, COUNT(*) FROM verses GROUP BY book")) perBook.put(asLong(r[0]), asLong(r[1]));
        List<Object> verses = new ArrayList<Object>();
        for (Map<String, Object> b : books()) { Long n = perBook.get(asLong(b.get("idx"))); verses.add(n == null ? 0L : n); }
        return ok(Json.obj("words", words, "forms", forms, "verses", verses));
    }

    private Result apiTts(Map<String, String> q) {
        String text = q.get("text") == null ? "" : q.get("text");
        String voice = isBlank(q.get("voice")) ? "he-IL-AvriNeural" : q.get("voice");
        String rate = isBlank(q.get("rate")) ? "+0%" : q.get("rate");
        try {
            return new Result(speech.synthesize(text, voice, rate), speech.mime());
        } catch (Speech.Failed e) {
            return new Result(503, Json.obj("error", e.getMessage()));
        }
    }

    // ================================================================== endpoints (POST and PUT)

    Result post(String path, Object body) throws IOException {
        if (path.equals("/api/userdata")) {
            if (!(body instanceof Map)) return new Result(400, Json.obj("error", "expected an object"));
            long[] res = writeUserdata(M(body));
            if (res[0] < 0) return new Result(409, Json.obj("error", "conflict", "rev", res[1]));
            return ok(Json.obj("ok", true, "saved", new SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(new Date()), "rev", res[0]));
        }
        if (path.equals("/api/coverage")) return apiCoverage(body);
        if (path.equals("/api/lemma_brief")) return apiLemmaBrief(body);
        if (path.equals("/api/audio/prefetch")) {
            String why = speech.prefetchRefusal();
            return new Result(409, Json.obj("error", why == null ? "not available" : why));
        }
        if (path.equals("/api/audio/cancel")) return ok(Json.obj("ok", true));
        if (path.equals("/api/audio/clear")) {
            deleteTree(speech.cacheDir());
            return ok(Json.obj("ok", true));
        }
        if (path.equals("/api/restore_point")) return apiRestorePoint();
        return null;
    }

    private Result apiCoverage(Object body) {
        Object known = body instanceof Map ? M(body).get("known") : null;
        if (!(known instanceof List)) throw new BadRequest("expected {\"known\": [...]}");
        Set<String> kn = new HashSet<String>();
        for (Object k : L(known)) if (k instanceof String) kn.add((String) k);
        List<Object> outBooks = new ArrayList<Object>();
        long totalKnown = 0, total = 0;
        for (Map<String, Object> b : books()) {
            long idx = asLong(b.get("idx"));
            Map<Long, Map<String, Object>> chs = bookLemmas(idx);
            List<Object> chapters = new ArrayList<Object>();
            long btot = 0, bkn = 0;
            long nch = asLong(b.get("chapters"));
            for (long ch = 1; ch <= nch; ch++) {
                Map<String, Object> c = chs.get(ch);
                long tot = 0, k = 0;
                if (c != null) {
                    for (Map.Entry<String, Object> e : c.entrySet()) {
                        long n = asLong(e.getValue());
                        if (!e.getKey().startsWith("H9")) tot += n;
                        if (kn.contains(e.getKey())) k += n;
                    }
                }
                chapters.add(Json.list(k, tot));
                btot += tot;
                bkn += k;
            }
            outBooks.add(Json.obj("idx", idx, "known", bkn, "total", btot, "chapters", chapters));
            total += btot;
            totalKnown += bkn;
        }
        return ok(Json.obj("known", totalKnown, "total", total, "books", outBooks));
    }

    private Result apiLemmaBrief(Object body) {
        Object keys = body instanceof Map ? M(body).get("keys") : null;
        if (!(keys instanceof List)) throw new BadRequest("expected {\"keys\": [...]}");
        List<String> ks = new ArrayList<String>();
        List<Object> l = L(keys);
        for (int i = 0; i < l.size() && i < 20000; i++) if (l.get(i) instanceof String) ks.add((String) l.get(i));
        return ok(lemmaBrief(ks));
    }

    // ================================================================== saved progress (userdata.json)

    private final Object saveLock = new Object();
    private long revStatTime = -1, revStatSize = -1, revCached = 0;
    static final int RESTORE_POINTS_KEPT = 10;
    static final int DAILY_BACKUPS_KEPT = 14;

    /**
     * The saved progress as JSON text; a damaged file is moved aside once and an empty object returned. A file that
     * can't be read right now throws (an error for the page), never "{}": a save made from that empty start would
     * replace the real file.
     */
    String readUserdataText() throws IOException {
        synchronized (saveLock) {
            if (!userFile.exists()) return "{}";
            String text = readText(userFile);
            try {
                Json.parse(text);
                return text;
            } catch (RuntimeException e) {
                File broken = new File(userFile.getPath() + ".broken-" + stamp("yyyyMMdd-HHmmss"));
                if (!userFile.renameTo(broken)) copyFile(userFile, broken); // renaming keeps it from being copied on every load
                return "{}";
            }
        }
    }

    /** Revision stored in userdata.json. Every save bumps it, so a window with old data can't overwrite newer progress. */
    private long currentRev() throws IOException {
        if (!userFile.exists()) return 0;
        long t = userFile.lastModified(), s = userFile.length();
        if (t == revStatTime && s == revStatSize) return revCached;
        long rev = 0;
        try {
            Object o = Json.parse(readText(userFile));
            if (o instanceof Map) {
                Object r = M(o).get("_rev");
                if (r instanceof Long && (Long) r >= 0) rev = (Long) r;
            }
        } catch (RuntimeException e) {
            rev = 0; // damaged: a save may replace it (the daily backup keeps the old file)
        }
        // an IOException goes to the caller: the save fails instead of replacing a file it couldn't read
        revStatTime = t;
        revStatSize = s;
        revCached = rev;
        return rev;
    }

    /** {new rev, 0} after saving, or {-1, current rev} when the sender's copy is out of date. */
    long[] writeUserdata(Map<String, Object> data) throws IOException {
        synchronized (saveLock) {
            boolean hasBase = data.containsKey("_baseRev");
            Object base = data.remove("_baseRev");
            long rev = currentRev();
            if (hasBase && base != null) {
                boolean same = base instanceof Number && ((Number) base).doubleValue() == (double) rev;
                if (!same) return new long[]{-1, rev};
            }
            mkdirs(userDir);
            mkdirs(backupDir);
            // one backup per day, keep the last 14
            File bpath = new File(backupDir, "userdata-" + stamp("yyyy-MM-dd") + ".json");
            if (userFile.exists() && !bpath.exists()) {
                copyFile(userFile, bpath);
                prune("userdata-", DAILY_BACKUPS_KEPT);
            }
            data.put("_rev", rev + 1);
            File tmp = new File(userFile.getPath() + ".tmp");
            FileOutputStream out = new FileOutputStream(tmp);
            try {
                out.write(Json.write(data).getBytes("UTF-8"));
                out.flush();
                out.getFD().sync(); // so a crash or power cut can't leave an empty file behind
            } finally {
                out.close();
            }
            if (!tmp.renameTo(userFile)) {
                // some file systems refuse to rename over an existing file
                userFile.delete();
                if (!tmp.renameTo(userFile)) throw new IOException("could not replace " + userFile);
            }
            revStatTime = userFile.lastModified();
            revStatSize = userFile.length();
            revCached = rev + 1;
            return new long[]{rev + 1, 0};
        }
    }

    /** Copies userdata.json to backups/restore-point-TIME.json before something replaces it. */
    private Result apiRestorePoint() throws IOException {
        synchronized (saveLock) {
            if (!userFile.exists()) return ok(Json.obj("ok", true, "file", ""));
            mkdirs(backupDir);
            String name = "restore-point-" + stamp("yyyyMMdd-HHmmss") + ".json";
            copyFile(userFile, new File(backupDir, name));
            prune("restore-point-", RESTORE_POINTS_KEPT);
            return ok(Json.obj("ok", true, "file", name));
        }
    }

    private void prune(String prefix, int keep) {
        String[] names = backupDir.list();
        if (names == null) return;
        List<String> old = new ArrayList<String>();
        for (String n : names) if (n.startsWith(prefix)) old.add(n);
        Collections.sort(old);
        for (int i = 0; i < old.size() - keep; i++) new File(backupDir, old.get(i)).delete();
    }

    private static String stamp(String fmt) { return new SimpleDateFormat(fmt, Locale.ROOT).format(new Date()); }

    private static void mkdirs(File d) throws IOException {
        if (!d.isDirectory() && !d.mkdirs() && !d.isDirectory()) throw new IOException("could not create " + d);
    }

    static String readText(File f) throws IOException {
        return new String(readBytes(f), "UTF-8");
    }

    static byte[] readBytes(File f) throws IOException {
        InputStream in = new FileInputStream(f);
        try {
            return readAll(in);
        } finally {
            in.close();
        }
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    static void copyFile(File from, File to) throws IOException {
        InputStream in = new FileInputStream(from);
        try {
            OutputStream out = new FileOutputStream(to);
            try {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            } finally {
                out.close();
            }
        } finally {
            in.close();
        }
        to.setLastModified(from.lastModified());
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] list = f.listFiles();
        if (list != null) for (File c : list) deleteTree(c);
        f.delete();
    }

    static List<String> sorted(String[] a) {
        List<String> l = a == null ? new ArrayList<String>() : new ArrayList<String>(Arrays.asList(a));
        Collections.sort(l);
        return l;
    }
}
