package ir.realrate.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (web/src/shared/native): bank SMS, the fingerprint vault, updates and
        // saving the files it makes (exports, backups)
        registerPlugin(BankSmsPlugin.class);
        registerPlugin(BiometricVaultPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(FileExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
