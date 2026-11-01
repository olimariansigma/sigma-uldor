package com.wreckingyard.game;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Wrecking Yard launcher. Shows the launcher page (assets/launcher), which lists the game versions published as
 * GitHub releases. Versions are downloaded and unpacked into the app's private storage and started from there.
 * Every version runs from local files in the same WebView, so saves are shared between versions (and with the
 * old stand-alone app, which this launcher replaces).
 */
public class MainActivity extends Activity {
    private static final String REPO = "olimariansigma/sigma-uldor";
    private static final String API = "https://api.github.com/repos/" + REPO + "/releases?per_page=100";
    private static final String DL_PREFIX = "https://github.com/" + REPO + "/releases/download/";
    private static final String LAUNCHER_URL = "file:///android_asset/launcher/index.html";
    private static final Pattern SAFE = Pattern.compile("^[0-9A-Za-z.-]{1,32}$");

    private WebView web;
    private boolean inGame = false;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private File versionsDir() { File d = new File(getFilesDir(), "versions"); d.mkdirs(); return d; }
    private File versionDir(String v) { if (v == null || !SAFE.matcher(v).matches()) throw new IllegalArgumentException("bad version"); return new File(versionsDir(), v); }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        web = new WebView(this);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        web.setWebViewClient(new WebViewClient() {
            // only our own local pages load in the app; anything else opens in the browser
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String u = req.getUrl().toString();
                if (u.startsWith("file://")) return false;
                openExternal(u);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.setBackgroundColor(0xFF0F1114);
        web.addJavascriptInterface(new Bridge(), "WYAndroid");
        setContentView(web);
        hideSystemUi();
        web.loadUrl(LAUNCHER_URL);
    }

    private void openExternal(String u) {
        if (!u.startsWith("https://")) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); } catch (Exception ignored) { }
    }

    private void emit(JSONObject e) {
        final String js = "window.wyEvent && window.wyEvent(" + e.toString() + ")";
        ui.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "WreckingYard-Launcher");
        return c;
    }

    /** Methods the launcher page calls. Long work runs on background threads and reports back via wyEvent. */
    private class Bridge {
        @JavascriptInterface public String info() { return "{\"platform\":\"Android\",\"launcher\":\"1.0\"}"; }

        @JavascriptInterface public String installed() {
            JSONArray a = new JSONArray();
            File[] list = versionsDir().listFiles();
            if (list != null) for (File f : list) if (f.isDirectory() && SAFE.matcher(f.getName()).matches() && new File(f, "index.html").exists()) a.put(f.getName());
            return a.toString();
        }

        @JavascriptInterface public void releases() {
            new Thread(new Runnable() { @Override public void run() {
                JSONObject e = new JSONObject();
                try {
                    e.put("type", "releases");
                    HttpURLConnection c = open(API);
                    c.setRequestProperty("Accept", "application/vnd.github+json");
                    int code = c.getResponseCode();
                    if (code != 200) throw new Exception("GitHub answered " + code);
                    InputStream in = new BufferedInputStream(c.getInputStream());
                    java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                    byte[] b = new byte[16384]; int n;
                    while ((n = in.read(b)) > 0) bo.write(b, 0, n);
                    in.close();
                    e.put("ok", true); e.put("body", bo.toString("UTF-8"));
                } catch (Exception ex) {
                    try { e.put("ok", false); e.put("error", String.valueOf(ex.getMessage())); } catch (Exception ignored) { }
                }
                emit(e);
            } }).start();
        }

        @JavascriptInterface public void download(final String version, final String url) {
            new Thread(new Runnable() { @Override public void run() { doDownload(version, url); } }).start();
        }
        @JavascriptInterface public void remove(String version) { deleteTree(versionDir(version)); }

        @JavascriptInterface public void play(final String version) {
            final File index = new File(versionDir(version), "index.html");
            if (!index.exists()) return;
            ui.post(new Runnable() { @Override public void run() { inGame = true; web.loadUrl("file://" + index.getAbsolutePath()); } });
        }

        @JavascriptInterface public void openUrl(String url) { if (url != null && url.startsWith("https://github.com/")) openExternal(url); }
    }

    private void doDownload(String version, String url) {
                JSONObject done = new JSONObject();
                File zip = null, tmp = null;
                try {
                    done.put("type", "done"); done.put("version", version);
                    if (url == null || !url.startsWith(DL_PREFIX)) throw new Exception("unexpected download address");
                    File dir = versionDir(version);
                    zip = new File(getCacheDir(), "dl-" + version + ".zip");
                    tmp = new File(versionsDir(), ".unpack-" + version);
                    HttpURLConnection c = open(url);
                    if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                    long total = c.getContentLengthLong(), got = 0, last = 0;
                    InputStream in = new BufferedInputStream(c.getInputStream());
                    OutputStream out = new FileOutputStream(zip);
                    try {
                        byte[] b = new byte[65536]; int n;
                        while ((n = in.read(b)) > 0) {
                            out.write(b, 0, n); got += n;
                            long now = System.currentTimeMillis();
                            if (now - last > 150) { last = now; JSONObject p = new JSONObject(); p.put("type", "progress"); p.put("version", version); p.put("got", got); p.put("total", total); emit(p); }
                        }
                    } finally { in.close(); out.close(); }
                    deleteTree(tmp); tmp.mkdirs();
                    String root = tmp.getCanonicalPath() + File.separator;
                    ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new java.io.FileInputStream(zip)));
                    try {
                        ZipEntry ze; byte[] b = new byte[65536];
                        while ((ze = zin.getNextEntry()) != null) {
                            File f = new File(tmp, ze.getName());
                            if (!f.getCanonicalPath().startsWith(root)) throw new Exception("unsafe path in zip");
                            if (ze.isDirectory()) { f.mkdirs(); continue; }
                            f.getParentFile().mkdirs();
                            OutputStream fo = new FileOutputStream(f);
                            try { int n; while ((n = zin.read(b)) > 0) fo.write(b, 0, n); } finally { fo.close(); }
                        }
                    } finally { zin.close(); }
                    if (!new File(tmp, "index.html").exists()) throw new Exception("the download is not a game build");
                    deleteTree(dir);
                    if (!tmp.renameTo(dir)) throw new Exception("could not install the files");
                    done.put("ok", true);
                } catch (Exception ex) {
                    try { done.put("ok", false); done.put("error", String.valueOf(ex.getMessage())); } catch (Exception ignored) { }
                } finally {
                    if (zip != null) zip.delete();
                    if (tmp != null) deleteTree(tmp);
                }
                emit(done);
    }

    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) hideSystemUi(); }
    @Override protected void onPause() { super.onPause(); web.onPause(); web.pauseTimers(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); web.resumeTimers(); hideSystemUi(); }

    @Override public void onBackPressed() {
        if (!inGame) { finish(); return; }
        // in the game, Back first closes an open panel; otherwise it returns to the launcher
        web.evaluateJavascript("(function(){var o=[].slice.call(document.querySelectorAll('.panel:not(.hidden)'));o.forEach(function(p){p.classList.add('hidden')});return o.length?'closed':'none'})()",
            v -> { if (!"\"closed\"".equals(v)) { inGame = false; web.loadUrl(LAUNCHER_URL); } });
    }
}
