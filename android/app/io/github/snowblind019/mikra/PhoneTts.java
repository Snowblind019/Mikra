package io.github.snowblind019.mikra;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import java.io.File;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/**
 * Pronunciation with the phone's own text-to-speech. Tries the Google engine first (it has Hebrew),
 * then the phone's default engine, then any other installed engine, and keeps the first one that speaks Hebrew.
 * Clips are written to WAV files in the app's cache, so a word plays instantly the second time.
 */
final class PhoneTts implements Speech {
    private static final String TAG = "MikraTts";
    private static final String GOOGLE = "com.google.android.tts";
    private static final Locale HEBREW = new Locale("he", "IL");
    private static final Pattern CANT = Pattern.compile("[֑-ֽ֯׀׃-׆]");

    private final Context ctx;
    private final File cache;
    // Engine calls (binding, isLanguageAvailable, setVoice, shutdown) can block for a while: they run on their own thread.
    private final Handler main;
    private final AtomicLong requests = new AtomicLong();
    private volatile String latestText = "";
    private volatile boolean recheckOnReturn;
    private final Object speakLock = new Object();
    private final Map<String, CountDownLatch> waiting = new HashMap<String, CountDownLatch>();
    private final Map<String, Boolean> failed = new HashMap<String, Boolean>();

    // state, guarded by "this"
    private TextToSpeech tts;          // the engine in use (ready) or being tried
    private String engine = "";        // its package
    private String engineLabel = "";
    private String voiceName = "";
    private String state = "starting"; // starting, ready, missing-data, no-hebrew, no-engine
    private String missingEngine = null, missingLabel = null;
    private List<String> candidates = new ArrayList<String>();
    private int tryIndex = 0;
    private int generation = 0;
    private volatile CountDownLatch readyLatch = new CountDownLatch(1);
    private int writes = 0;

    PhoneTts(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        this.cache = new File(this.ctx.getCacheDir(), "tts");
        HandlerThread t = new HandlerThread("mikra-tts");
        t.start();
        main = new Handler(t.getLooper());
        restart();
    }

    /** Looks for a Hebrew voice again (after the user installed one). */
    void restart() {
        main.post(new Runnable() {
            @Override public void run() { begin(); }
        });
    }

    /** The user went to the phone's voice settings: look again when the app comes back, if there was no voice. */
    void recheckOnReturn() { recheckOnReturn = true; }

    synchronized void returned() {
        if (!recheckOnReturn) return;
        recheckOnReturn = false;
        if (!"ready".equals(state) && !"starting".equals(state)) restart();
    }

    private synchronized void begin() {
        generation++;
        if (tts != null) {
            try { tts.shutdown(); } catch (RuntimeException ignored) { /* ignore */ }
            tts = null;
        }
        if (readyLatch.getCount() == 0) readyLatch = new CountDownLatch(1);
        state = "starting";
        missingEngine = null;
        missingLabel = null;
        candidates = engines();
        tryIndex = 0;
        if (candidates.isEmpty()) {
            state = "no-engine";
            readyLatch.countDown();
            return;
        }
        tryNext();
    }

    /** Installed engines, best first: Google, then the phone's default, then the rest. */
    private List<String> engines() {
        List<String> out = new ArrayList<String>();
        try {
            List<ResolveInfo> list = ctx.getPackageManager().queryIntentServices(new Intent("android.intent.action.TTS_SERVICE"), 0);
            List<String> all = new ArrayList<String>();
            if (list != null) for (ResolveInfo r : list) if (r.serviceInfo != null) all.add(r.serviceInfo.packageName);
            String def = null;
            try { def = Settings.Secure.getString(ctx.getContentResolver(), "tts_default_synth"); } catch (RuntimeException ignored) { /* ignore */ }
            if (all.contains(GOOGLE)) out.add(GOOGLE);
            if (def != null && all.contains(def) && !out.contains(def)) out.add(def);
            for (String p : all) if (!out.contains(p)) out.add(p);
        } catch (RuntimeException e) {
            Log.w(TAG, "could not list engines", e);
        }
        if (out.isEmpty()) out.add(""); // let TextToSpeech pick its default
        return out;
    }

    private synchronized void tryNext() {
        if (tryIndex >= candidates.size()) {
            // nothing speaks Hebrew yet: keep the engine that only needs its Hebrew data downloaded, for the message
            state = missingEngine != null ? "missing-data" : "no-hebrew";
            if (missingLabel != null) engineLabel = missingLabel;
            readyLatch.countDown();
            return;
        }
        final String pkg = candidates.get(tryIndex++);
        final int gen = generation;
        final TextToSpeech[] holder = new TextToSpeech[1];
        TextToSpeech.OnInitListener onInit = new TextToSpeech.OnInitListener() {
            @Override public void onInit(final int status) {
                // the engine may call this before the constructor has returned
                main.post(new Runnable() {
                    @Override public void run() { initDone(gen, pkg, holder[0], status); }
                });
            }
        };
        try {
            holder[0] = pkg.isEmpty() ? new TextToSpeech(ctx, onInit) : new TextToSpeech(ctx, onInit, pkg);
            tts = holder[0];
        } catch (RuntimeException e) {
            Log.w(TAG, "engine failed to start: " + pkg, e);
            tryNext();
            return;
        }
        // an engine that never answers must not leave the voice "starting" for good
        final int tryNo = tryIndex;
        main.postDelayed(new Runnable() {
            @Override public void run() { initTimeout(gen, tryNo, holder[0]); }
        }, 6000);
    }

    private synchronized void initTimeout(int gen, int tryNo, TextToSpeech t) {
        if (gen != generation || tryNo != tryIndex || !"starting".equals(state) || tts != t) return;
        Log.w(TAG, "engine did not answer: " + candidates.get(tryNo - 1));
        try { t.shutdown(); } catch (RuntimeException ignored) { /* ignore */ }
        tts = null;
        tryNext();
    }

    private synchronized void initDone(int gen, String pkg, TextToSpeech t, int status) {
        if (gen != generation || t == null) {
            if (t != null && t != tts) try { t.shutdown(); } catch (RuntimeException ignored) { /* ignore */ }
            return;
        }
        String label = labelOf(pkg);
        int lang = TextToSpeech.LANG_NOT_SUPPORTED;
        if (status == TextToSpeech.SUCCESS) {
            try { lang = t.isLanguageAvailable(HEBREW); } catch (RuntimeException e) { lang = TextToSpeech.LANG_NOT_SUPPORTED; }
        }
        if (status == TextToSpeech.SUCCESS && lang >= TextToSpeech.LANG_AVAILABLE) {
            try {
                t.setLanguage(HEBREW);
                Voice v = pickVoice(t);
                if (v != null) t.setVoice(v);
                voiceName = v != null ? v.getName() : "";
            } catch (RuntimeException e) {
                Log.w(TAG, "could not set Hebrew", e);
            }
            t.setOnUtteranceProgressListener(new Listener());
            engine = pkg.isEmpty() ? safeDefaultEngine(t) : pkg;
            engineLabel = labelOf(engine);
            state = "ready";
            readyLatch.countDown();
            return;
        }
        if (status == TextToSpeech.SUCCESS && lang == TextToSpeech.LANG_MISSING_DATA && missingEngine == null) {
            missingEngine = pkg;
            missingLabel = label;
        }
        try { t.shutdown(); } catch (RuntimeException ignored) { /* ignore */ }
        if (tts == t) tts = null;
        tryNext();
    }

    private static String safeDefaultEngine(TextToSpeech t) {
        try { return t.getDefaultEngine(); } catch (RuntimeException e) { return ""; }
    }

    /** A Hebrew voice that is installed on the phone (works offline), if the engine lists one. */
    private static Voice pickVoice(TextToSpeech t) {
        Set<Voice> voices;
        try { voices = t.getVoices(); } catch (RuntimeException e) { return null; }
        if (voices == null) return null;
        List<Voice> heb = new ArrayList<Voice>();
        for (Voice v : voices) {
            try {
                if (v == null || v.getLocale() == null || !"heb".equals(v.getLocale().getISO3Language())) continue;
                Set<String> f = v.getFeatures();
                if (f != null && f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                heb.add(v);
            } catch (RuntimeException ignored) { /* skip odd voices */ }
        }
        if (heb.isEmpty()) return null;
        Voice[] arr = heb.toArray(new Voice[0]);
        Arrays.sort(arr, new Comparator<Voice>() {
            @Override public int compare(Voice a, Voice b) {
                int c = Boolean.compare(a.isNetworkConnectionRequired(), b.isNetworkConnectionRequired()); // offline first
                if (c != 0) return c;
                c = Integer.compare(b.getQuality(), a.getQuality());
                return c != 0 ? c : a.getName().compareTo(b.getName());
            }
        });
        return arr[0];
    }

    private String labelOf(String pkg) {
        if (pkg == null || pkg.isEmpty()) return "";
        try {
            PackageManager pm = ctx.getPackageManager();
            return String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
        } catch (Exception e) {
            return pkg;
        }
    }

    private final class Listener extends UtteranceProgressListener {
        @Override public void onStart(String id) { }
        @Override public void onDone(String id) { finish(id, false); }
        @Override @Deprecated public void onError(String id) { finish(id, true); }
        @Override public void onError(String id, int code) { finish(id, true); }
        @Override public void onStop(String id, boolean interrupted) { finish(id, true); } // the engine was shut down mid-way
    }

    private void finish(String id, boolean error) {
        synchronized (waiting) {
            if (error) failed.put(id, Boolean.TRUE);
            CountDownLatch l = waiting.get(id);
            if (l != null) l.countDown();
        }
    }

    // ------------------------------------------------------------------ Speech

    @Override public synchronized boolean available() { return "ready".equals(state); }

    @Override public synchronized Map<String, Object> status() {
        String msg;
        if ("ready".equals(state)) msg = "Hebrew voice ready: " + engineLabel;
        else if ("starting".equals(state)) msg = "starting the phone's text-to-speech";
        else if ("missing-data".equals(state)) msg = "the Hebrew voice of " + engineLabel + " is not downloaded yet";
        else if ("no-engine".equals(state)) msg = "this phone has no text-to-speech engine";
        else msg = "no Hebrew voice on this phone";
        return Json.obj("engine", "android", "ok", "ready".equals(state), "state", state, "engineLabel", engineLabel,
            "voice", voiceName, "voices", new HashMap<String, Object>(), "message", msg);
    }

    static String clean(String text) {
        String t = CANT.matcher(text).replaceAll("");
        t = t.replace('־', ' ').replace("/", "").replace("\\", "");
        t = t.replaceAll("\\s+", " ").trim();
        return t.length() > 600 ? t.substring(0, 600) : t;
    }

    @Override public File synthesize(String text, String voice, String rate) throws Failed {
        text = clean(text == null ? "" : text);
        if (text.isEmpty()) throw new Failed("empty text");
        if (rate == null || !rate.matches("^[+-]\\d{1,2}%$")) rate = "+0%";
        try {
            readyLatch.await(8, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        // a word tapped after this one makes this one pointless (the page has already stopped waiting for it)
        final long mine = requests.incrementAndGet();
        latestText = text;
        TextToSpeech t;
        String eng, vn;
        synchronized (this) {
            if (!"ready".equals(state) || tts == null) throw new Failed("no Hebrew voice on this phone (" + state + ")");
            t = tts;
            eng = engine;
            vn = voiceName;
        }
        String key = sha1(eng + "|" + vn + "|" + rate + "|" + text);
        File dir = new File(cache, key.substring(0, 2));
        File out = new File(dir, key + ".wav");
        if (out.isFile() && out.length() > 44) return out;
        synchronized (speakLock) {
            if (out.isFile() && out.length() > 44) return out;
            if (requests.get() != mine && !text.equals(latestText)) throw new Failed("skipped: a newer word was asked for");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new Failed("could not create the audio folder");
            File tmp = new File(dir, key + ".part");
            tmp.delete();
            CountDownLatch done = new CountDownLatch(1);
            String id = key + "-" + System.nanoTime();
            synchronized (waiting) { waiting.put(id, done); }
            try {
                float speed = 1f + Integer.parseInt(rate.replace("%", "").replace("+", "")) / 100f;
                t.setSpeechRate(Math.max(0.3f, speed));
                Bundle params = new Bundle();
                int r = t.synthesizeToFile(text, params, tmp, id);
                if (r != TextToSpeech.SUCCESS) throw new Failed("the phone's voice refused the text");
                if (!done.await(20, TimeUnit.SECONDS)) throw new Failed("the phone's voice did not answer");
                boolean err;
                synchronized (waiting) { err = failed.remove(id) != null; }
                if (err || !tmp.isFile() || tmp.length() <= 44) throw new Failed("the phone's voice could not read this");
                if (!tmp.renameTo(out)) throw new Failed("could not save the audio");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new Failed("interrupted");
            } catch (RuntimeException e) {
                Log.w(TAG, "synthesis failed", e);
                throw new Failed("the phone's voice failed: " + e.getClass().getSimpleName());
            } finally {
                synchronized (waiting) { waiting.remove(id); failed.remove(id); }
                tmp.delete();
            }
            if (++writes % 50 == 0) prune();
            return out;
        }
    }

    /** Keeps the cache to a few thousand clips; Android may also clear it when space runs low. */
    private void prune() {
        List<File> all = new ArrayList<File>();
        File[] dirs = cache.listFiles();
        if (dirs == null) return;
        for (File d : dirs) {
            File[] fs = d.listFiles();
            if (fs != null) all.addAll(Arrays.asList(fs));
        }
        if (all.size() <= 4000) return;
        File[] arr = all.toArray(new File[0]);
        Arrays.sort(arr, new Comparator<File>() {
            @Override public int compare(File a, File b) { return Long.compare(a.lastModified(), b.lastModified()); }
        });
        for (int i = 0; i < arr.length - 3000; i++) arr[i].delete();
    }

    private static String sha1(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"));
            StringBuilder b = new StringBuilder();
            for (byte x : d) b.append(String.format(Locale.ROOT, "%02x", x));
            return b.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode()) + "00";
        }
    }

    @Override public String mime() { return "audio/wav"; }

    @Override public File cacheDir() { return cache; }

    @Override public String cacheExt() { return ".wav"; }

    @Override public String prefetchRefusal() { return "not needed on the phone: its voice works offline"; }
}
