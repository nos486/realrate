package ir.realrate.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;

/**
 * What the home-screen widgets show: the app's own feed (GET /api/widget, see api/src/handlers/widgetRoutes.js)
 * for the user's favourite items, kept as the last good copy so a widget still shows something offline.
 * The favourites are chosen in the app (web/src/shared/native/widgets.js); none chosen: the server's default list.
 */
final class WidgetFeed {
    static final String PREFS = "realrate_widgets";
    /** The app's API host (api/src/config/apiHosts.js NATIVE_API_ORIGIN) */
    private static final String API = "https://api.realrate.ir/api/widget";
    private static final String KEY_FAVORITES = "favorites";
    private static final String KEY_FEED = "feed";
    private static final String KEY_FEED_IDS = "feedIds";
    private static final String KEY_FETCHED_AT = "fetchedAt";
    private static final String KEY_OK = "ok";
    /** A refresh that isn't forced reuses a copy this fresh (two widgets update together) */
    private static final long MIN_GAP_MS = 20_000L;

    private WidgetFeed() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String join(List<String> ids) {
        StringBuilder out = new StringBuilder();
        for (String id : ids) {
            if (out.length() > 0) out.append(',');
            out.append(id);
        }
        return out.toString();
    }

    /** The favourites' book ids, in order (empty: none chosen) */
    static List<String> favorites(Context context) {
        List<String> ids = new ArrayList<>();
        for (String id : prefs(context).getString(KEY_FAVORITES, "").split(",")) {
            if (!id.trim().isEmpty()) ids.add(id.trim());
        }
        return ids;
    }

    static void setFavorites(Context context, List<String> ids) {
        prefs(context).edit().putString(KEY_FAVORITES, join(ids)).apply();
    }

    /** The last feed received, or null */
    static JSONObject cached(Context context) {
        String body = prefs(context).getString(KEY_FEED, null);
        if (body == null) return null;
        try {
            return new JSONObject(body);
        } catch (Exception e) {
            return null;
        }
    }

    /** When the cached feed was fetched (ms), 0 when never */
    static long fetchedAt(Context context) {
        return prefs(context).getLong(KEY_FETCHED_AT, 0L);
    }

    /** Whether the last attempt succeeded (false: the widget shows an older copy) */
    static boolean lastOk(Context context) {
        return prefs(context).getBoolean(KEY_OK, false);
    }

    /**
     * Fetch the feed now (blocking: call from a background thread).
     * @param force fetch even when a copy of the same favourites is only seconds old
     * @return whether a fresh copy is stored
     */
    static synchronized boolean refresh(Context context, boolean force) {
        SharedPreferences p = prefs(context);
        String ids = join(favorites(context));
        long now = System.currentTimeMillis();
        if (!force && p.getBoolean(KEY_OK, false) && ids.equals(p.getString(KEY_FEED_IDS, ""))
                && now - p.getLong(KEY_FETCHED_AT, 0L) < MIN_GAP_MS) {
            return true;
        }
        HttpURLConnection conn = null;
        try {
            String url = ids.isEmpty() ? API : API + "?ids=" + URLEncoder.encode(ids, "UTF-8");
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("Accept", "application/json");
            if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
            String body;
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) buffer.write(chunk, 0, n);
                body = buffer.toString("UTF-8");
            }
            if (!new JSONObject(body).optBoolean("success")) throw new Exception("not successful");
            p.edit()
                .putString(KEY_FEED, body)
                .putString(KEY_FEED_IDS, ids)
                .putLong(KEY_FETCHED_AT, now)
                .putBoolean(KEY_OK, true)
                .apply();
            return true;
        } catch (Exception e) {
            p.edit().putBoolean(KEY_OK, false).apply();
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
