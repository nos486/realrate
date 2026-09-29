package ir.realrate.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Catches bank messages as they arrive (even with the app closed): when automatic reading is on
 * and the message is a withdrawal or deposit — from a bank's sender and read by one of that bank's
 * templates (BankSmsRules, set by BankSmsPlugin.configure) — it shows a notification, without the
 * message's text, that opens the app's SMS page, and tells the running app to read it.
 * Every other message (balance notices, ads, one-time passwords…) is ignored.
 * The message itself stays in the phone's SMS inbox; the app reads it from there.
 */
public class BankSmsReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "bank_sms";
    /** Opens the app on the waiting bank messages (handled in web/src/shared/native/smsInbox.js) */
    static final String INBOX_LINK = "ir.realrate.app://sms-inbox";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SharedPreferences prefs = BankSmsPlugin.prefs(context);
        if (!prefs.getBoolean(BankSmsPlugin.PREF_ENABLED, false)) return;
        Set<String> senders = prefs.getStringSet(BankSmsPlugin.PREF_SENDERS, Collections.emptySet());
        if (senders == null || senders.isEmpty()) return;
        BankSmsRules rules = BankSmsPlugin.parseRules(prefs.getString(BankSmsPlugin.PREF_RULES, ""));

        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null) return;
        // A long message arrives in parts: join them per sender
        Map<String, StringBuilder> bodies = new LinkedHashMap<>();
        for (SmsMessage part : parts) {
            if (part == null) continue;
            String address = part.getDisplayOriginatingAddress();
            if (address == null || !senders.contains(BankSmsPlugin.normalizeSender(address))) continue;
            StringBuilder body = bodies.get(address);
            if (body == null) {
                body = new StringBuilder();
                bodies.put(address, body);
            }
            body.append(part.getDisplayMessageBody());
        }
        if (bodies.isEmpty()) return;

        boolean any = false;
        for (Map.Entry<String, StringBuilder> entry : bodies.entrySet()) {
            String body = entry.getValue().toString();
            // One-time passwords never get a notification (nor reach the app)
            if (BankSmsPlugin.isSensitive(body)) continue;
            // Withdrawals and deposits only (rules not set yet by the app: every bank message)
            if (!rules.isEmpty() && !rules.isTransaction(entry.getKey(), body)) continue;
            showNotification(context);
            any = true;
        }
        if (any) BankSmsPlugin.notifyReceived();
    }

    /** Only says a withdrawal or deposit arrived: the message's text is never shown in a notification */
    private static void showNotification(Context context) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "پیامک‌های بانکی", NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("پیامک‌های بانک برای ثبت در RealRate");
                manager.createNotificationChannel(channel);
            }
        }

        Intent open = new Intent(context, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.setData(Uri.parse(INBOX_LINK));
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_bank_sms)
            .setContentTitle("واریز یا برداشت جدید")
            .setContentText("برای ثبت در RealRate ضربه بزنید")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        try {
            NotificationManagerCompat.from(context).notify((int) (System.currentTimeMillis() & 0x7fffffff), builder.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed: the message still waits in the app
        }
    }
}
