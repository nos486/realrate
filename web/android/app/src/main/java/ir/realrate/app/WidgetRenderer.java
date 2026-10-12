package ir.realrate.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * Builds the two widgets' RemoteViews (header, refresh and settings buttons, the list) from the
 * cached feed and keeps them fresh: the list rows themselves come from PricesWidgetService and NewsWidgetService.
 * A tap opens the app on the widget's page through `ir.realrate.app://widget/<page>` (web/src/shared/native/widgets.js).
 */
final class WidgetRenderer {
    static final String ACTION_REFRESH = "ir.realrate.app.widget.REFRESH";
    static final String LINK = "ir.realrate.app://widget/";

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

    private static PendingIntent refreshIntent(Context context, Class<?> provider) {
        Intent intent = new Intent(context, provider);
        intent.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, provider.getName().hashCode(), intent, pendingFlags(false));
    }

    private static void header(Context context, RemoteViews views, Class<?> provider, String page) {
        long at = WidgetFeed.fetchedAt(context);
        String time = at == 0 ? "" : (WidgetFeed.lastOk(context) ? "" : "قدیمی • ") + WidgetFormat.clock(at);
        views.setTextViewText(R.id.widget_updated, time);
        views.setOnClickPendingIntent(R.id.widget_title, open(context, page, false));
        views.setOnClickPendingIntent(R.id.widget_refresh, refreshIntent(context, provider));
        views.setPendingIntentTemplate(R.id.widget_list, open(context, page, true));
        views.setOnClickPendingIntent(R.id.widget_empty, open(context, page, false));
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);
    }

    static RemoteViews prices(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_prices);
        header(context, views, PricesWidgetProvider.class, "prices");
        views.setOnClickPendingIntent(R.id.widget_settings, open(context, "settings", false));
        views.setRemoteAdapter(R.id.widget_list, new Intent(context, PricesWidgetService.class));
        return views;
    }

    static RemoteViews news(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_news);
        header(context, views, NewsWidgetProvider.class, "news");
        views.setRemoteAdapter(R.id.widget_list, new Intent(context, NewsWidgetService.class));
        return views;
    }

    /** Draw every placed widget of both kinds from the cached feed */
    static void renderAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : manager.getAppWidgetIds(new ComponentName(context, PricesWidgetProvider.class))) {
            manager.updateAppWidget(id, prices(context));
            manager.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
        }
        for (int id : manager.getAppWidgetIds(new ComponentName(context, NewsWidgetProvider.class))) {
            manager.updateAppWidget(id, news(context));
            manager.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
        }
    }

    /**
     * Fetch the feed in the background, then redraw
     * @param pending the receiver's goAsync() result to finish afterwards, or null
     */
    static void refreshAsync(Context context, BroadcastReceiver.PendingResult pending, boolean force) {
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                WidgetFeed.refresh(app, force);
                renderAll(app);
            } finally {
                if (pending != null) pending.finish();
            }
        }).start();
    }

    /** Whether any widget of either kind is placed */
    static boolean anyPlaced(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        return manager.getAppWidgetIds(new ComponentName(context, PricesWidgetProvider.class)).length > 0
            || manager.getAppWidgetIds(new ComponentName(context, NewsWidgetProvider.class)).length > 0;
    }
}
