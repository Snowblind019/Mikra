package io.github.snowblind019.mikra;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * A small web server on 127.0.0.1 for the app's page and API, the Java twin of the Handler class in server.py.
 * Same checks: only "localhost" host names, only the app's own page may use the API, JSON-only writes.
 * On the phone other apps can reach 127.0.0.1 too, so the API also needs a secret cookie that only the app's
 * own window gets (see /__start).
 */
final class Http {
    static final String COOKIE = "mikra_key";

    private static final String[][] SECURITY_HEADERS = {
        {"Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            + "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; "
            + "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"},
        {"X-Content-Type-Options", "nosniff"},
        {"X-Frame-Options", "DENY"},
        {"Referrer-Policy", "no-referrer"},
        {"Cross-Origin-Resource-Policy", "same-origin"},
    };

    private static final Map<String, String> MIME = new HashMap<String, String>();
    static {
        String[] m = {".html", "text/html; charset=utf-8", ".js", "text/javascript; charset=utf-8", ".css", "text/css; charset=utf-8",
            ".json", "application/json", ".svg", "image/svg+xml", ".png", "image/png", ".ico", "image/x-icon",
            ".woff2", "font/woff2", ".woff", "font/woff", ".ttf", "font/ttf", ".mp3", "audio/mpeg", ".wav", "audio/wav",
            ".txt", "text/plain; charset=utf-8"};
        for (int i = 0; i < m.length; i += 2) MIME.put(m[i], m[i + 1]);
    }

    private final Api api;
    private final Assets assets;
    private final String token; // null: no cookie needed (desktop test harness)
    private final boolean cacheStatic;
    private final Map<String, byte[]> staticCache = new HashMap<String, byte[]>();
    private ServerSocket server;
    private ThreadPoolExecutor pool;
    static final int MAX_CONNECTIONS = 24; // the page uses about 6 at a time
    // Time limits. Another app on the phone can connect to 127.0.0.1 too; these keep it from holding connections open
    // by sending a byte now and then (the old 15 s timeout started over with every byte).
    static final int IDLE_MS = 5000;      // a kept-alive connection waiting for its next request
    static final int HEADERS_MS = 10000;  // the request line and all headers, together
    static final int BODY_MS = 60000;     // a request body (the app's own saves are a few MB at most)
    private final LinkedHashMap<Socket, Conn> conns = new LinkedHashMap<Socket, Conn>(); // oldest first
    private volatile boolean closed;
    private int port;
    volatile boolean debug;
    // Request headers: all of them together may not pass this size or count (the app's window sends about 1 KB).
    static final int MAX_HEADER_BYTES = 32 * 1024;
    static final int MAX_HEADER_LINES = 64;
    // One-time start links. The window opens /__start?t=<one of these>; it is used up on the first visit and runs out
    // after a minute, so a start link that ends up in a log or a screen reader is worth nothing. The key itself
    // (the cookie) never appears in a link. keyStarts: the desktop test harness may also open it with the key.
    private final Map<String, Long> startTokens = new HashMap<String, Long>();
    private final SecureRandom random = new SecureRandom();
    volatile boolean keyStarts;

    /** Where unexpected errors go (on the phone: logcat). Without one they are printed only when debug is on. */
    interface ErrorLog {
        void error(String what, Throwable e);
    }

    volatile ErrorLog errorLog;

    private void report(String what, Throwable e) {
        ErrorLog l = errorLog;
        if (l != null) {
            try { l.error(what, e); } catch (Throwable ignored) { /* logging must never fail a request */ }
        } else if (debug) {
            e.printStackTrace();
        }
    }

    /**
     * An open connection. trusted: it has sent the key cookie (the app's own window). busy: a complete request is
     * being answered; otherwise it is idle or still arriving.
     */
    private static final class Conn {
        final Socket socket;
        volatile boolean trusted, busy;
        Conn(Socket s) { socket = s; }
    }

    Http(Api api, Assets assets, String token, boolean cacheStatic) {
        this.api = api;
        this.assets = assets;
        this.token = token;
        this.cacheStatic = cacheStatic;
    }

    int port() { return port; }

    /** A new one-time start link token (32 hex digits), valid for a minute. */
    String newStartToken() {
        byte[] r = new byte[16];
        random.nextBytes(r);
        StringBuilder b = new StringBuilder(32);
        for (byte x : r) b.append(String.format("%02x", x & 0xff));
        String t = b.toString();
        long now = System.currentTimeMillis();
        synchronized (startTokens) {
            for (Iterator<Long> it = startTokens.values().iterator(); it.hasNext(); ) if (it.next() < now) it.remove();
            startTokens.put(t, now + 60000);
        }
        return t;
    }

    private boolean useStartToken(String t) {
        if (t == null) return false;
        Long exp;
        synchronized (startTokens) { exp = startTokens.remove(t); }
        return exp != null && exp >= System.currentTimeMillis();
    }

    /** Listens on the first free port from preferred on (a fixed port keeps the page's storage between runs). */
    synchronized int start(int preferred, int tries) throws IOException {
        InetAddress lo = InetAddress.getByName("127.0.0.1");
        IOException last = null;
        for (int i = 0; i <= tries; i++) {
            int p = i < tries ? preferred + i : 0; // last resort: any free port
            ServerSocket s = new ServerSocket();
            try {
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(lo, p), 64);
                server = s;
                break;
            } catch (IOException e) {
                last = e;
                try { s.close(); } catch (IOException ignored) { /* ignore */ }
            }
        }
        if (server == null) throw last != null ? last : new IOException("no free port");
        port = server.getLocalPort();
        // a bounded pool: a flood of connections (from another app, say) is turned away instead of using up memory.
        // A few spare threads cover connections that were just closed to make room and are still finishing.
        pool = new ThreadPoolExecutor(0, MAX_CONNECTIONS + 8, 30, TimeUnit.SECONDS, new SynchronousQueue<Runnable>(), new ThreadFactory() {
            @Override public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "mikra-http");
                t.setDaemon(true);
                return t;
            }
        });
        Thread acceptor = new Thread(new Runnable() {
            @Override public void run() { acceptLoop(); }
        }, "mikra-accept");
        acceptor.setDaemon(true);
        acceptor.start();
        return port;
    }

    synchronized void stop() {
        closed = true;
        try { if (server != null) server.close(); } catch (IOException ignored) { /* ignore */ }
        if (pool != null) pool.shutdownNow();
        synchronized (conns) {
            for (Conn c : conns.values()) closeQuietly(c.socket);
            conns.clear();
        }
    }

    private static void closeQuietly(Socket s) {
        try { s.close(); } catch (IOException ignored) { /* ignore */ }
    }

    private void acceptLoop() {
        long pause = 0; // after a failed accept (no file handles left, say): wait a little, longer each time, instead of spinning
        while (!closed) {
            final Socket s;
            try {
                s = server.accept();
                pause = 0;
            } catch (Throwable e) {
                if (closed || server.isClosed()) return;
                pause = pause == 0 ? 50 : Math.min(1000, pause * 2);
                try { Thread.sleep(pause); } catch (InterruptedException ie) { return; }
                continue;
            }
            final Conn c = new Conn(s);
            synchronized (conns) {
                if (conns.size() >= MAX_CONNECTIONS) {
                    // Full: make room. First the oldest connection that never sent the key, whatever it is doing
                    // (another app can hold connections open by sending slowly, or by asking for files and never
                    // reading the answers, which blocks the thread writing them). Then the oldest of the window's own
                    // connections that is only waiting. Connections from another app can't lock the window out.
                    Conn victim = null;
                    for (Conn old : conns.values()) if (!old.trusted) { victim = old; break; }
                    if (victim == null) for (Conn old : conns.values()) if (!old.busy) { victim = old; break; }
                    if (victim != null) {
                        conns.remove(victim.socket);
                        closeQuietly(victim.socket); // also ends a write that is stuck
                    }
                }
                if (conns.size() >= MAX_CONNECTIONS) {
                    closeQuietly(s);
                    continue;
                }
                conns.put(s, c);
            }
            try {
                pool.execute(new Runnable() {
                    @Override public void run() { serve(c); }
                });
            } catch (Throwable e) { // RejectedExecutionException: every thread is busy
                synchronized (conns) { conns.remove(s); }
                closeQuietly(s);
            }
        }
    }

    /** The socket's input, read no later than the current deadline allows (the socket timeout is set before each read). */
    private static final class DeadlineInput extends java.io.FilterInputStream {
        private final Socket socket;
        private long deadline;

        DeadlineInput(Socket s, InputStream in) {
            super(in);
            socket = s;
        }

        void within(long millis) { deadline = System.nanoTime() + millis * 1000000L; }

        private void arm() throws IOException {
            long left = (deadline - System.nanoTime()) / 1000000L;
            if (left <= 0) throw new SocketTimeoutException("too slow");
            socket.setSoTimeout((int) Math.min(Integer.MAX_VALUE, left));
        }

        @Override public int read() throws IOException { arm(); return super.read(); }

        @Override public int read(byte[] b, int off, int len) throws IOException { arm(); return super.read(b, off, len); }
    }

    // ------------------------------------------------------------------ one connection

    private static final class Request {
        String method, target, version, path, query;
        final Map<String, String> headers = new HashMap<String, String>();
        String header(String name) { return headers.get(name); }
    }

    private static final class Close extends Exception {
        Close() { super("bad request"); }
    }

    private void serve(Conn conn) {
        Socket s = conn.socket;
        try {
            s.setTcpNoDelay(true);
            DeadlineInput din = new DeadlineInput(s, s.getInputStream());
            InputStream in = new BufferedInputStream(din, 16384);
            OutputStream out = new BufferedOutputStream(s.getOutputStream(), 65536);
            while (!closed) {
                conn.busy = false;
                din.within(IDLE_MS);
                in.mark(1);
                if (in.read() < 0) break;
                in.reset();
                din.within(HEADERS_MS);
                Request r;
                try {
                    r = readRequest(in);
                } catch (Close c) {
                    sendPlain(out, 400, false);
                    out.flush();
                    break;
                }
                if (r == null) break;
                if (keyOk(r)) conn.trusted = true;
                conn.busy = true;
                din.within(BODY_MS);
                boolean keep = handle(r, in, out);
                out.flush();
                if (!keep) break;
            }
        } catch (SocketTimeoutException e) {
            // idle keep-alive connection, or a client too slow to send its request
        } catch (SocketException e) {
            // the page went away, or the connection was closed to make room
        } catch (IOException e) {
            if (debug) e.printStackTrace();
        } catch (Throwable e) {
            // never let one request take the whole app down (on Android an uncaught error ends the process)
            report("connection failed", e);
        } finally {
            synchronized (conns) { conns.remove(s); }
            closeQuietly(s);
        }
    }

    private static String readLine(InputStream in, int max) throws IOException, Close {
        ByteArrayOutputStream b = new ByteArrayOutputStream(128);
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (b.size() >= max) throw new Close();
            b.write(c);
        }
        if (c == -1 && b.size() == 0) return null;
        byte[] a = b.toByteArray();
        int n = a.length;
        if (n > 0 && a[n - 1] == '\r') n--;
        return new String(a, 0, n, "ISO-8859-1");
    }

    private static Request readRequest(InputStream in) throws IOException, Close {
        String line;
        do {
            line = readLine(in, 16384);
            if (line == null) return null;
        } while (line.isEmpty());
        int total = line.length();
        String[] parts = line.split(" ");
        if (parts.length != 3 || !parts[2].startsWith("HTTP/")) throw new Close();
        Request r = new Request();
        r.method = parts[0];
        r.target = parts[1];
        r.version = parts[2];
        int count = 0;
        while (true) {
            String h = readLine(in, 16384);
            if (h == null) throw new Close();
            if (h.isEmpty()) break;
            total += h.length() + 2;
            // a cap on all the headers together: 100 lines of 16 KB each, joined and copied over and over, could use up
            // the app's memory
            if (++count > MAX_HEADER_LINES || total > MAX_HEADER_BYTES) throw new Close();
            int i = h.indexOf(':');
            if (i <= 0) continue;
            String k = h.substring(0, i).trim().toLowerCase(Locale.ROOT);
            String v = h.substring(i + 1).trim();
            String old = r.headers.get(k);
            // the headers the checks rely on must come once; two of them is a trick, not a browser
            if (old != null && (k.equals("host") || k.equals("content-length") || k.equals("origin") || k.equals("sec-fetch-site")
                || k.equals("content-type") || k.equals("transfer-encoding"))) throw new Close();
            r.headers.put(k, old == null ? v : (k.equals("cookie") ? old + "; " + v : old + ", " + v));
        }
        String t = r.target;
        if (t.startsWith("http://") || t.startsWith("https://")) {
            int slash = t.indexOf('/', t.indexOf("//") + 2);
            t = slash < 0 ? "/" : t.substring(slash);
        }
        int hash = t.indexOf('#');
        if (hash >= 0) t = t.substring(0, hash);
        int qm = t.indexOf('?');
        r.path = qm < 0 ? t : t.substring(0, qm);
        r.query = qm < 0 ? "" : t.substring(qm + 1);
        return r;
    }

    private static byte[] readBody(InputStream in, long length) throws IOException {
        byte[] b = new byte[(int) length];
        int off = 0;
        while (off < b.length) {
            int n = in.read(b, off, b.length - off);
            if (n < 0) throw new IOException("body cut short");
            off += n;
        }
        return b;
    }

    /** Returns whether the connection can be used for another request. */
    private boolean handle(Request r, InputStream in, OutputStream out) throws IOException {
        boolean keep = r.version.equals("HTTP/1.1")
            ? !"close".equalsIgnoreCase(r.header("connection"))
            : "keep-alive".equalsIgnoreCase(r.header("connection"));
        if (r.header("transfer-encoding") != null) {
            sendPlain(out, 411, false); // the app always sends a length
            return false;
        }
        long length;
        try {
            String cl = r.header("content-length");
            length = cl == null || cl.isEmpty() ? 0 : Long.parseLong(cl.trim());
        } catch (NumberFormatException e) {
            length = -1;
        }
        if (length < 0) {
            sendPlain(out, 400, false);
            return false;
        }
        String m = r.method;
        if (m.equals("GET")) {
            if (length > 0) { // the app never sends one, and reading it would come before the key check
                sendPlain(out, 400, false);
                return false;
            }
            doGet(r, out, keep);
            return keep;
        }
        if (m.equals("POST") || m.equals("PUT")) {
            if (!hostOk(r) || !sameOrigin(r)) {
                sendPlain(out, 403, false);
                return false;
            }
            if (!keyOk(r)) { // the same answer as server.py, so the page can say how to get the key
                sendJson(out, 403, Json.obj("error", "no key"), false);
                return false;
            }
            // Requiring JSON also means a cross-site page would need a CORS preflight, which this server never grants.
            String ctype = r.header("content-type") == null ? "" : r.header("content-type").split(";")[0].trim().toLowerCase(Locale.ROOT);
            if (!ctype.equals("application/json")) {
                sendPlain(out, 415, false);
                return false;
            }
            if (length > Api.MAX_BODY) {
                sendPlain(out, 413, false);
                return false;
            }
            byte[] raw = readBody(in, length);
            doPost(r, raw, out, keep);
            return keep;
        }
        sendPlain(out, 501, false);
        return false;
    }

    private void doGet(Request r, OutputStream out, boolean keep) throws IOException {
        if (!hostOk(r)) { sendPlain(out, 403, keep); return; }
        String path = r.path;
        Map<String, String> q = parseQuery(r.query);
        if (path.equals("/__start")) {
            // The app's own window opens this address with a one-time start token; it gets the key as a cookie the API
            // checks from then on.
            String t = q.get("t");
            if (token != null && !useStartToken(t) && !(keyStarts && same(token, t))) { sendPlain(out, 403, keep); return; }
            Map<String, String> h = new LinkedHashMap<String, String>();
            h.put("Location", "/");
            if (token != null) h.put("Set-Cookie", COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Strict");
            send(out, 302, "text/plain; charset=utf-8", new byte[0], h, "no-store", keep);
            return;
        }
        boolean isApi = path.startsWith("/api/");
        if (isApi && !sameOrigin(r)) { sendPlain(out, 403, keep); return; }
        if (isApi && !keyOk(r)) { sendJson(out, 403, Json.obj("error", "no key"), keep); return; }
        try {
            if (path.equals("/api/userdata")) {
                sendJsonText(out, 200, api.readUserdataText(), keep);
                return;
            }
            if (isApi) {
                Api.Result res = api.get(path, q);
                if (res == null) { sendJson(out, 404, Json.obj("error", "unknown endpoint"), keep); return; }
                sendResult(r, out, res, keep);
                return;
            }
            String rel = staticPath(path);
            byte[] data = rel == null ? null : readStatic(rel);
            if (data == null) { sendPlain(out, 404, keep); return; }
            String ext = ext(rel);
            sendRange(r, out, data, MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream",
                ext.equals(".woff2") || ext.equals(".mp3") ? "max-age=86400" : "no-cache", keep);
        } catch (Api.BadRequest e) {
            sendJson(out, 400, Json.obj("error", "bad request: " + e.getMessage()), keep);
        } catch (Json.Error e) {
            sendJson(out, 400, Json.obj("error", "bad request: " + e.getMessage()), keep);
        } catch (SocketException e) {
            throw e;
        } catch (Exception e) {
            report("GET " + r.path + " failed", e);
            sendJson(out, 500, Json.obj("error", "server error"), keep);
        } catch (OutOfMemoryError e) {
            report("GET " + r.path + " ran out of memory", e);
            sendJson(out, 500, Json.obj("error", "out of memory"), false);
        }
    }

    private void doPost(Request r, byte[] raw, OutputStream out, boolean keep) throws IOException {
        try {
            Object body = raw.length == 0 ? null : Json.parse(new String(raw, "UTF-8"));
            Api.Result res = api.post(r.path, body);
            if (res == null) { sendJson(out, 404, Json.obj("error", "unknown endpoint"), keep); return; }
            sendResult(r, out, res, keep);
        } catch (Api.BadRequest e) {
            sendJson(out, 400, Json.obj("error", "bad request: " + e.getMessage()), keep);
        } catch (Json.Error e) {
            sendJson(out, 400, Json.obj("error", "bad request: " + e.getMessage()), keep);
        } catch (SocketException e) {
            throw e;
        } catch (Exception e) {
            report(r.method + " " + r.path + " failed", e);
            sendJson(out, 500, Json.obj("error", "server error"), keep);
        } catch (OutOfMemoryError e) {
            // a very large save on a phone with little memory: answer, so the page retries later, and close the connection
            report(r.method + " " + r.path + " ran out of memory", e);
            sendJson(out, 500, Json.obj("error", "out of memory"), false);
        }
    }

    private void sendResult(Request r, OutputStream out, Api.Result res, boolean keep) throws IOException {
        if (res.file != null) {
            byte[] data;
            try {
                data = Api.readBytes(res.file);
            } catch (IOException e) {
                sendPlain(out, 404, keep);
                return;
            }
            sendRange(r, out, data, res.mime, "max-age=86400", keep);
            return;
        }
        sendJson(out, res.status, res.json, keep);
    }

    // ------------------------------------------------------------------ checks

    private static boolean isLocalName(String name) {
        if (name.equalsIgnoreCase("localhost")) return true;
        if (name.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) {
            for (String p : name.split("\\.")) if (Integer.parseInt(p) > 255) return false;
            return true;
        }
        return name.indexOf(':') >= 0 && name.matches("[0-9a-fA-F:.]+(%[0-9a-zA-Z]+)?"); // an IPv6 address
    }

    /** Only answer requests addressed to this machine by IP or "localhost" (stops DNS rebinding). */
    private static boolean hostOk(Request r) {
        String host = r.header("host");
        if (host == null || host.trim().isEmpty()) return true;
        host = host.trim();
        String name;
        if (host.startsWith("[")) {
            int e = host.indexOf(']');
            name = e > 0 ? host.substring(1, e) : "";
        } else {
            int colons = host.length() - host.replace(":", "").length();
            name = colons == 1 ? host.substring(0, host.lastIndexOf(':')) : host;
        }
        return isLocalName(name);
    }

    /** Only this app's own page may use the API. */
    private static boolean sameOrigin(Request r) {
        String site = r.header("sec-fetch-site");
        if (site != null && !site.equals("same-origin") && !site.equals("none")) return false;
        String origin = r.header("origin");
        if (origin == null) return true;
        String host = r.header("host");
        return host != null && !host.isEmpty() && origin.equals("http://" + host);
    }

    private boolean keyOk(Request r) {
        if (token == null) return true;
        String c = r.header("cookie");
        if (c == null) return false;
        for (String part : c.split(";")) {
            int i = part.indexOf('=');
            if (i > 0 && part.substring(0, i).trim().equals(COOKIE) && same(token, part.substring(i + 1).trim())) return true;
        }
        return false;
    }

    private static boolean same(String a, String b) {
        if (a == null || b == null) return false;
        try {
            return MessageDigest.isEqual(a.getBytes("UTF-8"), b.getBytes("UTF-8"));
        } catch (java.io.UnsupportedEncodingException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ paths and queries

    /** A path inside web/, or null. Decodes %xx and refuses anything that could leave the folder. */
    static String staticPath(String urlPath) {
        String rel = unquote(urlPath, false);
        if (rel.indexOf('\0') >= 0 || rel.indexOf('\\') >= 0) return null;
        StringBuilder b = new StringBuilder();
        for (String seg : rel.split("/")) {
            if (seg.isEmpty() || seg.equals(".")) continue;
            if (seg.equals("..")) return null;
            if (b.length() > 0) b.append('/');
            b.append(seg);
        }
        return b.length() == 0 ? "index.html" : b.toString();
    }

    private byte[] readStatic(String rel) {
        if (!cacheStatic) return assets.read(rel);
        synchronized (staticCache) {
            if (staticCache.containsKey(rel)) return staticCache.get(rel);
        }
        byte[] data = assets.read(rel);
        if (data != null) synchronized (staticCache) { staticCache.put(rel, data); } // missing files are not remembered
        return data;
    }

    private static String ext(String rel) {
        int slash = rel.lastIndexOf('/'), dot = rel.lastIndexOf('.');
        return dot > slash ? rel.substring(dot).toLowerCase(Locale.ROOT) : "";
    }

    /** Like urllib.parse.parse_qs: '+' is a space, blank values are dropped, the last value wins. */
    static Map<String, String> parseQuery(String query) {
        Map<String, String> q = new HashMap<String, String>();
        if (query == null || query.isEmpty()) return q;
        for (String pair : query.split("&")) {
            int i = pair.indexOf('=');
            if (i < 0) continue;
            String k = unquote(pair.substring(0, i), true), v = unquote(pair.substring(i + 1), true);
            if (v.isEmpty()) continue;
            q.put(k, v);
        }
        return q;
    }

    static String unquote(String s, boolean plus) {
        if (s.indexOf('%') < 0 && (!plus || s.indexOf('+') < 0)) return s;
        ByteArrayOutputStream b = new ByteArrayOutputStream(s.length());
        int n = s.length();
        for (int i = 0; i < n; i++) {
            char c = s.charAt(i);
            if (c == '%' && i + 2 < n && hex(s.charAt(i + 1)) >= 0 && hex(s.charAt(i + 2)) >= 0) {
                b.write(hex(s.charAt(i + 1)) * 16 + hex(s.charAt(i + 2)));
                i += 2;
            } else if (c == '+' && plus) {
                b.write(' ');
            } else {
                byte[] u;
                try { u = String.valueOf(c).getBytes("UTF-8"); } catch (java.io.UnsupportedEncodingException e) { u = new byte[0]; }
                if (Character.isHighSurrogate(c) && i + 1 < n) {
                    try { u = s.substring(i, i + 2).getBytes("UTF-8"); } catch (java.io.UnsupportedEncodingException e) { u = new byte[0]; }
                    i++;
                }
                b.write(u, 0, u.length);
            }
        }
        try {
            return new String(b.toByteArray(), "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return s;
        }
    }

    private static int hex(char c) {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return -1;
    }

    // ------------------------------------------------------------------ responses

    private static String reason(int code) {
        switch (code) {
            case 200: return "OK";
            case 206: return "Partial Content";
            case 302: return "Found";
            case 400: return "Bad Request";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 409: return "Conflict";
            case 411: return "Length Required";
            case 413: return "Payload Too Large";
            case 415: return "Unsupported Media Type";
            case 416: return "Range Not Satisfiable";
            case 500: return "Internal Server Error";
            case 501: return "Not Implemented";
            case 503: return "Service Unavailable";
            default: return "Status";
        }
    }

    private void send(OutputStream out, int status, String ctype, byte[] body, Map<String, String> extra, String cache, boolean keep) throws IOException {
        StringBuilder h = new StringBuilder(512);
        h.append("HTTP/1.1 ").append(status).append(' ').append(reason(status)).append("\r\n");
        h.append("Server: Mikra/").append(Api.VERSION).append("\r\n");
        h.append("Content-Type: ").append(ctype).append("\r\n");
        h.append("Content-Length: ").append(body.length).append("\r\n");
        if (cache != null) h.append("Cache-Control: ").append(cache).append("\r\n");
        if (extra != null) for (Map.Entry<String, String> e : extra.entrySet()) h.append(e.getKey()).append(": ").append(e.getValue()).append("\r\n");
        for (String[] s : SECURITY_HEADERS) h.append(s[0]).append(": ").append(s[1]).append("\r\n");
        h.append("Connection: ").append(keep ? "keep-alive" : "close").append("\r\n");
        if (keep) h.append("Keep-Alive: timeout=").append(IDLE_MS / 1000 - 1).append("\r\n"); // reuse ends before we close it
        h.append("\r\n");
        out.write(h.toString().getBytes("UTF-8"));
        out.write(body);
    }

    private void sendPlain(OutputStream out, int status, boolean keep) throws IOException {
        send(out, status, "text/plain; charset=utf-8", (status + " " + reason(status)).getBytes("UTF-8"), null, "no-store", keep);
    }

    private void sendJson(OutputStream out, int status, Object obj, boolean keep) throws IOException {
        sendJsonText(out, status, Json.write(obj), keep);
    }

    private void sendJsonText(OutputStream out, int status, String json, boolean keep) throws IOException {
        send(out, status, "application/json; charset=utf-8", json.getBytes("UTF-8"), null, "no-store", keep);
    }

    /** A whole file, or the part the audio player asked for with a Range header. */
    private void sendRange(Request r, OutputStream out, byte[] data, String ctype, String cache, boolean keep) throws IOException {
        Map<String, String> h = new LinkedHashMap<String, String>();
        h.put("Accept-Ranges", "bytes");
        String range = r.header("range");
        if (range != null && range.startsWith("bytes=") && range.indexOf(',') < 0) {
            String spec = range.substring(6).trim();
            int dash = spec.indexOf('-');
            long len = data.length, start, end;
            try {
                if (dash < 0) throw new NumberFormatException();
                String a = spec.substring(0, dash).trim(), b = spec.substring(dash + 1).trim();
                if (a.isEmpty()) { // the last N bytes
                    long n = Long.parseLong(b);
                    start = Math.max(0, len - n);
                    end = len - 1;
                } else {
                    start = Long.parseLong(a);
                    end = b.isEmpty() ? len - 1 : Math.min(len - 1, Long.parseLong(b));
                }
            } catch (NumberFormatException e) {
                start = -1;
                end = -1;
            }
            if (start >= 0 && (start >= len || end < start)) {
                h.put("Content-Range", "bytes */" + len);
                send(out, 416, "text/plain; charset=utf-8", new byte[0], h, "no-store", keep);
                return;
            }
            if (start >= 0) {
                byte[] part = new byte[(int) (end - start + 1)];
                System.arraycopy(data, (int) start, part, 0, part.length);
                h.put("Content-Range", "bytes " + start + "-" + end + "/" + len);
                send(out, 206, ctype, part, h, cache, keep);
                return;
            }
        }
        send(out, 200, ctype, data, h, cache, keep);
    }

    static final class FolderAssets implements Assets {
        private final File root;
        FolderAssets(File root) { this.root = root; }
        @Override public byte[] read(String rel) {
            try {
                File f = new File(root, rel);
                String base = root.getCanonicalPath() + File.separator;
                if (!f.getCanonicalPath().startsWith(base) || !f.isFile()) return null;
                return Api.readBytes(f);
            } catch (IOException e) {
                return null;
            }
        }
    }
}
