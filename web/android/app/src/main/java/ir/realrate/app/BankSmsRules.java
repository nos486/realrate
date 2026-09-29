package ir.realrate.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Tells a bank's withdrawal or deposit message from its other messages (balance notices, ads,
 * messages from a sender that is not a bank's), with the same templates the app reads messages
 * with (nativeSmsRules in bankSms.js, sent by BankSms.configure / read): only a message that one
 * of its bank's templates reads reaches the app or gets a notification.
 *
 * Plain Java (no Android classes): the patterns are the templates' regex sources, matched on the
 * message normalized like normalizeSmsText in bankSms.js.
 */
final class BankSmsRules {

    static final class Rule {
        final Set<String> senders = new HashSet<>();
        final List<Pattern> patterns = new ArrayList<>();
    }

    private final List<Rule> rules;

    BankSmsRules(List<Rule> rules) {
        this.rules = rules == null ? Collections.<Rule>emptyList() : rules;
    }

    boolean isEmpty() {
        return rules.isEmpty();
    }

    /** A rule for one bank: its senders, and its templates' patterns (an invalid one is skipped) */
    static Rule rule(List<String> senders, List<String> patterns) {
        Rule rule = new Rule();
        for (String s : senders) {
            if (s != null && !s.isEmpty()) rule.senders.add(BankSmsPlugin.normalizeSender(s));
        }
        for (String source : patterns) {
            try {
                rule.patterns.add(Pattern.compile(source));
            } catch (PatternSyntaxException ignored) {
                // A template Java cannot read: its messages are not caught natively
            }
        }
        return rule;
    }

    /** One of the banks' senders */
    boolean isBankSender(String address) {
        String from = BankSmsPlugin.normalizeSender(address);
        for (Rule rule : rules) {
            if (rule.senders.contains(from)) return true;
        }
        return false;
    }

    /** A withdrawal or deposit: from a bank's sender, and read by one of that bank's templates */
    boolean isTransaction(String address, String body) {
        if (body == null || BankSmsPlugin.isSensitive(body)) return false;
        String from = BankSmsPlugin.normalizeSender(address);
        String text = null;
        for (Rule rule : rules) {
            if (!rule.senders.contains(from)) continue;
            if (text == null) text = normalize(body);
            for (Pattern pattern : rule.patterns) {
                if (pattern.matcher(text).find()) return true;
            }
        }
        return false;
    }

    private static final String PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
    private static final String ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
    /** Direction marks, zero-width characters (not the ZWNJ of Persian words) and the BOM */
    private static final Pattern INVISIBLE = Pattern.compile("[\\u200b\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]");
    private static final Pattern MINUS = Pattern.compile("[\\u2212\\u2012\\u2013\\u2014]");
    private static final Pattern SPACES = Pattern.compile("[ \\t\\u00a0]+");

    /** Same as normalizeSmsText in bankSms.js: one clean line per line, ASCII digits */
    static String normalize(String text) {
        StringBuilder digits = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            int p = PERSIAN_DIGITS.indexOf(c);
            int a = ARABIC_DIGITS.indexOf(c);
            if (p >= 0) digits.append((char) ('0' + p));
            else if (a >= 0) digits.append((char) ('0' + a));
            else if (c == 'ي') digits.append('ی');
            else if (c == 'ك') digits.append('ک');
            else if (c == '٬' || c == '،') digits.append(',');
            else if (c == '٫') digits.append('.');
            else digits.append(c);
        }
        String clean = INVISIBLE.matcher(digits).replaceAll("");
        clean = MINUS.matcher(clean).replaceAll("-");
        clean = clean.replace("\r\n", "\n").replace('\r', '\n');
        StringBuilder out = new StringBuilder(clean.length());
        for (String line : clean.split("\n", -1)) {
            String l = SPACES.matcher(line).replaceAll(" ").trim();
            if (l.isEmpty()) continue;
            if (out.length() > 0) out.append('\n');
            out.append(l);
        }
        return out.toString();
    }
}
