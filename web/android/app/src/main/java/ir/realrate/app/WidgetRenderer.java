package ir.realrate.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Builds the widget's RemoteViews from the cached feed — a header, up to six price tiles (two
 * columns) and the AI news list (NewsWidgetService) — and keeps it fresh: a refresh every
 * REFRESH_EVERY_MS by alarm, on the refresh button, and when the app opens.
 * A tap opens the app on a page through `ir.realrate.app://widget/<page>` (web/src/shared/native/widgets.js).
 */
final class WidgetRenderer {
    static final String ACTION_REFRESH = "ir.realrate.app.widget.REFRESH";
    static final String LINK = "ir.realrate.app://widget/";
    /** Android's own widget period never goes under 30 minutes, so the 10-minute refresh is an alarm */
    private static final long REFRESH_EVERY_MS = 10 * 60 * 1000L;

    private static final int[] TILES = {R.id.tile_1, R.id.tile_2, R.id.tile_3, R.id.tile_4, R.id.tile_5, R.id.tile_6};
    private static final int[] TILE_NAMES = {R.id.tile_name_1, R.id.tile_name_2, R.id.tile_name_3, R.id.tile_name_4, R.id.tile_name_5, R.id.tile_name_6};
    private static final int[] TILE_PRICES = {R.id.tile_price_1, R.id.tile_price_2, R.id.tile_price_3, R.id.tile_price_4, R.id.tile_price_5, R.id.tile_price_6};
    private static final int[] TILE_CHANGES = {R.id.tile_change_1, R.id.tile_change_2, R.id.tile_change_3, R.id.tile_change_4, R.id.tile_change_5, R.id.tile_change_6};
    private static final int[] TILE_ROWS = {R.id.tiles_row_1, R.id.tiles_row_2, R.id.tiles_row_3};

    private WidgetRenderer() {}

    private static int pendingFlags(boolean mutable) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (mutable) return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? flags | PendingIntent.FLAG_MUTABLE : flags;
        return flags | PendingIntent.FLAG_IMMUTABLE;
    }

    /** Opens the app on `page` ("prices", "news" or "settings") */
    static PendingIntent open(Context context, String page, boolean mutable) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(LINK + page));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, page.hashCode(), intent, pendingFlags(mutable));
    }

    private static PendingIntent refreshIntent(Context context) {
        Intent intent = new Intent(context, MarketWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, 1, intent, pendingFlags(false));
    }

    private static void tiles(Context context, RemoteViews views, JSONObject feed) {
        JSONArray prices = feed == null ? null : feed.optJSONArray("prices");
        int count = prices == null ? 0 : Math.min(prices.length(), TILES.length);
        for (int i = 0; i < TILES.length; i++) {
            boolean shown = i < count && prices.optJSONObject(i) != null;
            views.setViewVisibility(TILES[i], shown ? View.VISIBLE : View.INVISIBLE);
            if (!shown) continue;
            JSONObject row = prices.optJSONObject(i);
            boolean usd = "usd".equals(row.optString("currency"));
            boolean known = !row.isNull("changePct");
            double change = row.optDouble("changePct", 0);
            boolean flat = !known || Math.abs(change) < 0.005;
            views.setTextViewText(TILE_NAMES[i], row.optString("name"));
            views.setTextViewText(TILE_PRICES[i], WidgetFormat.price(row.optDouble("price"), usd));
            views.setTextViewText(TILE_CHANGES[i], WidgetFormat.change(change, known));
            views.setTextColor(TILE_CHANGES[i], Color.parseColor(flat ? "#94a3b8" : change > 0 ? "#34d399" : "#fb7185"));
            views.setInt(TILES[i], "setBackgroundResource",
                flat ? R.drawable.widget_tile_flat : change > 0 ? R.drawable.widget_tile_up : R.drawable.widget_tile_down);
            views.setOnClickPendingIntent(TILES[i], open(context, "prices", false));
        }
        // A row with no tile takes no room, so the news get it
        for (int r = 0; r < TILE_ROWS.length; r++) {
            views.setViewVisibility(TILE_ROWS[r], count > r * 2 ? View.VISIBLE : View.GONE);
        }
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_market);
        JSONObject feed = WidgetFeed.cached(context);
        long at = WidgetFeed.fetchedAt(context);
        views.setTextViewText(R.id.widget_updated,
            at == 0 ? "" : (WidgetFeed.lastOk(context) ? "" : "قدیمی • ") + WidgetFormat.clock(at));
        views.setOnClickPendingIntent(R.id.widget_title, open(context, "prices", false));
        views.setOnClickPendingIntent(R.id.widget_settings, open(context, "settings", false));
        views.setOnClickPendingIntent(R.id.widget_refresh, refreshIntent(context));
        views.setOnClickPendingIntent(R.id.widget_news_label, open(context, "news", false));
        tiles(context, views, feed);
        views.setRemoteAdapter(R.id.widget_list, new Intent(context, NewsWidgetService.class));
        views.setPendingIntentTemplate(R.id.widget_list, open(context, "news", true));
        views.setOnClickPendingIntent(R.id.widget_empty, open(context, "prices", false));
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);
        return views;
    }

    /** Draw every placed widget from the cached feed */
    static void renderAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : manager.getAppWidgetIds(new ComponentName(context, MarketWidgetProvider.class))) {
            manager.updateAppWidget(id, build(context));
            manager.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
        }
    }

    /**
     * Fetch the feed in the background, redraw, and line up the next refresh
     * @param pending the receiver's goAsync() result to finish afterwards, or null
     */
    static void refreshAsync(Context context, BroadcastReceiver.PendingResult pending, boolean force) {
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                WidgetFeed.refresh(app, force);
                renderAll(app);
            } finally {
                scheduleNext(app);
                if (pending != null) pending.finish();
            }
        }).start();
    }

    /** Whether the widget is placed */
    static boolean anyPlaced(Context context) {
        return AppWidgetManager.getInstance(context)
            .getAppWidgetIds(new ComponentName(context, MarketWidgetProvider.class)).length > 0;
    }

    /** The next refresh in ten minutes (an inexact alarm: the system may batch it, e.g. while the phone dozes) */
    static void scheduleNext(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        if (!anyPlaced(context)) {
            alarms.cancel(refreshIntent(context));
            return;
        }
        alarms.set(AlarmManager.RTC, System.currentTimeMillis() + REFRESH_EVERY_MS, refreshIntent(context));
    }

    static void cancelNext(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(refreshIntent(context));
    }
}
