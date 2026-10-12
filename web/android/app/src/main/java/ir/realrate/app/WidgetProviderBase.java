package ir.realrate.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/**
 * Shared behaviour of the two widgets: draw from the cached feed at once, then fetch a fresh one
 * (Android calls onUpdate when the widget is placed, every half hour and after a reboot), and
 * fetch on the refresh button's broadcast.
 */
public abstract class WidgetProviderBase extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        WidgetRenderer.renderAll(context);
        WidgetRenderer.refreshAsync(context, goAsync(), false);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (WidgetRenderer.ACTION_REFRESH.equals(intent.getAction())) {
            WidgetRenderer.refreshAsync(context, goAsync(), true);
            return;
        }
        super.onReceive(context, intent);
    }
}
