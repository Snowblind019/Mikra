package io.github.snowblind019.mikra;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Small JSON reader and writer, so the app behaves the same on the phone and in the desktop test harness.
 * Objects become LinkedHashMap (key order kept), arrays ArrayList, numbers Long or Double.
 */
final class Json {
    private Json() {}

    static final class Error extends RuntimeException {
        Error(String msg) { super(msg); }
    }

    // ------------------------------------------------------------------ reading

    static Object parse(String s) {
        Reader r = new Reader(s);
        r.ws();
        Object v = r.value(0);
        r.ws();
        if (r.i != s.length()) throw new Error("extra data at position " + r.i);
        return v;
    }

    private static final class Reader {
        final String s;
        int i;
        Reader(String s) { this.s = s; }

        void ws() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }

        Error err(String what) { return new Error(what + " at position " + i); }

        Object value(int depth) {
            if (depth > 400) throw err("nested too deep");
            if (i >= s.length()) throw err("unexpected end");
            char c = s.charAt(i);
            switch (c) {
                case '{': return object(depth);
                case '[': return array(depth);
                case '"': return string();
                case 't': word("true"); return Boolean.TRUE;
                case 'f': word("false"); return Boolean.FALSE;
                case 'n': word("null"); return null;
                case 'N': word("NaN"); return Double.NaN;
                case 'I': word("Infinity"); return Double.POSITIVE_INFINITY;
                default:
                    if (c == '-' && s.startsWith("-Infinity", i)) { i += 9; return Double.NEGATIVE_INFINITY; }
                    if (c == '-' || (c >= '0' && c <= '9')) return number();
                    throw err("unexpected character");
            }
        }

        void word(String w) {
            if (!s.startsWith(w, i)) throw err("unexpected word");
            i += w.length();
        }

        Map<String, Object> object(int depth) {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            i++;
            ws();
            if (i < s.length() && s.charAt(i) == '}') { i++; return m; }
            while (true) {
                ws();
                if (i >= s.length() || s.charAt(i) != '"') throw err("expected a key");
                String k = string();
                ws();
                if (i >= s.length() || s.charAt(i) != ':') throw err("expected ':'");
                i++;
                ws();
                m.put(k, value(depth + 1));
                ws();
                if (i >= s.length()) throw err("unexpected end");
                char c = s.charAt(i++);
                if (c == '}') return m;
                if (c != ',') throw err("expected ',' or '}'");
            }
        }

        List<Object> array(int depth) {
            List<Object> a = new ArrayList<Object>();
            i++;
            ws();
            if (i < s.length() && s.charAt(i) == ']') { i++; return a; }
            while (true) {
                ws();
                a.add(value(depth + 1));
                ws();
                if (i >= s.length()) throw err("unexpected end");
                char c = s.charAt(i++);
                if (c == ']') return a;
                if (c != ',') throw err("expected ',' or ']'");
            }
        }

        String string() {
            i++; // opening quote
            StringBuilder b = null;
            int start = i;
            while (true) {
                if (i >= s.length()) throw err("unterminated string");
                char c = s.charAt(i);
                if (c == '"') {
                    String out = b == null ? s.substring(start, i) : b.append(s, start, i).toString();
                    i++;
                    return out;
                }
                if (c < 0x20) throw err("control character in string");
                if (c == '\\') {
                    if (b == null) b = new StringBuilder();
                    b.append(s, start, i);
                    i++;
                    if (i >= s.length()) throw err("unterminated string");
                    char e = s.charAt(i++);
                    switch (e) {
                        case '"': b.append('"'); break;
                        case '\\': b.append('\\'); break;
                        case '/': b.append('/'); break;
                        case 'b': b.append('\b'); break;
                        case 'f': b.append('\f'); break;
                        case 'n': b.append('\n'); break;
                        case 'r': b.append('\r'); break;
                        case 't': b.append('\t'); break;
                        case 'u':
                            if (i + 4 > s.length()) throw err("bad \\u escape");
                            try {
                                b.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                            } catch (NumberFormatException ex) {
                                throw err("bad \\u escape");
                            }
                            i += 4;
                            break;
                        default: throw err("bad escape");
                    }
                    start = i;
                } else {
                    i++;
                }
            }
        }

        Object number() {
            int start = i;
            if (s.charAt(i) == '-') i++;
            if (i >= s.length()) throw err("bad number");
            if (s.charAt(i) == '0') i++;
            else if (s.charAt(i) >= '1' && s.charAt(i) <= '9') { while (i < s.length() && Character.isDigit(s.charAt(i)) && s.charAt(i) < 128) i++; }
            else throw err("bad number");
            boolean frac = false;
            if (i < s.length() && s.charAt(i) == '.') {
                frac = true;
                i++;
                int d = i;
                while (i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
                if (i == d) throw err("bad number");
            }
            if (i < s.length() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                frac = true;
                i++;
                if (i < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
                int d = i;
                while (i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
                if (i == d) throw err("bad number");
            }
            String t = s.substring(start, i);
            if (!frac) {
                try { return Long.parseLong(t); } catch (NumberFormatException ex) { /* too big: fall through */ }
            }
            return Double.parseDouble(t);
        }
    }

    // ------------------------------------------------------------------ writing

    static String write(Object v) {
        StringBuilder b = new StringBuilder(256);
        write(b, v);
        return b.toString();
    }

    @SuppressWarnings("unchecked")
    static void write(StringBuilder b, Object v) {
        if (v == null) {
            b.append("null");
        } else if (v instanceof String) {
            quote(b, (String) v);
        } else if (v instanceof Boolean) {
            b.append(((Boolean) v).booleanValue() ? "true" : "false");
        } else if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) b.append("null"); // JSON.parse would reject NaN
            else b.append(Double.toString(d));
        } else if (v instanceof Number) {
            b.append(((Number) v).longValue());
        } else if (v instanceof Map) {
            b.append('{');
            boolean first = true;
            for (Map.Entry<Object, Object> e : ((Map<Object, Object>) v).entrySet()) {
                if (!first) b.append(',');
                first = false;
                quote(b, String.valueOf(e.getKey()));
                b.append(':');
                write(b, e.getValue());
            }
            b.append('}');
        } else if (v instanceof List) {
            b.append('[');
            boolean first = true;
            for (Object x : (List<Object>) v) {
                if (!first) b.append(',');
                first = false;
                write(b, x);
            }
            b.append(']');
        } else if (v instanceof Object[]) {
            b.append('[');
            Object[] a = (Object[]) v;
            for (int i = 0; i < a.length; i++) {
                if (i > 0) b.append(',');
                write(b, a[i]);
            }
            b.append(']');
        } else if (v instanceof Raw) {
            b.append(((Raw) v).json);
        } else {
            quote(b, v.toString());
        }
    }

    /** Text that is already JSON, written as it is. */
    static final class Raw {
        final String json;
        Raw(String json) { this.json = json; }
    }

    static void quote(StringBuilder b, String s) {
        b.append('"');
        int n = s.length();
        for (int i = 0; i < n; i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '\b': b.append("\\b"); break;
                case '\f': b.append("\\f"); break;
                default:
                    if (c < 0x20) {
                        b.append("\\u00");
                        b.append(Character.forDigit((c >> 4) & 15, 16));
                        b.append(Character.forDigit(c & 15, 16));
                    } else {
                        b.append(c);
                    }
            }
        }
        b.append('"');
    }

    // ------------------------------------------------------------------ helpers

    static Map<String, Object> obj(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    static List<Object> list(Object... items) {
        List<Object> a = new ArrayList<Object>(items.length);
        for (Object x : items) a.add(x);
        return a;
    }
}
