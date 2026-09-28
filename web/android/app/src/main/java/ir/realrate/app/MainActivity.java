package ir.realrate.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins (web/src/shared/native): bank SMS and the fingerprint vault
        registerPlugin(BankSmsPlugin.class);
        registerPlugin(BiometricVaultPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
