package ir.realrate.app;

import android.Manifest;
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
 * JS: BankSms.read({ senders: string[], since: epochMillis, limit?: number })
 *     → { messages: [{ id, address, body, date }] }, newest first
 *     BankSms.checkPermissions() / requestPermissions() → { sms: 'granted' | 'denied' | 'prompt' }
 */
@CapacitorPlugin(
    name = "BankSms",
    permissions = { @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }) }
)
public class BankSmsPlugin extends Plugin {

    private static final int MAX_MESSAGES = 1000;

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
