package com.nekoflow.catalog;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Regras comuns para identidade editorial de séries e temporadas. */
final class CatalogTitlePolicy {

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_WORD = Pattern.compile("[^a-z0-9]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern GENERIC_SUFFIX = Pattern.compile(
            "(?i)(?:[\\s:–—-]+(?:the\\s+)?(?:final\\s+)?(?:\\d+(?:st|nd|rd|th)\\s+)?season(?:\\s+\\d+)?|" +
            "[\\s:–—-]+(?:part|cour)\\s+\\d+|[\\s:–—-]+\\d+(?:st|nd|rd|th)\\s+(?:season|part)|" +
            "[\\s:–—-]+(?:ii|iii|iv|v))+$");
    private static final Set<String> WEAK = Set.of(
            "a", "an", "and", "as", "at", "de", "do", "da", "e", "for", "in", "no", "of", "on",
            "part", "season", "the", "to", "wa", "with");

    private CatalogTitlePolicy() {
    }

    static String canonicalSeriesTitle(String value) {
        if (value == null || value.isBlank()) return value;
        String result = value.strip();
        String previous;
        do {
            previous = result;
            result = GENERIC_SUFFIX.matcher(result).replaceFirst("").strip();
        } while (!result.equals(previous));
        return result.isBlank() ? value.strip() : result;
    }

    static boolean sameSeries(String left, String right) {
        String a = norm(canonicalSeriesTitle(left));
        String b = norm(canonicalSeriesTitle(right));
        if (a.isBlank() || b.isBlank()) return false;
        if (a.equals(b)) return true;
        Set<String> aa = strongTokens(a);
        Set<String> bb = strongTokens(b);
        if (aa.isEmpty() || bb.isEmpty()) return false;
        Set<String> common = new LinkedHashSet<>(aa);
        common.retainAll(bb);
        int shortest = Math.min(aa.size(), bb.size());
        return common.size() >= Math.min(2, shortest)
                && ((double) common.size() / shortest) >= 0.50;
    }

    private static Set<String> strongTokens(String value) {
        Set<String> out = new LinkedHashSet<>();
        Arrays.stream(value.split(" "))
                .filter(token -> token.length() > 1 && !WEAK.contains(token) && !token.chars().allMatch(Character::isDigit))
                .forEach(out::add);
        return out;
    }

    static String norm(String value) {
        if (value == null) return "";
        String ascii = DIACRITICS.matcher(Normalizer.normalize(value, Normalizer.Form.NFKD))
                .replaceAll("").toLowerCase(Locale.ROOT).replace('&', ' ');
        return NON_WORD.matcher(ascii).replaceAll(" ").strip().replaceAll("\\s+", " ");
    }
}
