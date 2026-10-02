package ir.realrate.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates the app from its own signed APK (GitHub releases, see web/src/shared/native/appUpdate.js):
 * downloads it into the app's cache, checks it is this app and newer than the installed one, and
 * hands it to Android's installer (which asks the user, and refuses an APK signed by another key).
 *
 * JS: AppUpdate.canInstall() → { allowed }   (the "install unknown apps" permission, Android 8+)
 *     AppUpdate.openInstallSettings()        (that permission's page for this app)
 *     AppUpdate.download({ url, version }) → { path }   (events: "downloadProgress" { downloaded, total })
 *     AppUpdate.cancel()
 *     AppUpdate.install()                    (the last downloaded APK)
 * Errors: BUSY, CANCELED, NOT_NEWER (not this app, or not newer), NOT_DOWNLOADED, ERROR.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String DIR = "updates";
    private static final String FILE = "realrate-update.apk";
    private static final int MAX_REDIRECTS = 5;

    private volatile boolean downloading = false;
    private volatile boolean canceled = false;

    private File apkFile() {
        File dir = new File(getContext().getCacheDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, FILE);
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                    : new Intent(Settings.ACTION_SECURITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("صفحه‌ی اجازه‌ی نصب باز نشد.", "ERROR", e);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        canceled = true;
        call.resolve();
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("نشانی فایل به‌روزرسانی نامعتبر است.", "ERROR");
            return;
        }
        if (downloading) {
            call.reject("دانلود به‌روزرسانی در جریان است.", "BUSY");
            return;
        }
        downloading = true;
        canceled = false;
        new Thread(() -> {
            File target = apkFile();
            File part = new File(target.getPath() + ".part");
            try {
                fetch(url, part);
                if (canceled) throw new CanceledException();
                checkApk(part);
                if (target.exists()) target.delete();
                if (!part.renameTo(target)) throw new Exception("rename failed");
                JSObject ret = new JSObject();
                ret.put("path", target.getAbsolutePath());
                call.resolve(ret);
            } catch (CanceledException e) {
                call.reject("دانلود لغو شد.", "CANCELED");
            } catch (NotNewerException e) {
                call.reject("فایل دانلودشده نسخه‌ی جدیدتری از همین اپ نیست.", "NOT_NEWER");
            } catch (Exception e) {
                call.reject("دانلود به‌روزرسانی ناموفق بود. اتصال اینترنت را بررسی کنید.", "ERROR", e);
            } finally {
                part.delete();
                downloading = false;
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = apkFile();
        if (!apk.exists()) {
            call.reject("فایل به‌روزرسانی پیدا نشد؛ دوباره دانلود کنید.", "NOT_DOWNLOADED");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("نصب‌کننده‌ی اندروید باز نشد.", "ERROR", e);
        }
    }

    /** Downloads `url` into `out`, following redirects (GitHub sends the file from another host) */
    private void fetch(String url, File out) throws Exception {
        String current = url;
        for (int i = 0; i <= MAX_REDIRECTS; i++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(30000);
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
                long total = conn.getContentLengthLong();
                try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    long downloaded = 0;
                    long lastEvent = 0;
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        if (canceled) throw new CanceledException();
                        os.write(buf, 0, n);
                        downloaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEvent > 250) {
                            lastEvent = now;
                            progress(downloaded, total);
                        }
                    }
                    progress(downloaded, total);
                }
                return;
            } finally {
                conn.disconnect();
            }
        }
        throw new Exception("too many redirects");
    }

    private void progress(long downloaded, long total) {
        JSObject data = new JSObject();
        data.put("downloaded", downloaded);
        data.put("total", total);
        notifyListeners("downloadProgress", data);
    }

    /** The APK must be this app, newer than the installed one (Android checks the signature) */
    @SuppressWarnings("deprecation")
    private void checkApk(File apk) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getPath(), 0);
        if (archive == null || !getContext().getPackageName().equals(archive.packageName)) throw new NotNewerException();
        PackageInfo installed = pm.getPackageInfo(getContext().getPackageName(), 0);
        long archiveCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? archive.getLongVersionCode() : archive.versionCode;
        long installedCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? installed.getLongVersionCode() : installed.versionCode;
        if (archiveCode <= installedCode) throw new NotNewerException();
    }

    private static class CanceledException extends Exception {}

    private static class NotNewerException extends Exception {}
}
