package dev.varar.core;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Oath drift detection — port of {@code var-core/src/drift.ts}.
 *
 * <p>A paragraph the committed {@code varar.lock.json} baseline recorded as an example that now
 * matches no step. Pure over the existing {@link Ast.Doc} + {@link Plan.ExecutionPlan}, and
 * byte-identical to the TypeScript and Python ports so a baseline written by one runs green under
 * the others: the same FNV-1a fingerprint ({@link Hash}), the same {@code varar.lock.json} bytes
 * (insertion-ordered keys, sorted oath paths, raw non-ASCII), and the same similarity semantics.
 */
public final class Drift {

    private Drift() {}

    /**
     * A baseline example is re-identified in the edited source by text: an exact name match, else
     * the most word-similar paragraph at or above this threshold. So a paragraph may be moved
     * anywhere and reworded up to ~half its words and still be recognized; past that it reads as a
     * fresh paragraph (remove + add), not drift.
     */
    public static final double SIMILARITY_THRESHOLD = 0.5;

    /** One example-producing paragraph, as recorded in the baseline. */
    public record BaselineExample(String name, int line) {}

    /** The committed baseline for one oath file. */
    public record OathBaseline(String sourceHash, List<BaselineExample> examples) {
        public OathBaseline {
            examples = List.copyOf(examples);
        }
    }

    /** The whole {@code varar.lock.json}: every oath keyed by its POSIX path. */
    public record LockFile(int version, Map<String, OathBaseline> oaths) {
        public LockFile {
            oaths = Collections.unmodifiableMap(new LinkedHashMap<>(oaths));
        }
    }

    /** A paragraph the baseline says was an example and now matches no step. */
    public record Drifted(String name, int line, Span span) {}

    /**
     * Persistence port for {@code varar.lock.json}. The core owns the format; adapters move only raw
     * text (a filesystem store on disk, an in-memory store).
     */
    public interface BaselineStore {
        /** The whole lockfile's contents, or {@code null} when there is no baseline yet. */
        String read();

        void write(String contents);
    }

    // ---- detection ---------------------------------------------------------

    private static final Pattern TOKEN = Pattern.compile("[\\p{L}\\p{N}]+");

    // Do the two spans overlap at all (offset ranges intersect)? A candidate paragraph relates to
    // its planned example either way round: a header-bound row sits *inside* its binding paragraph,
    // while a merged example's span *covers* each of the candidates it absorbed (ADR 0012). Overlap
    // catches both.
    private static boolean overlaps(Span a, Span b) {
        return a.startOffset() < b.endOffset() && b.startOffset() < a.endOffset();
    }

    // A candidate paragraph is "live" (still an example) if it overlaps at least one planned
    // example. A now-prose paragraph — one whose step def was renamed or deleted — overlaps none (it
    // became a delimiter, splitting any example it was part of), so drift catches it.
    private static boolean isLive(Span candidateSpan, Plan.ExecutionPlan plan) {
        for (Plan.PlannedExample pe : plan.examples()) {
            if (overlaps(pe.span(), candidateSpan)) return true;
        }
        return false;
    }

    private static Set<String> tokenize(String text) {
        Set<String> set = new HashSet<>();
        Matcher m = TOKEN.matcher(text.toLowerCase(Locale.ROOT));
        while (m.find()) set.add(m.group());
        return set;
    }

    private static double similarity(Set<String> a, Set<String> b) {
        if (a.isEmpty() && b.isEmpty()) return 1.0;
        int intersection = 0;
        for (String t : a) {
            if (b.contains(t)) intersection++;
        }
        int union = a.size() + b.size() - intersection;
        return union == 0 ? 0.0 : (double) intersection / union;
    }

    /** The current example-producing paragraphs, in document order. */
    public static List<BaselineExample> liveExamples(Ast.Doc doc, Plan.ExecutionPlan plan) {
        List<BaselineExample> out = new ArrayList<>();
        for (Ast.Example c : doc.examples()) {
            if (isLive(c.span(), plan)) {
                out.add(new BaselineExample(
                        Plan.deriveExampleName(c.body()), c.span().startLine()));
            }
        }
        return out;
    }

    /** The full baseline record for an oath: fingerprint plus live examples. */
    public static OathBaseline deriveOathBaseline(String source, Ast.Doc doc, Plan.ExecutionPlan plan) {
        return new OathBaseline(Hash.hashSource(source), liveExamples(doc, plan));
    }

    /**
     * Paragraphs the baseline recorded as examples that now match zero steps. Each is re-identified
     * by the most word-similar current paragraph at/above {@link #SIMILARITY_THRESHOLD} (an exact
     * name scores 1; ties break toward the nearest line). No sourceHash short-circuit — a step
     * rename leaves the hash untouched.
     */
    public static List<Drifted> detectDrift(OathBaseline baseline, Ast.Doc doc, Plan.ExecutionPlan plan) {
        List<Drifted> drifts = new ArrayList<>();
        if (baseline == null) return drifts;
        List<Ast.Example> candidates = doc.examples();
        int n = candidates.size();
        List<Set<String>> tokens = new ArrayList<>(n);
        boolean[] live = new boolean[n];
        for (int i = 0; i < n; i++) {
            tokens.add(tokenize(Plan.deriveExampleName(candidates.get(i).body())));
            live[i] = isLive(candidates.get(i).span(), plan);
        }
        for (BaselineExample b : baseline.examples()) {
            Set<String> bTokens = tokenize(b.name());
            int bestIdx = -1;
            double bestScore = 0.0;
            for (int i = 0; i < n; i++) {
                double score = similarity(bTokens, tokens.get(i));
                if (score < SIMILARITY_THRESHOLD) continue;
                int line = candidates.get(i).span().startLine();
                int bestLine = bestIdx >= 0 ? candidates.get(bestIdx).span().startLine() : 0;
                if (bestIdx < 0
                        || score > bestScore
                        || (score == bestScore && Math.abs(line - b.line()) < Math.abs(bestLine - b.line()))) {
                    bestIdx = i;
                    bestScore = score;
                }
            }
            if (bestIdx < 0 || live[bestIdx]) continue;
            Ast.Example cand = candidates.get(bestIdx);
            drifts.add(new Drifted(b.name(), cand.span().startLine(), cand.span()));
        }
        return drifts;
    }

    /** The human-readable message for a drift — same wording as the TS/Python drift diagnostic. */
    public static String message(Drifted d) {
        return "This paragraph was an example and no longer matches any step (drift): \""
                + d.name()
                + "\".\nFix the step so it matches again, or accept it as prose (run in update mode).";
    }

    /**
     * One oath's baseline reconciliation against a {@link BaselineStore}. {@code update} accepts
     * all drift (re-record, report nothing). Otherwise detect drift; rewrite the baseline only on a
     * clean run so an unacknowledged drift keeps its old entry (and stays red).
     */
    public static List<Drifted> reconcileDrift(
            BaselineStore store, String oathPath, String source, Ast.Doc doc, Plan.ExecutionPlan plan, boolean update) {
        String text = store.read();
        LockFile lock = text != null ? parseLockFile(text) : null;
        OathBaseline baseline = lock != null ? lock.oaths().get(oathPath) : null;
        List<Drifted> drifts = update ? new ArrayList<>() : detectDrift(baseline, doc, plan);
        if (update || drifts.isEmpty()) {
            OathBaseline next = deriveOathBaseline(source, doc, plan);
            Map<String, OathBaseline> oaths = new LinkedHashMap<>();
            if (lock != null) oaths.putAll(lock.oaths());
            oaths.put(oathPath, next);
            store.write(stringifyLockFile(new LockFile(2, oaths)));
        }
        return drifts;
    }

    /**
     * Drops every baseline whose oath path is not in {@code keepPaths} — the entries left behind
     * when an oath is deleted or moved. Pure counterpart of {@link #parseLockFile} / {@link
     * #stringifyLockFile}; the caller decides what "still exists" means.
     */
    public static LockFile pruneLockFile(LockFile lock, Collection<String> keepPaths) {
        Set<String> keep = new LinkedHashSet<>(keepPaths);
        Map<String, OathBaseline> oaths = new LinkedHashMap<>();
        for (Map.Entry<String, OathBaseline> entry : lock.oaths().entrySet()) {
            if (keep.contains(entry.getKey())) oaths.put(entry.getKey(), entry.getValue());
        }
        return new LockFile(2, oaths);
    }

    /**
     * The whole-lock counterpart of {@link #reconcileDrift}, run ONCE per run rather than per oath:
     * reconciliation cannot see paths that no longer exist, so without this the lock silently
     * accumulates dead entries and stops being a faithful inventory of the oath set (issue #70).
     *
     * <p>{@code keepPaths} MUST be everything the {@code docs} globs currently match — never the set
     * the run happened to execute. Runs are routinely filtered (an IDE's single-example re-run), and
     * pruning against a filtered set would delete live baselines.
     *
     * <p>Removal is still not <em>gated</em>: a deleted oath is a different signal from drift and
     * stays ungated (ADR 0002). This only stops preserving dead state, and only under {@code update}.
     *
     * @return the paths removed, sorted (or, without {@code update}, the ones that would be)
     */
    public static List<String> pruneBaselines(BaselineStore store, Collection<String> keepPaths, boolean update) {
        String text = store.read();
        LockFile lock = text != null ? parseLockFile(text) : null;
        if (lock == null) return new ArrayList<>();
        Set<String> keep = new LinkedHashSet<>(keepPaths);
        List<String> stale = new ArrayList<>();
        for (String path : lock.oaths().keySet()) {
            if (!keep.contains(path)) stale.add(path);
        }
        Collections.sort(stale);
        if (update && !stale.isEmpty()) {
            store.write(stringifyLockFile(pruneLockFile(lock, keepPaths)));
        }
        return stale;
    }

    // ---- serialize (byte-identical to JSON.stringify(...,null,2)+"\n") ------

    /**
     * Serializes {@code varar.lock.json} deterministically: {@code version} then {@code oaths} (oath
     * paths sorted), examples in document order, two-space indent, trailing newline, non-ASCII
     * raw. The lock file keeps insertion order — it is committed and shared between ports.
     */
    public static String stringifyLockFile(LockFile lock) {
        List<String> paths = new ArrayList<>(lock.oaths().keySet());
        Collections.sort(paths);
        StringBuilder sb = new StringBuilder();
        sb.append("{\n  \"version\": 2,\n  \"oaths\": ");
        if (paths.isEmpty()) {
            sb.append("{}");
        } else {
            sb.append("{\n");
            for (int p = 0; p < paths.size(); p++) {
                String path = paths.get(p);
                OathBaseline b = lock.oaths().get(path);
                sb.append("    ");
                writeString(sb, path);
                sb.append(": {\n      \"sourceHash\": ");
                writeString(sb, b.sourceHash());
                sb.append(",\n      \"examples\": ");
                if (b.examples().isEmpty()) {
                    sb.append("[]");
                } else {
                    sb.append("[\n");
                    for (int e = 0; e < b.examples().size(); e++) {
                        BaselineExample ex = b.examples().get(e);
                        sb.append("        {\n          \"name\": ");
                        writeString(sb, ex.name());
                        sb.append(",\n          \"line\": ").append(ex.line()).append("\n        }");
                        if (e + 1 < b.examples().size()) sb.append(',');
                        sb.append('\n');
                    }
                    sb.append("      ]");
                }
                sb.append("\n    }");
                if (p + 1 < paths.size()) sb.append(',');
                sb.append('\n');
            }
            sb.append("  }");
        }
        sb.append("\n}\n");
        return sb.toString();
    }

    // Same escaping as JsonWriter: standard JSON escapes, control chars as \\uXXXX,
    // everything else (including non-ASCII) raw.
    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    // ---- parse (a minimal JSON reader; no library in the project) ----------

    /** Parses {@code varar.lock.json}; {@code null} on malformed input (treated as no baseline). */
    public static LockFile parseLockFile(String text) {
        Object parsed;
        try {
            parsed = JsonValue.parse(text);
        } catch (RuntimeException e) {
            return null;
        }
        if (!(parsed instanceof Map<?, ?> obj)) return null;
        if (!(obj.get("version") instanceof Number version) || version.intValue() != 2) return null;
        if (!(obj.get("oaths") instanceof Map<?, ?> oathsRaw)) return null;
        Map<String, OathBaseline> oaths = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : oathsRaw.entrySet()) {
            OathBaseline b = parseOathBaseline(entry.getValue());
            if (b == null) return null;
            oaths.put((String) entry.getKey(), b);
        }
        return new LockFile(2, oaths);
    }

    private static OathBaseline parseOathBaseline(Object value) {
        if (!(value instanceof Map<?, ?> map)) return null;
        if (!(map.get("sourceHash") instanceof String sourceHash)) return null;
        if (!(map.get("examples") instanceof List<?> examplesRaw)) return null;
        List<BaselineExample> examples = new ArrayList<>();
        for (Object item : examplesRaw) {
            if (!(item instanceof Map<?, ?> e)) return null;
            if (!(e.get("name") instanceof String name) || !(e.get("line") instanceof Number line)) {
                return null;
            }
            examples.add(new BaselineExample(name, line.intValue()));
        }
        return new OathBaseline(sourceHash, examples);
    }

    /** A tiny recursive-descent JSON reader — enough for varar.lock.json, throws on malformed. */
}
