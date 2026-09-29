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
 * and the sender is one of the banks' (BankSmsPlugin.configure), it shows a notification that
 * opens the app's SMS inbox, and tells the running app to read the message.
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

        for (Map.Entry<String, StringBuilder> entry : bodies.entrySet()) {
            showNotification(context, entry.getValue().toString());
        }
        BankSmsPlugin.notifyReceived();
    }

    private static void showNotification(Context context, String body) {
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

        String oneLine = body.replaceAll("\\s+", " ").trim();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_bank_sms)
            .setContentTitle("پیامک بانکی جدید — برای ثبت ضربه بزنید")
            .setContentText(oneLine)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
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
