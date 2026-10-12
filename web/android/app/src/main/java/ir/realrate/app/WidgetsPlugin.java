package ir.realrate.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * The home-screen widgets' side of the app (web/src/shared/native/widgets.js): the favourite items
 * of the prices widget, a refresh, and asking the launcher to place a widget.
 *
 * JS: Widgets.getFavorites() → { ids }          ([] = none chosen, the server's default list shows)
 *     Widgets.setFavorites({ ids })             (saves, then refreshes the widgets)
 *     Widgets.refresh()
 *     Widgets.requestPin({ kind: "prices" | "news" }) → { requested }   (Android 8+ launchers that allow it)
 */
@CapacitorPlugin(name = "Widgets")
public class WidgetsPlugin extends Plugin {

    @PluginMethod
    public void getFavorites(PluginCall call) {
        JSArray ids = new JSArray();
        for (String id : WidgetFeed.favorites(getContext())) ids.put(id);
        JSObject ret = new JSObject();
        ret.put("ids", ids);
        call.resolve(ret);
    }

    @PluginMethod
    public void setFavorites(PluginCall call) {
        JSArray array = call.getArray("ids");
        List<String> ids = new ArrayList<>();
        for (int i = 0; array != null && i < array.length(); i++) {
            String id = array.optString(i, "").trim();
            if (!id.isEmpty() && !id.contains(",") && !ids.contains(id)) ids.add(id);
        }
        WidgetFeed.setFavorites(getContext(), ids);
        WidgetRenderer.refreshAsync(getContext(), null, true);
        call.resolve();
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        if (WidgetRenderer.anyPlaced(getContext())) WidgetRenderer.refreshAsync(getContext(), null, true);
        call.resolve();
    }

    @PluginMethod
    public void requestPin(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();
        boolean requested = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            Class<?> provider = "news".equals(call.getString("kind")) ? NewsWidgetProvider.class : PricesWidgetProvider.class;
            if (manager.isRequestPinAppWidgetSupported()) {
                requested = manager.requestPinAppWidget(new ComponentName(context, provider), null, null);
            }
        }
        ret.put("requested", requested);
        call.resolve(ret);
    }
}
