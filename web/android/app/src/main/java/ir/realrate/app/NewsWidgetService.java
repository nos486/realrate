package ir.realrate.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The rows of the news widget: the analyst's headline of the day first (when there is one), then
 * the day's top news with their category and age
 */
public class NewsWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final List<String[]> rows = new ArrayList<>(); // {label, time, title, important}

        Factory(Context context) {
            this.context = context;
        }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            rows.clear();
            JSONObject feed = WidgetFeed.cached(context);
            if (feed == null) return;
            long now = System.currentTimeMillis();
            JSONObject analysis = feed.optJSONObject("analysis");
            if (analysis != null && !analysis.optString("title").isEmpty()) {
                long at = analysis.optLong("at", 0);
                rows.add(new String[] {"تحلیل هوشمند امروز", at > 0 ? WidgetFormat.ago(at, now) : "", analysis.optString("title"), "1"});
            }
            JSONArray news = feed.optJSONArray("news");
            for (int i = 0; news != null && i < news.length(); i++) {
                JSONObject n = news.optJSONObject(i);
                if (n == null) continue;
                rows.add(new String[] {
                    n.optString("categoryLabel"),
                    WidgetFormat.ago(n.optLong("publishedAt"), now),
                    n.optString("title"),
                    n.optInt("importance", 1) >= 3 ? "1" : "0",
                });
            }
        }

        @Override public void onDestroy() {}

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget_news_row);
            if (position >= rows.size()) return view;
            String[] row = rows.get(position);
            boolean highlight = "1".equals(row[3]);
            view.setTextViewText(R.id.row_category, row[0]);
            view.setTextColor(R.id.row_category, Color.parseColor(highlight ? "#f59e0b" : "#38bdf8"));
            view.setTextViewText(R.id.row_time, row[1]);
            view.setTextViewText(R.id.row_title, row[2]);
            view.setOnClickFillInIntent(R.id.row_root, new Intent());
            return view;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }
    }
}
