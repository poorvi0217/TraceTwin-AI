package com.tarceTwin.backend.lab;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.tarceTwin.backend.agent.LlmClient;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
public class LabAiService {

    public record Diff(String id, String method, String path, int referenceStatus, int candidateStatus,
                       String referenceBody, String candidateBody, String note) {}
    public record VerdictRequest(String changelog, List<Diff> differences) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Verdict(String id, String verdict, String confidence, String reason,
                          String suspectedCause, String proposedFix, String question) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record VerdictEnvelope(List<Verdict> verdicts) {}

    public record ExistingCase(String method, String path, String body) {}
    public record SuggestRequest(String changelog, List<ExistingCase> cases) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Suggestion(String method, String path, String body, String why) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SuggestEnvelope(List<Suggestion> suggestions) {}

    private static final String VERDICT_PROMPT = "TASK:VERDICT\n"
            + "You are a release-safety analyst. You receive a changelog and a list of test cases where a new "
            + "version of an HTTP API behaves differently from the reference version. For each difference decide: "
            + "INTENDED (the changelog explains it), BUG (the changelog does not explain it, or contradicts it), or "
            + "UNSURE (the changelog is too vague to decide). Look across all cases and name a shared cause when "
            + "several differences look related. Never invent facts that are not in the data. "
            + "Reply with JSON only, no prose, in exactly this shape: "
            + "{\"verdicts\":[{\"id\":\"\",\"verdict\":\"INTENDED|BUG|UNSURE\",\"confidence\":\"high|medium|low\","
            + "\"reason\":\"one sentence\",\"suspectedCause\":\"one sentence or empty\","
            + "\"proposedFix\":\"one sentence describing the change to make, or empty\","
            + "\"question\":\"one question for the user if UNSURE, otherwise empty\"}]}";

    private static final String SUGGEST_PROMPT = "TASK:SUGGEST\n"
            + "You help test an HTTP API by comparing an old and a new version. You receive a changelog and the "
            + "existing test cases. Propose up to 5 additional test cases that are not already covered: edge cases "
            + "(zero, negative, very large, missing or unknown values) and cases aimed at what the changelog says "
            + "changed. Only GET or POST. Every path starts with / and has no spaces and no full URLs. A POST body "
            + "must be valid JSON as a string, a GET body must be an empty string. "
            + "Reply with JSON only, no prose, in exactly this shape: "
            + "{\"suggestions\":[{\"method\":\"GET\",\"path\":\"/...\",\"body\":\"\",\"why\":\"one sentence\"}]}";

    private final LlmClient llm;
    private final ObjectMapper om = new ObjectMapper();

    public LabAiService(LlmClient llm) { this.llm = llm; }

    public List<Verdict> verdicts(VerdictRequest req) {
        if (req == null || req.differences() == null || req.differences().isEmpty())
            throw new IllegalArgumentException("There are no differences to judge.");
        if (req.differences().size() > 30) throw new IllegalArgumentException("Too many differences (maximum 30).");

        Set<String> ids = new HashSet<>();
        for (Diff d : req.differences()) ids.add(d.id());

        String payload = om.writeValueAsString(
                Map.of("changelog", clip(req.changelog(), 2000), "differences", req.differences()));
        VerdictEnvelope env = parse(llm.complete(VERDICT_PROMPT, payload), VerdictEnvelope.class);

        List<Verdict> out = new ArrayList<>();
        if (env.verdicts() != null) {
            for (Verdict v : env.verdicts()) {
                if (v == null || v.id() == null || !ids.contains(v.id())) continue;
                out.add(new Verdict(v.id(), normVerdict(v.verdict()), nz(v.confidence()), nz(v.reason()),
                        nz(v.suspectedCause()), nz(v.proposedFix()), nz(v.question())));
            }
        }
        return out;
    }

    public List<Suggestion> suggest(SuggestRequest req) {
        if (req == null) throw new IllegalArgumentException("Missing request.");
        List<ExistingCase> existing = req.cases() == null ? List.of() : req.cases();
        if (existing.size() > 30) existing = existing.subList(0, 30);

        Set<String> seen = new HashSet<>();
        for (ExistingCase c : existing) seen.add(nz(c.method()).toUpperCase() + " " + nz(c.path()));

        String payload = om.writeValueAsString(
                Map.of("changelog", clip(req.changelog(), 2000), "existingCases", existing));
        SuggestEnvelope env = parse(llm.complete(SUGGEST_PROMPT, payload), SuggestEnvelope.class);

        List<Suggestion> out = new ArrayList<>();
        if (env.suggestions() == null) return out;
        for (Suggestion s : env.suggestions()) {
            if (s == null) continue;
            String m = nz(s.method()).trim().toUpperCase();
            String p = nz(s.path()).trim();
            String b = nz(s.body());
            if (!m.equals("GET") && !m.equals("POST")) continue;
            if (!p.startsWith("/") || p.length() > 300 || p.contains("://") || p.contains(" ")) continue;
            if (b.length() > 5000) continue;
            if (m.equals("POST") && !b.isBlank()) {
                try {
                    om.readTree(b);
                } catch (Exception e) {
                    continue;
                }
            }
            if (!seen.add(m + " " + p)) continue;
            out.add(new Suggestion(m, p, m.equals("POST") ? b : "", nz(s.why())));
            if (out.size() == 5) break;
        }
        return out;
    }

    private <T> T parse(String raw, Class<T> type) {
        try {
            String clean = raw.replaceAll("(?s)```json|```", "").trim();
            int start = clean.indexOf('{');
            int end = clean.lastIndexOf('}');
            if (start >= 0 && end > start) clean = clean.substring(start, end + 1);
            return om.readValue(clean, type);
        } catch (Exception e) {
            throw new IllegalArgumentException("The AI answer was not valid JSON. Please try again.");
        }
    }

    private String normVerdict(String v) {
        String u = nz(v).trim().toUpperCase();
        return u.equals("INTENDED") || u.equals("BUG") ? u : "UNSURE";
    }

    private String nz(String s) { return s == null ? "" : s; }

    private String clip(String s, int max) {
        String x = nz(s);
        return x.length() > max ? x.substring(0, max) : x;
    }
}