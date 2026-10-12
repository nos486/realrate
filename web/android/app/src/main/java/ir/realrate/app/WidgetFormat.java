package ir.realrate.app;

import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Persian digits, prices, day changes and times for the home-screen widgets */
final class WidgetFormat {
    private static final Locale FA = new Locale("fa");

    private WidgetFormat() {}

    private static String number(double value, int minFraction, int maxFraction) {
        NumberFormat format = NumberFormat.getInstance(FA);
        format.setMinimumFractionDigits(minFraction);
        format.setMaximumFractionDigits(maxFraction);
        return format.format(value);
    }

    /** A whole number in Persian digits */
    static String count(long value) {
        return number(value, 0, 0);
    }

    /** A price in its own currency: dollars with cents (more under a dollar), tomans whole from 100 up */
    static String price(double value, boolean usd) {
        double abs = Math.abs(value);
        if (usd) {
            if (abs >= 1000) return "$" + number(value, 0, 0);
            if (abs >= 1) return "$" + number(value, 2, 2);
            return "$" + number(value, 0, 4);
        }
        if (abs >= 100) return number(Math.round(value), 0, 0);
        return number(value, 0, 2);
    }

    /** The day's change: an arrow and the percent ("▲ ۱٫۲۳٪"); empty when unknown */
    static String change(double pct, boolean known) {
        if (!known) return "";
        if (Math.abs(pct) < 0.005) return "۰٪";
        return (pct > 0 ? "▲ " : "▼ ") + number(Math.abs(pct), 0, 2) + "٪";
    }

    /** "الان", "۵ دقیقه پیش", "۳ ساعت پیش", "۲ روز پیش" */
    static String ago(long publishedAt, long now) {
        long minutes = Math.max(0, (now - publishedAt) / 60000L);
        if (minutes < 1) return "الان";
        if (minutes < 60) return count(minutes) + " دقیقه پیش";
        if (minutes < 60 * 24) return count(minutes / 60) + " ساعت پیش";
        return count(minutes / (60 * 24)) + " روز پیش";
    }

    /** The clock time in Tehran ("۱۴:۳۰") */
    static String clock(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("HH:mm", FA);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Tehran"));
        return format.format(new Date(millis));
    }
}
