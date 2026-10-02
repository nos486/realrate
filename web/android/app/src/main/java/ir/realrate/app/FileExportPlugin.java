package ir.realrate.app;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Hands a file made by the app (a CSV export, the full backup — web/src/shared/utils/fileExport.js)
 * to Android's share sheet: the user saves it to Files / Drive or sends it. A WebView cannot
 * download a file the page built itself, so the text comes here, is written to the app's cache
 * and shared through the app's FileProvider (the same one the updater uses).
 *
 * JS: FileExport.share({ filename, mimeType, text }) — resolves once the share sheet is open.
 * Errors: INVALID (no file name or text), ERROR.
 */
@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {

    private static final String DIR = "exports";

    @PluginMethod
    public void share(PluginCall call) {
        String filename = call.getString("filename");
        String text = call.getString("text");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (filename == null || filename.trim().isEmpty() || text == null) {
            call.reject("فایلی برای ذخیره نیست.", "INVALID");
            return;
        }
        // Only a plain file name (no folders)
        String safeName = filename.replaceAll("[\\\\/:*?\"<>|]", "_");
        try {
            File dir = new File(getContext().getCacheDir(), DIR);
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, safeName);
            try (FileOutputStream out = new FileOutputStream(file, false)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TITLE, safeName);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, safeName);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("ذخیره‌ی فایل ممکن نشد.", "ERROR", e);
        }
    }
}
