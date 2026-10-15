package ir.realrate.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The pages this start loads: the built-in ones, or a newer downloaded web bundle (WebBundlePlugin)
        WebBundlePlugin.prepare(this);
        // The app's own plugins (web/src/shared/native): bank SMS, the fingerprint vault, updates (the
        // APK and the web bundle), saving the files it makes (exports, backups) and the home-screen widgets
        registerPlugin(BankSmsPlugin.class);
        registerPlugin(BiometricVaultPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(WebBundlePlugin.class);
        registerPlugin(FileExportPlugin.class);
        registerPlugin(WidgetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
