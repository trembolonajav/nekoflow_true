package com.nekoflow.catalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Encontra obras que são a mesma obra vinda de fontes diferentes e propõe como fundi-las.
 * Identidade forte: o mesmo ID AniList/MAL. Identidade fraca: o mesmo título normalizado
 * (sempre vai para revisão). Cada temporada/edição da duplicata recebe uma proposta:
 * somar a uma temporada/edição da obra principal, entrar como nova, ou ficar de fora.
 */
@Service
public class WorkIdentityService {

    static final Set<String> STRONG = Set.of("ANILIST", "MAL");
    static final String MAP = "MAP", NEW = "NEW", SKIP = "SKIP";
    private static final Set<String> SPECIAL_FORMATS = Set.of("MOVIE", "SPECIAL", "OVA");
    private static final int MAX_TITLE_GROUP = 4;

    private final JdbcClient jdbc;

    public WorkIdentityService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    record Unit(UUID id, String title, String number, BigDecimal sort, int count, int available, String language) {}

    record WorkStats(long id, String family, String kind, String title, Integer year, String format, String slug,
                     String cover, Set<String> titles, Map<String, Set<String>> strong, Set<String> providers,
                     List<Unit> units, int users) {
        boolean reading() {
            return "READING".equals(family);
        }

        int total() {
            return units.stream().mapToInt(Unit::count).sum();
        }
    }

    /** Destino de cada temporada/edição da duplicata: MAP (soma a target), NEW ou SKIP. */
    record Step(UUID unit, String action, UUID target) {}

    record Proposal(List<Step> steps, boolean confident, List<String> notes) {}

    record Edge(long a, long b, String reason, boolean strong) {}

    // ---------------------------------------------------------------- detecção

    public Map<String, Object> candidates() {
        Map<Long, String[]> works = new HashMap<>();
        jdbc.sql("""
                SELECT id, media_family, title, year, work_format FROM work
                WHERE visibility='PUBLISHED' AND merged_into_id IS NULL""")
                .query((rs, n) -> works.put(rs.getLong(1), new String[] {rs.getString(2), rs.getString(3),
                        rs.getObject(4) == null ? null : rs.getString(4), rs.getString(5)}))
                .list();
        Map<Long, Map<String, Set<String>>> strong = strongIds(works.keySet());
        Set<String> dismissed = new HashSet<>(jdbc.sql(
                "SELECT low_work_id || ':' || high_work_id FROM work_identity_decision").query(String.class).list());

        List<Edge> edges = new ArrayList<>();
        // Mesmo ID AniList/MAL dentro da mesma família.
        Map<String, List<Long>> byStrong = new HashMap<>();
        strong.forEach((id, ids) -> ids.forEach((provider, values) -> values.forEach(v ->
                byStrong.computeIfAbsent(works.get(id)[0] + "|" + provider + "|" + v, k -> new ArrayList<>()).add(id))));
        byStrong.forEach((key, ids) -> {
            String[] parts = key.split("\\|");
            pairs(ids, (a, b) -> edges.add(new Edge(a, b, "Mesmo " + label(parts[1]) + " #" + parts[2], true)));
        });
        // Mesmo título normalizado (principal, inglês, romaji ou original).
        Map<String, Set<Long>> byTitle = new HashMap<>();
        works.forEach((id, w) -> addTitle(byTitle, w[0], w[1], id));
        jdbc.sql("""
                SELECT t.work_id, t.title FROM work_title t JOIN work w ON w.id=t.work_id
                WHERE t.title_type IN ('PRIMARY','ENGLISH','ROMAJI','ORIGINAL')
                  AND w.visibility='PUBLISHED' AND w.merged_into_id IS NULL""")
                .query((rs, n) -> {
                    long id = rs.getLong(1);
                    String[] w = works.get(id);
                    if (w != null) addTitle(byTitle, w[0], rs.getString(2), id);
                    return null;
                })
                .list();
        byTitle.values().stream().filter(ids -> ids.size() > 1 && ids.size() <= MAX_TITLE_GROUP).forEach(ids ->
                pairs(new ArrayList<>(ids), (a, b) -> {
                    if (titleCompatible(works.get(a), works.get(b), strong.get(a), strong.get(b))) {
                        edges.add(new Edge(a, b, "Mesmo título", false));
                    }
                }));

        // Agrupa os pares em grupos (A=B e B=C viram um grupo só).
        Map<Long, Long> parent = new HashMap<>();
        Map<String, Edge> best = new LinkedHashMap<>();
        for (Edge e : edges) {
            String key = Math.min(e.a, e.b) + ":" + Math.max(e.a, e.b);
            if (dismissed.contains(key)) continue;
            Edge prev = best.get(key);
            if (prev == null || (!prev.strong && e.strong)) best.put(key, e);
            union(parent, e.a, e.b);
        }
        Map<Long, List<Long>> groups = new HashMap<>();
        best.values().forEach(e -> groups.computeIfAbsent(find(parent, e.a), k -> new ArrayList<>()));
        new ArrayList<>(parent.keySet()).forEach(id -> {
            List<Long> g = groups.get(find(parent, id));
            if (g != null && !g.contains(id)) g.add(id);
        });

        Set<Long> all = new HashSet<>();
        groups.values().forEach(all::addAll);
        Map<Long, WorkStats> stats = stats(all);
        List<Map<String, Object>> clusters = new ArrayList<>();
        int high = 0;
        for (List<Long> ids : groups.values()) {
            List<WorkStats> members = ids.stream().map(stats::get).filter(Objects::nonNull).toList();
            if (members.size() < 2) continue;
            WorkStats target = canonical(members);
            List<Map<String, Object>> sources = new ArrayList<>();
            boolean allConfident = true;
            for (WorkStats source : members) {
                if (source.id() == target.id()) continue;
                Edge edge = edgeBetween(best, source.id(), target.id(), ids);
                Proposal p = propose(source, target, edge != null && edge.strong);
                allConfident &= p.confident();
                Map<String, Object> m = card(source);
                m.put("reason", edge == null ? "Mesmo grupo" : edge.reason);
                m.put("confidence", p.confident() ? "alta" : "revisar");
                m.put("notes", p.notes());
                m.put("plan", planView(p));
                sources.add(m);
            }
            if (allConfident) high++;
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("key", ids.stream().sorted().map(String::valueOf).reduce((a, b) -> a + "-" + b).orElse(""));
            c.put("family", target.family());
            c.put("confidence", allConfident ? "alta" : "revisar");
            c.put("target", card(target));
            c.put("sources", sources);
            clusters.add(c);
        }
        clusters.sort(Comparator.<Map<String, Object>, Boolean>comparing(c -> !"alta".equals(c.get("confidence")))
                .thenComparing(c -> String.valueOf(((Map<?, ?>) c.get("target")).get("title")), String.CASE_INSENSITIVE_ORDER));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("clusters", clusters);
        out.put("total", clusters.size());
        out.put("high", high);
        out.put("merged", jdbc.sql("SELECT count(*) FROM work_merge").query(Long.class).single());
        return out;
    }

    /** Proposta padrão para fundir source em target, recalculada no momento da fusão. */
    public Proposal proposal(long sourceId, long targetId) {
        Map<Long, WorkStats> s = stats(Set.of(sourceId, targetId));
        WorkStats source = s.get(sourceId), target = s.get(targetId);
        if (source == null || target == null) throw new IllegalArgumentException("Obra não encontrada");
        boolean strongEdge = source.strong().entrySet().stream().anyMatch(e ->
                e.getValue().stream().anyMatch(v -> target.strong().getOrDefault(e.getKey(), Set.of()).contains(v)));
        return propose(source, target, strongEdge);
    }

    /** Mesma proposta, para o painel, quando a pessoa troca qual obra é a principal. */
    public Map<String, Object> proposalView(long sourceId, long targetId) {
        Map<Long, WorkStats> s = stats(Set.of(sourceId, targetId));
        if (s.get(sourceId) == null || s.get(targetId) == null) throw new IllegalArgumentException("Obra não encontrada");
        Proposal p = proposal(sourceId, targetId);
        Map<String, Object> source = card(s.get(sourceId));
        source.put("confidence", p.confident() ? "alta" : "revisar");
        source.put("notes", p.notes());
        source.put("plan", planView(p));
        return Map.of("target", card(s.get(targetId)), "source", source);
    }

    private static List<Map<String, Object>> planView(Proposal p) {
        return p.steps().stream().map(s -> {
            Map<String, Object> step = new LinkedHashMap<>();
            step.put("unit", s.unit().toString());
            step.put("action", s.action());
            step.put("target", s.target() == null ? null : s.target().toString());
            return step;
        }).toList();
    }

    // ---------------------------------------------------------------- regras (testáveis)

    /** Obra principal: a que já organiza mais temporadas; depois a que nasceu do AniList; depois a mais completa. */
    static WorkStats canonical(List<WorkStats> members) {
        return members.stream().min(Comparator
                .comparingInt((WorkStats w) -> -(w.reading() ? 0 : (int) w.units().stream().filter(u -> u.count() > 0).count()))
                .thenComparingInt(w -> w.strong().getOrDefault("ANILIST", Set.of()).contains(String.valueOf(w.id())) ? 0 : 1)
                .thenComparingInt(w -> w.strong().containsKey("ANILIST") ? 0 : 1)
                .thenComparingInt(w -> -w.total())
                .thenComparingLong(WorkStats::id))
                .orElseThrow();
    }

    static Proposal propose(WorkStats source, WorkStats target, boolean strongEdge) {
        List<Step> steps = new ArrayList<>();
        List<String> notes = new ArrayList<>();
        boolean confident = strongEdge;
        if (!strongEdge) notes.add("Só o título coincide: confira antes de fundir");
        if (!source.reading() && formatClass(source.format()) != formatClass(target.format())) {
            confident = false;
            notes.add("Formatos diferentes (" + source.format() + " × " + target.format() + ")");
        }
        if (source.reading()) {
            for (Unit e : source.units()) {
                Unit same = target.units().stream().filter(t -> Objects.equals(t.language(), e.language())).findFirst().orElse(null);
                steps.add(same == null ? new Step(e.id(), NEW, null) : new Step(e.id(), MAP, same.id()));
            }
            return new Proposal(steps, confident, notes);
        }
        List<Unit> src = source.units().stream().filter(u -> u.count() > 0).toList();
        List<Unit> dst = target.units();
        if (src.size() != dst.stream().filter(u -> u.count() > 0).count()) {
            confident = false;
            notes.add("Temporadas diferentes: " + src.size() + " × " + dst.stream().filter(u -> u.count() > 0).count());
        }
        Set<String> common = commonTokens(dst);
        for (Unit s : src) {
            Unit match = null;
            if (src.size() == 1 && dst.size() == 1) match = dst.get(0);
            if (match == null) match = byDistinctTitle(s, src.size() == 1 ? source.titles() : Set.of(), dst, common);
            if (match == null) {
                match = dst.stream().filter(t -> t.sort().compareTo(s.sort()) == 0
                        && CatalogTitlePolicy.norm(t.title()).equals(CatalogTitlePolicy.norm(s.title()))).findFirst().orElse(null);
            }
            if (match == null && src.size() == 1) {
                List<Unit> sameCount = dst.stream().filter(t -> Math.abs(t.count() - s.count()) <= 1).toList();
                if (sameCount.size() == 1) match = sameCount.get(0);
            }
            if (match == null && dst.size() == 1 && src.size() == dst.size()) match = dst.get(0);
            if (match != null) {
                if (!countsCompatible(s, match)) {
                    confident = false;
                    notes.add("\"" + s.title() + "\" tem " + s.count() + " episódios e \"" + match.title() + "\" " + match.count());
                }
                steps.add(new Step(s.id(), MAP, match.id()));
            } else if (dst.stream().noneMatch(t -> t.sort().compareTo(s.sort()) == 0)) {
                steps.add(new Step(s.id(), NEW, null));
            } else {
                confident = false;
                notes.add("Não achei par seguro para \"" + s.title() + "\"");
                steps.add(new Step(s.id(), SKIP, null));
            }
        }
        if (steps.stream().anyMatch(s -> SKIP.equals(s.action()))) confident = false;
        return new Proposal(steps, confident, notes);
    }

    static boolean countsCompatible(Unit s, Unit t) {
        if (s.count() == 0 || t.count() == 0) return true;
        return Math.abs(s.count() - t.count()) <= 2 || s.count() <= t.count();
    }

    private static int formatClass(String format) {
        return format == null ? 0 : SPECIAL_FORMATS.contains(format) ? 2 : 1;
    }

    /** Temporada cujo título tem palavras próprias em comum (ex.: "Final" em "Final Season"). */
    private static Unit byDistinctTitle(Unit s, Set<String> extra, List<Unit> dst, Set<String> common) {
        if (dst.size() < 2) return null;
        Set<String> tokens = new HashSet<>(tokens(s.title()));
        extra.forEach(t -> tokens.addAll(tokens(t)));
        tokens.removeAll(common);
        Unit best = null;
        int bestScore = 0;
        boolean tie = false;
        for (Unit t : dst) {
            Set<String> tt = new HashSet<>(tokens(t.title()));
            tt.removeAll(common);
            tt.retainAll(tokens);
            if (tt.size() > bestScore) {
                best = t;
                bestScore = tt.size();
                tie = false;
            } else if (tt.size() == bestScore && bestScore > 0) {
                tie = true;
            }
        }
        return tie ? null : best;
    }

    private static Set<String> commonTokens(List<Unit> units) {
        Set<String> common = null;
        for (Unit u : units) {
            Set<String> t = tokens(u.title());
            if (common == null) common = new HashSet<>(t);
            else common.retainAll(t);
        }
        return common == null ? Set.of() : common;
    }

    private static Set<String> tokens(String title) {
        Set<String> out = new LinkedHashSet<>();
        for (String t : CatalogTitlePolicy.norm(title).split(" ")) {
            if (t.length() > 2 && !t.chars().allMatch(Character::isDigit) && !Set.of("the", "season", "part", "and").contains(t)) out.add(t);
        }
        return out;
    }

    static boolean titleCompatible(String[] a, String[] b, Map<String, Set<String>> sa, Map<String, Set<String>> sb) {
        if (a == null || b == null || !a[0].equals(b[0])) return false;
        // IDs fortes diferentes no mesmo provedor: são obras diferentes com o mesmo nome.
        if (sa != null && sb != null) {
            for (var e : sa.entrySet()) {
                Set<String> other = sb.get(e.getKey());
                if (other != null && java.util.Collections.disjoint(other, e.getValue())) return false;
            }
        }
        if (a[2] != null && b[2] != null && Math.abs(Integer.parseInt(a[2]) - Integer.parseInt(b[2])) > 1) return false;
        return !"ANIMATION".equals(a[0]) || formatClass(a[3]) == formatClass(b[3]) || a[3] == null || b[3] == null;
    }

    // ---------------------------------------------------------------- dados

    Map<Long, WorkStats> stats(Set<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        Map<Long, Map<String, Set<String>>> strong = strongIds(ids);
        Map<Long, Set<String>> providers = new HashMap<>();
        jdbc.sql("SELECT DISTINCT work_id, provider FROM external_identifier WHERE work_id IN (:ids)").param("ids", ids)
                .query((rs, n) -> providers.computeIfAbsent(rs.getLong(1), k -> new LinkedHashSet<>()).add(rs.getString(2)))
                .list();
        Map<Long, Set<String>> titles = new HashMap<>();
        jdbc.sql("SELECT work_id, title FROM work_title WHERE work_id IN (:ids) AND title_type IN ('PRIMARY','ENGLISH','ROMAJI','ORIGINAL')")
                .param("ids", ids)
                .query((rs, n) -> titles.computeIfAbsent(rs.getLong(1), k -> new LinkedHashSet<>()).add(rs.getString(2)))
                .list();
        Map<Long, List<Unit>> units = new HashMap<>();
        jdbc.sql("""
                SELECT s.work_id, s.id, s.title, s.display_number, s.sort_position, count(e.id),
                       count(e.id) FILTER (WHERE e.availability<>'UNAVAILABLE')
                FROM season s LEFT JOIN episode e ON e.season_id=s.id
                WHERE s.work_id IN (:ids) GROUP BY s.id ORDER BY s.sort_position""")
                .param("ids", ids)
                .query((rs, n) -> units.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>()).add(new Unit(
                        rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4), rs.getBigDecimal(5),
                        rs.getInt(6), rs.getInt(7), null)))
                .list();
        jdbc.sql("""
                SELECT ed.work_id, ed.id, ed.name, ed.language, count(c.id),
                       count(c.id) FILTER (WHERE c.availability<>'UNAVAILABLE')
                FROM work_edition ed LEFT JOIN chapter c ON c.edition_id=ed.id
                WHERE ed.work_id IN (:ids) GROUP BY ed.id ORDER BY ed.language, ed.name""")
                .param("ids", ids)
                .query((rs, n) -> units.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>()).add(new Unit(
                        rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4), BigDecimal.ZERO,
                        rs.getInt(5), rs.getInt(6), rs.getString(4))))
                .list();
        Map<Long, Integer> users = new HashMap<>();
        jdbc.sql("""
                SELECT work_id, count(*) FROM (
                  SELECT work_id FROM library_entry WHERE work_id IN (:ids)
                  UNION ALL SELECT work_id FROM favorite WHERE work_id IN (:ids)
                  UNION ALL SELECT work_id FROM work_follow WHERE work_id IN (:ids)) u GROUP BY work_id""")
                .param("ids", ids)
                .query((rs, n) -> users.put(rs.getLong(1), rs.getInt(2)))
                .list();
        Map<Long, WorkStats> out = new HashMap<>();
        jdbc.sql("SELECT id, media_family, kind, title, year, work_format, slug, cover FROM work WHERE id IN (:ids)")
                .param("ids", ids)
                .query((rs, n) -> {
                    long id = rs.getLong(1);
                    Set<String> t = new LinkedHashSet<>();
                    t.add(rs.getString(4));
                    t.addAll(titles.getOrDefault(id, Set.of()));
                    return out.put(id, new WorkStats(id, rs.getString(2), rs.getString(3), rs.getString(4),
                            (Integer) rs.getObject(5), rs.getString(6), rs.getString(7), rs.getString(8), t,
                            strong.getOrDefault(id, Map.of()), providers.getOrDefault(id, Set.of()),
                            units.getOrDefault(id, List.of()), users.getOrDefault(id, 0)));
                })
                .list();
        return out;
    }

    private Map<Long, Map<String, Set<String>>> strongIds(Set<Long> ids) {
        Map<Long, Map<String, Set<String>>> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        jdbc.sql("SELECT work_id, provider, external_id FROM external_identifier WHERE provider IN ('ANILIST','MAL')")
                .query((rs, n) -> {
                    long id = rs.getLong(1);
                    if (ids.contains(id)) {
                        out.computeIfAbsent(id, k -> new HashMap<>())
                                .computeIfAbsent(rs.getString(2), k -> new LinkedHashSet<>()).add(rs.getString(3));
                    }
                    return null;
                })
                .list();
        return out;
    }

    static Map<String, Object> card(WorkStats w) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", w.id());
        m.put("title", w.title());
        m.put("slug", w.slug());
        m.put("family", w.family());
        m.put("kind", w.kind());
        m.put("year", w.year());
        m.put("format", w.format());
        m.put("cover", w.cover());
        m.put("providers", w.providers());
        m.put("anilist", w.strong().getOrDefault("ANILIST", Set.of()));
        m.put("users", w.users());
        m.put("units", w.units().stream().map(u -> {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", u.id().toString());
            x.put("title", u.title());
            x.put("number", u.number());
            x.put("count", u.count());
            x.put("available", u.available());
            x.put("language", u.language());
            return x;
        }).toList());
        return m;
    }

    private static Edge edgeBetween(Map<String, Edge> best, long a, long b, List<Long> group) {
        Edge direct = best.get(Math.min(a, b) + ":" + Math.max(a, b));
        if (direct != null) return direct;
        return best.values().stream().filter(e -> (e.a == a || e.b == a) && group.contains(e.a) && group.contains(e.b))
                .max(Comparator.comparing(e -> e.strong)).orElse(null);
    }

    private static void addTitle(Map<String, Set<Long>> byTitle, String family, String title, long id) {
        String n = CatalogTitlePolicy.norm(title);
        if (n.replace(" ", "").length() < 4) return;
        byTitle.computeIfAbsent(family + "|" + n, k -> new LinkedHashSet<>()).add(id);
    }

    private static String label(String provider) {
        return "ANILIST".equals(provider) ? "AniList" : provider;
    }

    private static void pairs(List<Long> ids, java.util.function.BiConsumer<Long, Long> fn) {
        List<Long> distinct = ids.stream().distinct().sorted().toList();
        for (int i = 0; i < distinct.size(); i++) {
            for (int j = i + 1; j < distinct.size(); j++) fn.accept(distinct.get(i), distinct.get(j));
        }
    }

    private static long find(Map<Long, Long> parent, long x) {
        long root = x;
        while (parent.getOrDefault(root, root) != root) root = parent.get(root);
        parent.put(x, root);
        return root;
    }

    private static void union(Map<Long, Long> parent, long a, long b) {
        parent.putIfAbsent(a, a);
        parent.putIfAbsent(b, b);
        long ra = find(parent, a), rb = find(parent, b);
        if (ra != rb) parent.put(Math.max(ra, rb), Math.min(ra, rb));
    }
}
