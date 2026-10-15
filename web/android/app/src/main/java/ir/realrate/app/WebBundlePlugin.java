package ir.realrate.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Updates the app's pages without a new APK: a web bundle (the zipped dist-app of this flavor)
 * published by .github/workflows/android.yml on the GitHub release `web-bundle`, with a manifest.
 *
 * - A bundle is taken only when its manifest's native hash is this APK's own (the Java side, the
 *   manifest and the Capacitor plugins are exactly what the pages were built with), its build is
 *   newer than the APK and the bundle in use, and its signature checks against the certificate
 *   built into the APK (the APK's own signing certificate, BuildConfig.WEB_BUNDLE_CERT). The
 *   signed zip carries its own bundle.json (build and native hash), which must match too. A build
 *   without the hash or the certificate (a local build) never takes a bundle.
 * - A downloaded bundle waits and is used from the next start of the app (prepare(), before the
 *   Capacitor bridge loads), or right away when the user asks for it (apply(), the settings
 *   page's «بررسی به‌روزرسانی»). Its pages must call ready() on start; a bundle that starts twice
 *   without it is dropped and the last good pages come back.
 * - A new APK starts from its own built-in pages and drops every downloaded bundle.
 *
 * JS: WebBundle.info()   → { enabled, nativeHash, flavor, apkBuild, build, pendingBuild }
 *     WebBundle.ready()  → { build }   (the pages started: the bundle in use is good)
 *     WebBundle.update({ manifestUrl }) → { status: disabled | busy | latest | ready, build? }
 *     WebBundle.apply()  → { applied }  (loads the waiting bundle now; the pages reload)
 * Events: "bundleProgress" { downloaded, total } while a bundle's zip downloads
 */
@CapacitorPlugin(name = "WebBundle")
public class WebBundlePlugin extends Plugin {

    private static final String PREFS = "RealRateWebBundle";
    private static final String DIR = "web-bundles";
    /** Starts a new bundle gets to call ready() before it is dropped */
    private static final int MAX_TRIAL_STARTS = 2;
    private static final int MAX_REDIRECTS = 5;
    private static final long MAX_MANIFEST_BYTES = 64 * 1024;
    private static final long MAX_BUNDLE_BYTES = 64L * 1024 * 1024;

    private static final String K_APK = "apkBuild";
    private static final String K_ACTIVE = "activeBuild";
    private static final String K_TRIAL = "trialBuild";
    private static final String K_TRIAL_STARTS = "trialStarts";
    private static final String K_PENDING = "pendingBuild";
    private static final String K_BAD = "badBuild";

    private volatile boolean busy = false;

    /* ── Before the bridge loads (MainActivity.onCreate) ─────────────────────────── */

    /**
     * Picks the pages this start of the app loads: drops everything after a new APK, drops a
     * bundle that did not confirm its start, and moves a waiting bundle into use (on trial)
     */
    public static void prepare(Context context) {
        try {
            SharedPreferences prefs = prefs(context);
            SharedPreferences.Editor edit = prefs.edit();
            long apk = apkBuild(context);
            if (prefs.getLong(K_APK, -1) != apk) {
                deleteAll(bundlesDir(context), -1);
                edit.clear().putLong(K_APK, apk).commit();
                setServerPath(context, null);
                return;
            }
            long active = prefs.getLong(K_ACTIVE, 0);
            long trial = prefs.getLong(K_TRIAL, 0);
            if (trial > 0) {
                int starts = prefs.getInt(K_TRIAL_STARTS, 0);
                if (starts < MAX_TRIAL_STARTS) {
                    edit.putInt(K_TRIAL_STARTS, starts + 1).commit();
                    return;
                }
                // Started twice and never confirmed: back to the last good pages
                deleteDir(bundleDir(context, trial));
                edit.remove(K_TRIAL).remove(K_TRIAL_STARTS).putLong(K_BAD, trial);
                setServerPath(context, active > 0 ? bundleDir(context, active) : null);
            }
            edit.commit();
            startPending(context);
        } catch (Exception ignored) {
            // Never block the app's start: the built-in pages always work
        }
    }

    /**
     * Moves the waiting bundle into use (on trial) for the next load of the pages
     * @return its folder, or null when none is waiting
     */
    private static File startPending(Context context) {
        SharedPreferences prefs = prefs(context);
        long pending = prefs.getLong(K_PENDING, 0);
        File dir = pending > 0 ? bundleDir(context, pending) : null;
        if (dir == null || !new File(dir, "index.html").exists()) {
            prefs.edit().remove(K_PENDING).commit();
            return null;
        }
        prefs.edit().remove(K_PENDING).putLong(K_TRIAL, pending).putInt(K_TRIAL_STARTS, 1).commit();
        setServerPath(context, dir);
        return dir;
    }

    /* ── JS ──────────────────────────────────────────────────────────────────────── */

    @PluginMethod
    public void info(PluginCall call) {
        SharedPreferences prefs = prefs(getContext());
        JSObject ret = new JSObject();
        ret.put("enabled", enabled());
        ret.put("nativeHash", BuildConfig.NATIVE_HASH);
        ret.put("flavor", BuildConfig.FLAVOR);
        ret.put("apkBuild", apkBuild(getContext()));
        ret.put("build", currentBuild(prefs));
        ret.put("pendingBuild", prefs.getLong(K_PENDING, 0));
        call.resolve(ret);
    }

    @PluginMethod
    public void ready(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = prefs(context);
        long trial = prefs.getLong(K_TRIAL, 0);
        if (trial > 0 && bundleDir(context, trial).getAbsolutePath().equals(bridge.getServerBasePath())) {
            long previous = prefs.getLong(K_ACTIVE, 0);
            prefs.edit().putLong(K_ACTIVE, trial).remove(K_TRIAL).remove(K_TRIAL_STARTS).commit();
            if (previous > 0 && previous != trial) deleteDir(bundleDir(context, previous));
        }
        JSObject ret = new JSObject();
        ret.put("build", currentBuild(prefs));
        call.resolve(ret);
    }

    @PluginMethod
    public void apply(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = prefs(context);
        if (busy || prefs.getLong(K_TRIAL, 0) > 0) {
            // A download under way, or the pages in use are not confirmed yet: wait for the next start
            JSObject ret = new JSObject();
            ret.put("applied", false);
            call.resolve(ret);
            return;
        }
        File dir = startPending(context);
        JSObject ret = new JSObject();
        ret.put("applied", dir != null);
        call.resolve(ret);
        if (dir != null) bridge.setServerBasePath(dir.getAbsolutePath());
    }

    @PluginMethod
    public void update(PluginCall call) {
        String manifestUrl = call.getString("manifestUrl");
        if (!enabled()) {
            call.resolve(status("disabled", 0));
            return;
        }
        if (manifestUrl == null || !manifestUrl.startsWith("https://")) {
            call.reject("invalid manifest url", "ERROR");
            return;
        }
        if (busy) {
            call.resolve(status("busy", 0));
            return;
        }
        busy = true;
        new Thread(() -> {
            File part = null;
            File unpacking = null;
            try {
                Context context = getContext();
                SharedPreferences prefs = prefs(context);
                JSONObject manifest = new JSONObject(new String(fetch(manifestUrl, MAX_MANIFEST_BYTES, null, null), StandardCharsets.UTF_8));
                JSONObject bundle = manifest.optJSONObject("bundles") == null ? null : manifest.getJSONObject("bundles").optJSONObject(BuildConfig.FLAVOR);
                long build = manifest.optLong("build", 0);
                long newest = Math.max(apkBuild(context), Math.max(currentBuild(prefs), prefs.getLong(K_PENDING, 0)));
                if (bundle == null
                        || !BuildConfig.NATIVE_HASH.equals(manifest.optString("nativeHash"))
                        || build <= newest
                        || build == prefs.getLong(K_BAD, 0)) {
                    call.resolve(status("latest", 0));
                    return;
                }
                String file = bundle.getString("file");
                if (!file.matches("[A-Za-z0-9._-]+\\.zip")) throw new Exception("bad file name");
                long size = bundle.getLong("size");
                if (size <= 0 || size > MAX_BUNDLE_BYTES) throw new Exception("bad size");
                byte[] signature = Base64.decode(bundle.getString("signature"), Base64.DEFAULT);

                File dir = bundlesDir(context);
                part = new File(dir, build + ".zip.part");
                fetch(new URL(new URL(manifestUrl), file).toString(), MAX_BUNDLE_BYTES, part, (downloaded, total) -> {
                    JSObject data = new JSObject();
                    data.put("downloaded", downloaded);
                    data.put("total", total > 0 ? total : size);
                    notifyListeners("bundleProgress", data);
                });
                if (part.length() != size) throw new Exception("size mismatch");
                if (!verify(part, signature)) throw new Exception("bad signature");

                unpacking = new File(dir, build + ".unpacking");
                deleteDir(unpacking);
                unzip(part, unpacking);
                if (!new File(unpacking, "index.html").isFile()) throw new Exception("no index.html");
                // The manifest is not signed, the zip is: its own bundle.json must say the same build
                // and native side, or an old signed zip could be passed off as one for this APK
                JSONObject stamp = new JSONObject(new String(readFile(new File(unpacking, "bundle.json"), MAX_MANIFEST_BYTES), StandardCharsets.UTF_8));
                if (stamp.optLong("build", -1) != build || !BuildConfig.NATIVE_HASH.equals(stamp.optString("nativeHash"))) {
                    throw new Exception("bundle stamp mismatch");
                }
                File target = bundleDir(context, build);
                deleteDir(target);
                if (!unpacking.renameTo(target)) throw new Exception("rename failed");

                // An older bundle still waiting is replaced by this one
                long oldPending = prefs.getLong(K_PENDING, 0);
                prefs.edit().putLong(K_PENDING, build).commit();
                if (oldPending > 0 && oldPending != build) deleteDir(bundleDir(context, oldPending));
                call.resolve(status("ready", build));
            } catch (Exception e) {
                call.reject("web bundle update failed", "ERROR", e);
            } finally {
                if (part != null) part.delete();
                if (unpacking != null) deleteDir(unpacking);
                busy = false;
            }
        }).start();
    }

    /* ── Helpers ─────────────────────────────────────────────────────────────────── */

    private static JSObject status(String status, long build) {
        JSObject ret = new JSObject();
        ret.put("status", status);
        if (build > 0) ret.put("build", build);
        return ret;
    }

    private static boolean enabled() {
        return !BuildConfig.NATIVE_HASH.isEmpty() && !BuildConfig.WEB_BUNDLE_CERT.isEmpty();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The bundle in use (on trial or confirmed); 0 for the built-in pages */
    private static long currentBuild(SharedPreferences prefs) {
        long trial = prefs.getLong(K_TRIAL, 0);
        return trial > 0 ? trial : prefs.getLong(K_ACTIVE, 0);
    }

    @SuppressWarnings("deprecation")
    private static long apkBuild(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private static File bundlesDir(Context context) {
        File dir = new File(context.getFilesDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private static File bundleDir(Context context, long build) {
        return new File(bundlesDir(context), String.valueOf(build));
    }

    /** The folder Capacitor serves the pages from at its next load (null: the built-in pages) */
    private static void setServerPath(Context context, File dir) {
        context.getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE)
                .edit()
                .putString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, dir == null ? "" : dir.getAbsolutePath())
                .commit();
    }

    /** The signature over the whole zip, by the key of the certificate built into the APK */
    private static boolean verify(File file, byte[] signature) throws Exception {
        byte[] der = Base64.decode(BuildConfig.WEB_BUNDLE_CERT, Base64.DEFAULT);
        X509Certificate cert = (X509Certificate) CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(der));
        PublicKey key = cert.getPublicKey();
        Signature sig = Signature.getInstance("EC".equals(key.getAlgorithm()) ? "SHA256withECDSA" : "SHA256withRSA");
        sig.initVerify(key);
        try (InputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) sig.update(buf, 0, n);
        }
        return sig.verify(signature);
    }

    /** Unzips into `dir`, refusing any entry that would land outside it */
    private static void unzip(File zip, File dir) throws Exception {
        if (!dir.mkdirs() && !dir.isDirectory()) throw new Exception("mkdir failed");
        String root = dir.getCanonicalPath() + File.separator;
        try (ZipInputStream in = new ZipInputStream(new FileInputStream(zip))) {
            byte[] buf = new byte[64 * 1024];
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                File out = new File(dir, entry.getName());
                if (!out.getCanonicalPath().startsWith(root)) throw new Exception("bad entry");
                if (entry.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
                try (OutputStream os = new FileOutputStream(out)) {
                    int n;
                    while ((n = in.read(buf)) != -1) os.write(buf, 0, n);
                }
            }
        }
    }

    /** Download progress: bytes so far and the whole size (0 when unknown) */
    private interface Progress {
        void on(long downloaded, long total);
    }

    /**
     * Downloads `url` (following redirects: GitHub sends files from another host) into `out`, or
     * returns it when `out` is null; at most `max` bytes, reporting to `progress` (may be null)
     */
    private static byte[] fetch(String url, long max, File out, Progress progress) throws Exception {
        String current = url;
        for (int i = 0; i <= MAX_REDIRECTS; i++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(30000);
            conn.setUseCaches(false);
            conn.setRequestProperty("User-Agent", "RealRate-Android");
            try {
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400) {
                    String location = conn.getHeaderField("Location");
                    if (location == null) throw new Exception("redirect without location");
                    current = new URL(new URL(current), location).toString();
                    if (!current.startsWith("https://")) throw new Exception("insecure redirect");
                    continue;
                }
                if (code != 200) throw new Exception("HTTP " + code);
                try (InputStream in = conn.getInputStream();
                     OutputStream os = out == null ? new ByteArrayOutputStream() : new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    long length = conn.getContentLengthLong();
                    long total = 0;
                    long lastEvent = 0;
                    int n;
                    if (progress != null) progress.on(0, length);
                    while ((n = in.read(buf)) != -1) {
                        total += n;
                        if (total > max) throw new Exception("too large");
                        os.write(buf, 0, n);
                        long now = System.currentTimeMillis();
                        if (progress != null && now - lastEvent > 250) {
                            lastEvent = now;
                            progress.on(total, length);
                        }
                    }
                    if (progress != null) progress.on(total, length);
                    return out == null ? ((ByteArrayOutputStream) os).toByteArray() : null;
                }
            } finally {
                conn.disconnect();
            }
        }
        throw new Exception("too many redirects");
    }

    private static byte[] readFile(File file, long max) throws Exception {
        if (!file.isFile() || file.length() > max) throw new Exception("missing or too large: " + file.getName());
        try (InputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static void deleteDir(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteDir(child);
        file.delete();
    }

    /** Deletes every bundle but `keep` (-1: all) */
    private static void deleteAll(File dir, long keep) {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (!child.getName().equals(String.valueOf(keep))) deleteDir(child);
        }
    }
}
