package io.github.snowblind019.mikra;

import java.io.File;
import java.util.Map;

/** Pronunciation audio. On the phone this is Android's text-to-speech; the desktop test harness has none. */
interface Speech {
    final class Failed extends Exception {
        Failed(String msg) { super(msg); }
    }

    boolean available();

    /** Shown in Settings, Audio. Always has "engine", "ok", "message" and "voices". */
    Map<String, Object> status();

    /** A cached audio file for this text, made now if needed. rate is like "+0%" or "-35%". */
    File synthesize(String text, String voice, String rate) throws Failed;

    String mime();

    File cacheDir();

    String cacheExt();

    /** Why the "download all audio" box can't be used, or null when it can. */
    String prefetchRefusal();
}
