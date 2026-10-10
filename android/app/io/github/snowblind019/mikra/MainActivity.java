package io.github.snowblind019.mikra;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;
import java.util.Locale;

/** The app's window: a full-screen web view showing the same pages as the desktop app, served by {@link Engine}. */
public final class MainActivity extends Activity {
    private static final String TAG = "Mikra";
    private static final int REQ_OPEN = 1, REQ_SAVE = 2;
    private static final int PAPER = 0xFFF0F1EB, SURFACE = 0xFFF8F8F4, INK = 0xFF1D2733; // the Stone theme
    private static final int LIGHT_STATUS = 0x2000, LIGHT_NAV = 0x10; // View.SYSTEM_UI_FLAG_LIGHT_*

    private FrameLayout root;
    private WebView web;
    private TextView splash;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSave;
    private boolean romanian;
    private volatile boolean starting;
    private boolean resumed, rebuildOnResume;
    private long[] crashTimes = new long[3];
    private int crashCount;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        String lang = Locale.getDefault().getLanguage();
        romanian = "ro".equals(lang) || "mo".equals(lang);
        applyBars(PAPER, SURFACE, false);
        root = new FrameLayout(this);
        root.setBackgroundColor(PAPER);
        web = makeWebView();
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        splash = new TextView(this);
        splash.setGravity(Gravity.CENTER);
        splash.setTextColor(INK);
        splash.setBackgroundColor(PAPER);
        splash.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        int pad = (int) (28 * getResources().getDisplayMetrics().density);
        splash.setPadding(pad, pad, pad, pad);
        splash.setText(romanian ? "Mikra\n\nSe pregătește textul Bibliei…" : "Mikra\n\nGetting the Bible text ready…");
        root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        startEngine();
    }

    private void startEngine() {
        if (starting) return;
        starting = true;
        final android.content.Context app = getApplicationContext();
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                try {
                    Engine.start(app);
                    starting = false;
                    runOnUiThread(new Runnable() {
                        @Override public void run() { load(); }
                    });
                } catch (final Throwable e) {
                    starting = false;
                    Log.e(TAG, "could not start", e);
                    runOnUiThread(new Runnable() {
                        @Override public void run() {
                            splash.setText((romanian ? "Mikra nu a putut porni:\n\n" : "Mikra could not start:\n\n") + e.getMessage());
                            splash.setVisibility(View.VISIBLE);
                        }
                    });
                }
            }
        }, "mikra-start");
        t.start();
    }

    private void load() {
        if (web != null && Engine.ready()) web.loadUrl("http://127.0.0.1:" + Engine.port + "/__start?t=" + Engine.token);
    }

    private boolean isOwn(String url) {
        return url != null && url.startsWith("http://127.0.0.1:" + Engine.port + "/");
    }

    private WebView makeWebView() {
        WebView w = new WebView(this);
        w.setBackgroundColor(PAPER);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(false);
        s.setSupportZoom(false);
        w.addJavascriptInterface(new Bridge(), "MikraAndroid");
        w.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (isOwn(url)) return false;
                // links to other sites open in the phone's browser; only web and mail links leave the app
                // (not intent:, content:, file:, javascript: ...)
                try {
                    Uri uri = Uri.parse(url);
                    String scheme = uri.getScheme();
                    if (scheme != null) {
                        scheme = scheme.toLowerCase(Locale.ROOT);
                        if (scheme.equals("https") || scheme.equals("http") || scheme.equals("mailto")) {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        }
                    }
                } catch (Exception ignored) { /* no browser */ }
                return true;
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (isOwn(url) && !url.contains("/__start")) splash.setVisibility(View.GONE);
            }

            // Android 8 and newer: the page's process was stopped (often to free memory). Without this the whole app would close.
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.w(TAG, "web page process gone");
                if (view != web) return true; // an old one, already replaced
                dropWebView();
                long now = System.currentTimeMillis();
                crashTimes[crashCount++ % crashTimes.length] = now;
                boolean looping = crashCount >= crashTimes.length && now - crashTimes[crashCount % crashTimes.length] < 60000;
                if (looping) {
                    splash.setText(romanian ? "Pagina aplicației se tot oprește. Închide aplicația și deschide-o din nou."
                        : "The app's page keeps stopping. Close the app and open it again.");
                    splash.setVisibility(View.VISIBLE);
                } else if (resumed) {
                    rebuildWebView();
                } else {
                    rebuildOnResume = true; // in the background: wait until the app is shown again
                }
                return true;
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*"); // backups are .json files, which many phones label as unknown type
                try {
                    startActivityForResult(Intent.createChooser(i, romanian ? "Alege copia de siguranță" : "Choose the backup file"), REQ_OPEN);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                fileCallback = callback;
                return true;
            }

            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                Log.d(TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        return w;
    }

    private void dropWebView() {
        if (web != null) {
            root.removeView(web);
            try { web.destroy(); } catch (RuntimeException ignored) { /* already gone */ }
            web = null;
        }
    }

    private void rebuildWebView() {
        dropWebView();
        web = makeWebView();
        root.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        load();
    }

    private void applyBars(int top, int bottom, boolean dark) {
        Window w = getWindow();
        w.setStatusBarColor(top);
        w.setNavigationBarColor(bottom);
        View d = w.getDecorView();
        int f = d.getSystemUiVisibility();
        f = dark ? f & ~LIGHT_STATUS : f | LIGHT_STATUS;
        if (Build.VERSION.SDK_INT >= 26) f = dark ? f & ~LIGHT_NAV : f | LIGHT_NAV;
        d.setSystemUiVisibility(f);
        if (root != null) root.setBackgroundColor(top);
    }

    // ------------------------------------------------------------------ lifecycle

    @Override public void onBackPressed() {
        if (web == null || splash.getVisibility() == View.VISIBLE) {
            moveTaskToBack(true);
            return;
        }
        // the page closes what is open (menu, dialog, word panel) or goes back to Today; at Today the app steps aside
        web.evaluateJavascript("(function(){try{return window.mikraBack&&window.mikraBack()?1:0}catch(e){return 0}})()",
            new ValueCallback<String>() {
                @Override public void onReceiveValue(String v) {
                    if (!"1".equals(v)) moveTaskToBack(true);
                }
            });
    }

    @Override protected void onPause() {
        resumed = false;
        if (web != null) {
            web.evaluateJavascript("window.mikraFlush&&window.mikraFlush()", null); // save now, the app may be closed next
            web.onPause();
        }
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        if (rebuildOnResume) {
            rebuildOnResume = false;
            rebuildWebView();
        } else if (web != null) {
            web.onResume();
        }
        // a start that failed (no free space, say) is tried again when the app is opened again
        if (!Engine.ready() && !starting) {
            splash.setText(romanian ? "Mikra\n\nSe pregătește textul Bibliei…" : "Mikra\n\nGetting the Bible text ready…");
            startEngine();
        }
        // the user may have just installed a Hebrew voice in the phone's settings
        PhoneTts t = Engine.tts;
        if (t != null) t.returned();
    }

    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        if (web != null) web.evaluateJavascript("window.mikraSystemDarkChanged&&window.mikraSystemDarkChanged()", null);
    }

    @Override protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_OPEN) {
            if (fileCallback != null) fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        } else if (request == REQ_SAVE) {
            String text = pendingSave;
            pendingSave = null;
            if (result != RESULT_OK || data == null || data.getData() == null || text == null) return;
            try {
                OutputStream out = getContentResolver().openOutputStream(data.getData());
                if (out == null) throw new java.io.IOException("the phone could not open the file");
                try {
                    out.write(text.getBytes("UTF-8"));
                } finally {
                    out.close();
                }
                Toast.makeText(this, romanian ? "Fișierul a fost salvat" : "File saved", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, (romanian ? "Nu s-a putut salva: " : "Could not save: ") + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    // ------------------------------------------------------------------ what the page can ask the app

    public final class Bridge {
        /** Saves a backup or word list in Downloads. Returns "ok:NAME", "picker" (the phone asks where) or "error:WHY". */
        @JavascriptInterface public String saveFile(String name, String mime, String text) {
            if (text == null) return "error:nothing to save";
            name = name == null ? "mikra.txt" : name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_");
            if (mime == null || mime.isEmpty()) mime = "application/octet-stream";
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    Uri coll = (Uri) Class.forName("android.provider.MediaStore$Downloads").getField("EXTERNAL_CONTENT_URI").get(null);
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put("_display_name", name);
                    v.put("mime_type", mime);
                    v.put("relative_path", "Download/");
                    v.put("is_pending", 1);
                    Uri uri = cr.insert(coll, v);
                    if (uri == null) return "error:the phone refused to create the file";
                    try {
                        OutputStream out = cr.openOutputStream(uri);
                        if (out == null) throw new java.io.IOException("the phone could not open the file");
                        try {
                            out.write(text.getBytes("UTF-8"));
                        } finally {
                            out.close();
                        }
                    } catch (Exception e) {
                        // don't leave an empty, half-made file behind in Downloads
                        try { cr.delete(uri, null, null); } catch (RuntimeException ignored) { /* nothing more to do */ }
                        throw e;
                    }
                    ContentValues done = new ContentValues();
                    done.put("is_pending", 0);
                    cr.update(uri, done, null, null);
                    // a second file with the same name is saved as "name (1)": report the name it really got
                    String shown = name;
                    android.database.Cursor c = null;
                    try {
                        c = cr.query(uri, new String[]{"_display_name"}, null, null, null);
                        if (c != null && c.moveToFirst() && c.getString(0) != null) shown = c.getString(0);
                    } catch (RuntimeException ignored) { /* keep the asked-for name */
                    } finally {
                        if (c != null) c.close();
                    }
                    return "ok:" + shown;
                } catch (Exception e) {
                    Log.w(TAG, "save failed", e);
                    return "error:" + e.getMessage();
                }
            }
            // Android 9 and older: the phone asks where to save it
            final String n = name, m = mime;
            pendingSave = text;
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(m);
                    i.putExtra(Intent.EXTRA_TITLE, n);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        pendingSave = null;
                        Toast.makeText(MainActivity.this, "No file manager found", Toast.LENGTH_LONG).show();
                    }
                }
            });
            return "picker";
        }

        @JavascriptInterface public boolean copyText(String text) {
            try {
                android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm == null || text == null) return false;
                cm.setPrimaryClip(android.content.ClipData.newPlainText("Mikra", text));
                return true;
            } catch (RuntimeException e) {
                return false;
            }
        }

        @JavascriptInterface public void openTtsSettings() {
            PhoneTts t = Engine.tts;
            if (t != null) t.recheckOnReturn();
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    String[] actions = {"com.android.settings.TTS_SETTINGS", TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA, Settings.ACTION_SETTINGS};
                    for (String a : actions) {
                        try {
                            startActivity(new Intent(a));
                            return;
                        } catch (Exception ignored) { /* try the next one */ }
                    }
                }
            });
        }

        @JavascriptInterface public void restartTts() {
            PhoneTts t = Engine.tts;
            if (t != null) t.restart();
        }

        /** The page's colors for the status bar (top) and the navigation bar (bottom). */
        @JavascriptInterface public void setBars(final String top, final String bottom, final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try {
                        applyBars(Color.parseColor(top.trim()), Color.parseColor(bottom.trim()), dark);
                    } catch (RuntimeException ignored) { /* not a color Android knows */ }
                }
            });
        }

        @JavascriptInterface public boolean systemDark() {
            return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        }
    }
}
