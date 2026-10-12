package ir.realrate.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

/**
 * The home-screen widget (res/xml/widget_market_info.xml): favourite prices above, AI news below.
 * Android calls onUpdate when it is placed, after a reboot and every half hour at most (the system's
 * own period); the 10-minute refresh is WidgetRenderer.scheduleNext, an alarm that comes back here
 * as ACTION_REFRESH, as does the refresh button.
 */
public class MarketWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        WidgetRenderer.renderAll(context);
        WidgetRenderer.scheduleNext(context);
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

    @Override
    public void onEnabled(Context context) {
        WidgetRenderer.scheduleNext(context);
    }

    @Override
    public void onDisabled(Context context) {
        WidgetRenderer.cancelNext(context);
    }
}
