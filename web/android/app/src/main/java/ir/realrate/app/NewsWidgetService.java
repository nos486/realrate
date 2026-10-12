package ir.realrate.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The news rows of the widget: the AI analyst's headline of the day first (when there is one), then
 * the day's AI-picked news with their category and age (the feed carries only those)
 */
public class NewsWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final List<String[]> rows = new ArrayList<>(); // {label, time, title, kind: "a" analysis, "h" important, "n" normal, summary}

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
                rows.add(new String[] {"تحلیل هوشمند امروز", at > 0 ? WidgetFormat.ago(at, now) : "", analysis.optString("title"), "a", analysis.optString("summary")});
            }
            JSONArray news = feed.optJSONArray("news");
            for (int i = 0; news != null && i < news.length(); i++) {
                JSONObject n = news.optJSONObject(i);
                if (n == null) continue;
                rows.add(new String[] {
                    n.optString("categoryLabel"),
                    WidgetFormat.ago(n.optLong("publishedAt"), now),
                    n.optString("title"),
                    n.optInt("importance", 1) >= 3 ? "h" : "n",
                    "",
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
            // The analysis is a violet card with its summary, an important item amber, the rest the app's blue
            boolean analysis = "a".equals(row[3]);
            boolean important = "h".equals(row[3]);
            view.setTextViewText(R.id.row_category, row[0]);
            view.setTextColor(R.id.row_category, Color.parseColor(analysis ? "#a78bfa" : important ? "#f59e0b" : "#38bdf8"));
            view.setInt(R.id.row_category, "setBackgroundResource",
                analysis ? R.drawable.widget_chip_violet : important ? R.drawable.widget_chip_amber : R.drawable.widget_chip_accent);
            view.setInt(R.id.row_card, "setBackgroundResource", analysis ? R.drawable.widget_card_analysis : R.drawable.widget_card_news);
            view.setTextViewText(R.id.row_time, row[1]);
            view.setTextViewText(R.id.row_title, row[2]);
            view.setTextViewText(R.id.row_summary, row[4]);
            view.setViewVisibility(R.id.row_summary, analysis && !row[4].isEmpty() ? View.VISIBLE : View.GONE);
            view.setOnClickFillInIntent(R.id.row_root, new Intent());
            return view;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }
    }
}
