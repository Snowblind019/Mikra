package io.github.snowblind019.mikra;

import android.content.Context;
import android.content.pm.PackageInfo;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.SecureRandom;

/**
 * The parts that live as long as the app's process: the database, the phone's voice and the little web server
 * the app's window talks to. Started once; the window can come and go.
 */
final class Engine {
    private Engine() {}

    static final int PREFERRED_PORT = 8723; // a fixed port keeps the page's own storage from one start to the next

    static volatile Http http;
    static Api api;
    static volatile PhoneTts tts;
    static volatile String token;
    static volatile int port;

    static synchronized void start(final Context ctx) throws Exception {
        if (http != null) return;
        File db = ensureDatabase(ctx);
        tts = new PhoneTts(ctx);
        // userdata.json stays in files/ (Android may copy it to the cloud); the daily copies stay on the phone only
        api = new Api(new AndroidDb(db.getPath()), tts, ctx.getFilesDir(), new File(ctx.getNoBackupFilesDir(), "backups"), "Android");
        Assets assets = new Assets() {
            @Override public byte[] read(String rel) {
                InputStream in = null;
                try {
                    in = ctx.getAssets().open("web/" + rel);
                    return Api.readAll(in);
                } catch (FileNotFoundException e) {
                    return null;
                } catch (IOException e) {
                    return null;
                } finally {
                    if (in != null) try { in.close(); } catch (IOException ignored) { /* ignore */ }
                }
            }
        };
        byte[] r = new byte[24];
        new SecureRandom().nextBytes(r);
        StringBuilder b = new StringBuilder();
        for (byte x : r) b.append(String.format("%02x", x & 0xff));
        token = b.toString();
        Http h = new Http(api, assets, token, true);
        port = h.start(PREFERRED_PORT, 20);
        http = h;
    }

    static boolean ready() { return http != null; } // never waits: the UI thread asks while start() may still be copying

    /**
     * SQLite can't read a file inside the APK, so the database is copied out once (and again after each app update).
     * It goes to the no-backup folder: Android's cloud backup has a size limit and the file comes with the app anyway.
     */
    static File ensureDatabase(Context ctx) throws IOException {
        File dir = ctx.getNoBackupFilesDir();
        File db = new File(dir, "mikra.db");
        File marker = new File(dir, "mikra.db.version");
        String stamp;
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            stamp = pi.versionCode + "-" + pi.lastUpdateTime;
        } catch (Exception e) {
            stamp = "unknown";
        }
        if (db.isFile() && marker.isFile() && stamp.equals(new String(Api.readBytes(marker), "UTF-8").trim())) return db;
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("could not create " + dir);
        db.delete(); // an older copy (before an update) only takes up room now
        if (dir.getUsableSpace() < 70L * 1024 * 1024) throw new IOException("not enough free space on the phone (about 70 MB is needed)");
        File tmp = new File(dir, "mikra.db.part");
        InputStream in = ctx.getAssets().open("mikra.db");
        try {
            FileOutputStream out = new FileOutputStream(tmp);
            try {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                out.flush();
                out.getFD().sync();
            } finally {
                out.close();
            }
        } finally {
            in.close();
        }
        db.delete();
        new File(dir, "mikra.db-journal").delete();
        if (!tmp.renameTo(db)) throw new IOException("could not move the database into place");
        FileOutputStream m = new FileOutputStream(marker);
        try {
            m.write(stamp.getBytes("UTF-8"));
        } finally {
            m.close();
        }
        return db;
    }
}
