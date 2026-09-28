package ir.realrate.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Keeps one secret (the unlocked vault's data key) that only the user's fingerprint/face can
 * release: it is encrypted with an AES key in the Android Keystore that can be used only right
 * after a strong biometric check, and that Android destroys when fingerprints are added or
 * removed. The ciphertext is kept in the app's private preferences.
 *
 * JS: BiometricVault.isAvailable() → { available }
 *     BiometricVault.has() → { stored }
 *     BiometricVault.store({ data, title?, subtitle? })   (asks for the fingerprint)
 *     BiometricVault.retrieve({ title?, subtitle? }) → { data }   (asks for the fingerprint)
 *     BiometricVault.clear()
 * Errors: CANCELED (the user closed the prompt), INVALIDATED (fingerprints changed: stored
 * secret dropped), NOT_STORED, UNAVAILABLE, ERROR.
 */
@CapacitorPlugin(name = "BiometricVault")
public class BiometricVaultPlugin extends Plugin {

    private static final String KEY_ALIAS = "realrate_vault_biometric";
    private static final String PREFS = "realrate_biometric_vault";
    private static final String PREF_DATA = "data";
    private static final String PREF_IV = "iv";
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean available() {
        return BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .build());
        return generator.generateKey();
    }

    private void deleteAll() {
        prefs().edit().clear().apply();
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // Nothing stored to remove
        }
    }

    private interface CipherAction {
        void run(Cipher cipher) throws Exception;
    }

    /** Show the system fingerprint prompt; `onSuccess` gets the cipher it unlocked */
    private void authenticate(PluginCall call, Cipher cipher, CipherAction onSuccess) {
        String title = call.getString("title", "تأیید با اثر انگشت");
        String subtitle = call.getString("subtitle", "باز کردن اطلاعات رمزنگاری‌شده RealRate");
        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        try {
                            BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                            onSuccess.run(crypto != null ? crypto.getCipher() : cipher);
                        } catch (Exception e) {
                            call.reject("اثر انگشت تأیید شد ولی باز کردن ممکن نشد.", "ERROR", e);
                        }
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        boolean canceled = errorCode == BiometricPrompt.ERROR_USER_CANCELED
                            || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                            || errorCode == BiometricPrompt.ERROR_CANCELED;
                        call.reject(errString.toString(), canceled ? "CANCELED" : "ERROR");
                    }
                });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setNegativeButtonText("انصراف")
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build();
            prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
        });
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", available());
        call.resolve(result);
    }

    @PluginMethod
    public void has(PluginCall call) {
        JSObject result = new JSObject();
        result.put("stored", prefs().contains(PREF_DATA));
        call.resolve(result);
    }

    @PluginMethod
    public void store(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("چیزی برای نگه‌داری داده نشده است.", "ERROR");
            return;
        }
        if (!available()) {
            call.reject("اثر انگشت روی این گوشی فعال نیست.", "UNAVAILABLE");
            return;
        }
        Cipher cipher;
        try {
            deleteAll();
            cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        } catch (Exception e) {
            call.reject("ساخت کلید امن ممکن نشد.", "ERROR", e);
            return;
        }
        authenticate(call, cipher, (unlocked) -> {
            byte[] encrypted = unlocked.doFinal(data.getBytes(StandardCharsets.UTF_8));
            prefs().edit()
                .putString(PREF_DATA, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(PREF_IV, Base64.encodeToString(unlocked.getIV(), Base64.NO_WRAP))
                .apply();
            call.resolve();
        });
    }

    @PluginMethod
    public void retrieve(PluginCall call) {
        String data = prefs().getString(PREF_DATA, null);
        String iv = prefs().getString(PREF_IV, null);
        if (data == null || iv == null) {
            call.reject("اثر انگشت برای این گوشی فعال نشده است.", "NOT_STORED");
            return;
        }
        Cipher cipher;
        try {
            cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
        } catch (KeyPermanentlyInvalidatedException e) {
            deleteAll();
            call.reject("اثر انگشت‌های گوشی تغییر کرده؛ یک بار با رمز باز کنید و دوباره فعال کنید.", "INVALIDATED");
            return;
        } catch (Exception e) {
            call.reject("باز کردن با اثر انگشت ممکن نشد.", "ERROR", e);
            return;
        }
        authenticate(call, cipher, (unlocked) -> {
            byte[] plain = unlocked.doFinal(Base64.decode(data, Base64.NO_WRAP));
            JSObject result = new JSObject();
            result.put("data", new String(plain, StandardCharsets.UTF_8));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        deleteAll();
        call.resolve();
    }
}
