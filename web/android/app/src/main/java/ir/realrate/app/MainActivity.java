package ir.realrate.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (web/src/shared/native): bank SMS, the fingerprint vault and updates
        registerPlugin(BankSmsPlugin.class);
        registerPlugin(BiometricVaultPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
