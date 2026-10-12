package ir.realrate.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

/** The rows of the prices widget: name, unit, price in its own currency and the day's change */
public class PricesWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private JSONArray rows = new JSONArray();

        Factory(Context context) {
            this.context = context;
        }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            JSONObject feed = WidgetFeed.cached(context);
            JSONArray prices = feed == null ? null : feed.optJSONArray("prices");
            rows = prices == null ? new JSONArray() : prices;
        }

        @Override public void onDestroy() {}

        @Override
        public int getCount() {
            return rows.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget_price_row);
            JSONObject row = rows.optJSONObject(position);
            if (row == null) return view;
            boolean usd = "usd".equals(row.optString("currency"));
            boolean known = !row.isNull("changePct");
            double change = row.optDouble("changePct", 0);
            view.setTextViewText(R.id.row_name, row.optString("name"));
            view.setTextViewText(R.id.row_unit, row.optString("unit"));
            view.setTextViewText(R.id.row_price, WidgetFormat.price(row.optDouble("price"), usd));
            view.setTextViewText(R.id.row_change, WidgetFormat.change(change, known));
            int color = !known || Math.abs(change) < 0.005 ? Color.parseColor("#94a3b8")
                : change > 0 ? Color.parseColor("#34d399") : Color.parseColor("#fb7185");
            view.setTextColor(R.id.row_change, color);
            view.setOnClickFillInIntent(R.id.row_root, new Intent());
            return view;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }
    }
}
