package ir.realrate.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.provider.Telephony;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.lang.ref.WeakReference;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Reads bank messages from the phone's SMS inbox (the app's "read SMS automatically").
 *
 * Only messages from the senders the app asks for (the banks in bankSmsTemplates.js) and newer
 * than `since` are returned; nothing else leaves the inbox. The web app reads them with
 * bankSms.js and keeps them on the phone until they are recorded or dismissed.
 *
 * New messages are caught as they arrive by BankSmsReceiver, which shows a notification and tells
 * the open app (event "smsReceived") to read them.
 *
 * JS: BankSms.read({ senders: string[], since: epochMillis, limit?: number })
 *     → { messages: [{ id, address, body, date }] }, newest first
 *     BankSms.configure({ enabled: boolean, senders: string[] })   what BankSmsReceiver listens for
 *     BankSms.addListener('smsReceived', …)   a bank message arrived while the app is running
 *     BankSms.checkPermissions() / requestPermissions()
 *       → { sms: 'granted' | 'denied' | 'prompt', notifications: … }
 */
@CapacitorPlugin(
    name = "BankSms",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class BankSmsPlugin extends Plugin {

    private static final int MAX_MESSAGES = 1000;
    /** Settings BankSmsReceiver reads (it runs without the app) */
    static final String PREFS = "realrate_bank_sms";
    static final String PREF_ENABLED = "enabled";
    static final String PREF_SENDERS = "senders";

    private static WeakReference<BankSmsPlugin> active = new WeakReference<>(null);

    @Override
    public void load() {
        active = new WeakReference<>(this);
    }

    /** A bank message arrived (BankSmsReceiver): the running app reads it */
    static void notifyReceived() {
        BankSmsPlugin plugin = active.get();
        if (plugin != null) plugin.notifyListeners("smsReceived", new JSObject());
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Set<String> senders = new HashSet<>();
        JSArray list = call.getArray("senders", new JSArray());
        for (int i = 0; i < list.length(); i++) {
            String s = list.optString(i, "");
            if (!s.isEmpty()) senders.add(normalizeSender(s));
        }
        prefs(getContext()).edit()
            .putBoolean(PREF_ENABLED, Boolean.TRUE.equals(call.getBoolean("enabled", false)))
            .putStringSet(PREF_SENDERS, senders)
            .apply();
        call.resolve();
    }

    /** Same as normalizeSender in bankSms.js: digits without Iranian prefixes, else lower case */
    static String normalizeSender(String sender) {
        String raw = sender == null ? "" : sender.trim().toLowerCase(Locale.ROOT);
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return raw;
        return digits.replaceFirst("^(0098|98|0)", "");
    }

    @PluginMethod
    public void read(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("اجازه‌ی خواندن پیامک داده نشده است.", "PERMISSION_DENIED");
            return;
        }

        Set<String> senders = new HashSet<>();
        JSArray list = call.getArray("senders", new JSArray());
        for (int i = 0; i < list.length(); i++) {
            String s = list.optString(i, "");
            if (!s.isEmpty()) senders.add(normalizeSender(s));
        }
        if (senders.isEmpty()) {
            call.reject("فرستنده‌ای برای خواندن مشخص نشده است.", "NO_SENDERS");
            return;
        }
        // Epoch millis: JSON gives a Long (or a Double), so read it as any number
        Object sinceValue = call.getData().opt("since");
        long since = sinceValue instanceof Number ? ((Number) sinceValue).longValue() : 0L;
        int limit = Math.min(call.getInt("limit", MAX_MESSAGES), MAX_MESSAGES);

        JSArray messages = new JSArray();
        String[] projection = { Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE };
        try (Cursor cursor = getContext().getContentResolver().query(
            Telephony.Sms.Inbox.CONTENT_URI,
            projection,
            Telephony.Sms.DATE + " > ?",
            new String[] { String.valueOf(since) },
            Telephony.Sms.DATE + " DESC"
        )) {
            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow(Telephony.Sms._ID);
                int addressCol = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS);
                int bodyCol = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY);
                int dateCol = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE);
                while (cursor.moveToNext() && messages.length() < limit) {
                    String address = cursor.getString(addressCol);
                    if (!senders.contains(normalizeSender(address))) continue;
                    JSObject message = new JSObject();
                    message.put("id", cursor.getString(idCol));
                    message.put("address", address);
                    message.put("body", cursor.getString(bodyCol));
                    message.put("date", cursor.getLong(dateCol));
                    messages.put(message);
                }
            }
        } catch (Exception e) {
            call.reject("خواندن پیامک‌ها ممکن نشد.", "READ_FAILED", e);
            return;
        }

        JSObject result = new JSObject();
        result.put("messages", messages);
        call.resolve(result);
    }
}
