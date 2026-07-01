package com.oselvar.var.core;

import io.cucumber.cucumberexpressions.CucumberExpressionParser;
import io.cucumber.cucumberexpressions.Node;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Serializes {@link Ast} nodes into the plain {@code Map}/{@code List} wire-format
 * structures that {@link CanonicalJson#canonicalStringify(Object)} turns into the
 * conformance corpus's deterministic JSON artifacts.
 *
 * <p>Port of the var-doc and registry portions of {@code var-core/src/conformance.ts}'s
 * {@code toVarDocArtifact}/{@code toRegistryArtifact} (and the equivalent
 * {@code to_var_doc_artifact}/{@code to_registry_artifact} in the Python port). Field
 * names are camelCase and must match {@code conformance/bundles/*}/golden/*.json}
 * exactly; key ordering doesn't matter here ({@link LinkedHashMap} is used purely for
 * readability while debugging) because {@link CanonicalJson} recursively sorts keys
 * itself.
 *
 * <p>Plan/trace projections are later tasks (Milestones 3-4) — this class currently
 * covers the var-doc and registry projections.
 */
public final class Conformance {

    private Conformance() {}

    /**
     * Projects a parsed {@link Ast.VarDoc} to the var-doc wire artifact: {@code
     * {path, examples, orphanAttachments}}.
     */
    public static Map<String, Object> toVarDocArtifact(Ast.VarDoc doc) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("path", doc.path());
        out.put("examples", doc.examples().stream().map(Conformance::example).toList());
        out.put(
                "orphanAttachments",
                doc.orphanAttachments().stream().map(Conformance::tableOrFence).toList());
        return out;
    }

    /**
     * Projects a {@link Registry} to the registry wire artifact: {@code {steps:
     * [{expression, parameterTypeNames}], parameterTypes: [{name, regexp}]}}.
     *
     * <p>Port of {@code toRegistryArtifact} in {@code conformance.ts} (and
     * {@code to_registry_artifact} in the Python port). No conformance bundle
     * currently exercises {@code defineParameterType} (every {@code golden/
     * registry.json}'s {@code parameterTypes} is {@code []} — see the plan's
     * deferred list), so unlike TS/Python this overload takes no explicit custom-
     * parameter-types argument; add one if/when a bundle needs it.
     */
    public static Map<String, Object> toRegistryArtifact(Registry registry) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("steps", registry.steps().stream().map(Conformance::step).toList());
        out.put("parameterTypes", List.of());
        return out;
    }

    private static Map<String, Object> step(Registry.StepRegistration s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("expression", s.expression());
        out.put("parameterTypeNames", parameterTypeNames(s.expression()));
        return out;
    }

    /**
     * Parameter-type names in source order, read from the expression's parsed AST
     * (authoritative). A naive {@code {...}} regex miscounts on escaped braces
     * ({@code \{}/{@code \}}), which are literal text, not parameters. Cucumber
     * rejects parameters inside optionals/alternation, so they only appear at the
     * top level, but this recurses defensively, mirroring {@code conformance.ts}'s
     * {@code parameterTypeNames}.
     *
     * <p>Java's {@code CucumberExpression} (unlike the TS/Python libraries) does not
     * expose its parsed AST or parameter-type list publicly — confirmed via {@code
     * javap -p}, no {@code getAst()}/{@code getParameterTypes()} escape the class.
     * This re-parses {@code source} with the library's own public {@link
     * CucumberExpressionParser#parse(String)}, which is exactly what {@code
     * CucumberExpression}'s constructor does internally to build its regex —
     * reproducing an identical {@link Node} tree, empirically confirmed by dumping
     * it for an expression exercising nested parameters and an escaped brace (each
     * {@code PARAMETER_NODE} has exactly one {@code TEXT_NODE} child holding the
     * name, and {@code \{escaped\}} parses as a single literal {@code TEXT_NODE},
     * never a parameter). {@link Node#text()} recurses the same way internally but
     * is package-private; {@link #nodeText} reimplements it against the class's
     * public surface ({@link Node#token()}/{@link Node#nodes()}) instead of
     * reflecting into the library.
     */
    static List<String> parameterTypeNames(String source) {
        Node ast = new CucumberExpressionParser().parse(source);
        List<String> names = new ArrayList<>();
        collectParameterNames(ast, names);
        return names;
    }

    private static void collectParameterNames(Node node, List<String> names) {
        if (node.type() == Node.Type.PARAMETER_NODE) {
            names.add(nodeText(node));
            return;
        }
        List<Node> children = node.nodes();
        if (children != null) {
            for (Node child : children) collectParameterNames(child, names);
        }
    }

    /** Reimplements {@code Node#text()} (package-private in the library) publicly. */
    private static String nodeText(Node node) {
        String token = node.token();
        if (token != null) return token;
        StringBuilder sb = new StringBuilder();
        List<Node> children = node.nodes();
        if (children != null) {
            for (Node child : children) sb.append(nodeText(child));
        }
        return sb.toString();
    }

    /** Dispatches on the sealed {@link Ast.TableOrFence} union (the orphan-attachment type). */
    private static Map<String, Object> tableOrFence(Ast.TableOrFence tableOrFence) {
        return switch (tableOrFence) {
            case Ast.Table t -> table(t);
            case Ast.Fence f -> fence(f);
        };
    }

    private static Map<String, Object> example(Ast.Example example) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scopeStack", List.copyOf(example.scopeStack()));
        out.put("span", span(example.span()));
        out.put("body", example.body().stream().map(Conformance::block).toList());
        return out;
    }

    /** Dispatches on the sealed {@link Ast.Block} union — exhaustive, no default branch. */
    private static Map<String, Object> block(Ast.Block block) {
        return switch (block) {
            case Ast.Heading h -> heading(h);
            case Ast.Paragraph p -> paragraph(p);
            case Ast.ListItem l -> listItem(l);
            case Ast.Blockquote b -> blockquote(b);
            case Ast.Table t -> table(t);
            case Ast.Fence f -> fence(f);
            case Ast.ThematicBreak t -> thematicBreak(t);
        };
    }

    private static Map<String, Object> heading(Ast.Heading h) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "heading");
        out.put("level", h.level());
        out.put("text", h.text());
        out.put("span", span(h.span()));
        return out;
    }

    private static Map<String, Object> paragraph(Ast.Paragraph p) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "paragraph");
        out.put("text", p.text());
        out.put("span", span(p.span()));
        out.put("inlineMap", inlineMap(p.inlineMap()));
        return out;
    }

    private static Map<String, Object> listItem(Ast.ListItem l) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "list_item");
        out.put("text", l.text());
        out.put("span", span(l.span()));
        out.put("inlineMap", inlineMap(l.inlineMap()));
        out.put("ordered", l.ordered());
        out.put("markerSpan", span(l.markerSpan()));
        return out;
    }

    private static Map<String, Object> blockquote(Ast.Blockquote b) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "blockquote");
        out.put("text", b.text());
        out.put("span", span(b.span()));
        out.put("inlineMap", inlineMap(b.inlineMap()));
        return out;
    }

    private static Map<String, Object> table(Ast.Table t) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "table");
        out.put("span", span(t.span()));
        out.put("header", row(t.header()));
        out.put("rows", t.rows().stream().map(Conformance::row).toList());
        return out;
    }

    private static Map<String, Object> row(Ast.Row r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cells", List.copyOf(r.cells()));
        out.put("cellSpans", r.cellSpans().stream().map(Conformance::span).toList());
        out.put("span", span(r.span()));
        return out;
    }

    private static Map<String, Object> fence(Ast.Fence f) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "fence");
        out.put("span", span(f.span()));
        out.put("info", f.info());
        out.put("body", f.body());
        out.put("bodySpan", span(f.bodySpan()));
        return out;
    }

    private static Map<String, Object> thematicBreak(Ast.ThematicBreak t) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "thematic_break");
        out.put("span", span(t.span()));
        return out;
    }

    private static List<Object> inlineMap(List<Ast.InlineOffset> inlineMap) {
        return inlineMap.stream().<Object>map(Conformance::inlineOffset).toList();
    }

    private static Map<String, Object> inlineOffset(Ast.InlineOffset o) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("textOffset", o.textOffset());
        out.put("sourceOffset", o.sourceOffset());
        return out;
    }

    private static Map<String, Object> span(Span s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("startOffset", s.startOffset());
        out.put("endOffset", s.endOffset());
        out.put("startLine", s.startLine());
        out.put("startCol", s.startCol());
        out.put("endLine", s.endLine());
        out.put("endCol", s.endCol());
        return out;
    }
}
