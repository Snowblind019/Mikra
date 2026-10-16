package io.github.snowblind019.mikra;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

/**
 * Desktop test harness: runs the Java server (the one inside the Android app) on a computer, so the browser tests
 * written for server.py can check it. Not part of the APK.
 *   java -cp out:sqlite-jdbc.jar io.github.snowblind019.mikra.DesktopMain --port 8851 --root . --data /tmp/mikra-data [--key SECRET] [--platform Android]
 */
public final class DesktopMain {
    public static void main(String[] args) throws Exception {
        Map<String, String> a = new HashMap<String, String>();
        for (int i = 0; i + 1 < args.length; i += 2) a.put(args[i], args[i + 1]);
        File root = new File(a.containsKey("--root") ? a.get("--root") : ".");
        File data = new File(a.containsKey("--data") ? a.get("--data") : System.getProperty("user.home") + "/.local/share/mikra-java");
        int port = Integer.parseInt(a.containsKey("--port") ? a.get("--port") : "8723");
        data.mkdirs();
        final File cache = new File(data, "audio-cache");
        Speech none = new Speech() {
            public boolean available() { return false; }
            public Map<String, Object> status() {
                return Json.obj("engine", null, "ok", false, "voices", Json.obj("he-IL-AvriNeural", "Avri (male)", "he-IL-HilaNeural", "Hila (female)"),
                    "message", "no speech engine in the desktop test harness");
            }
            public File synthesize(String text, String voice, String rate) throws Failed { throw new Failed("edge-tts not installed"); }
            public String mime() { return "audio/mpeg"; }
            public File cacheDir() { return cache; }
            public String cacheExt() { return ".mp3"; }
            public String prefetchRefusal() { return "edge-tts is not installed"; }
        };
        Api api = new Api(new JdbcDb(new File(root, "data/mikra.db").getPath()), none, data, a.containsKey("--platform") ? a.get("--platform") : "Linux");
        Http.FolderAssets web = new Http.FolderAssets(new File(root, "web"));
        api.setLessonSource(web);
        Http http = new Http(api, web, a.get("--key"), false);
        http.debug = true;
        http.keyStarts = true; // the tests open /__start?t=KEY, like the link the desktop app prints
        int p = http.start(port, 1);
        System.out.println("Mikra (Java) is running at http://localhost:" + p + "/");
        Thread.currentThread().join();
    }
}
