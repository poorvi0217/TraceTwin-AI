package com.tarceTwin.backend.agent;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;

import com.tarceTwin.backend.replay.DiffResult;
import com.tarceTwin.backend.replay.ReplayService;
import com.tarceTwin.backend.sample.RulesStore;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class AgentService {
    public record Step(int round, String kind, String detail) {}

    private static final int MAX_ROUNDS = 5;

    private static final String TRIAGE = "You are a release-safety analyst. Compare v1 and v2 API responses. "
            + "Using the changelog, decide which differences are intended and which are unintended bugs. "
            + "Reply with JSON only: {\"unintendedCount\": number, \"summary\": \"one or two sentences\"}";

    private static final String FIX = "You are a fixer agent. v2 reads discount rates from a rules JSON object. "
            + "Propose a corrected full rules object that removes unintended differences but keeps changes described in the changelog. "
            + "Reply with JSON only: {\"newRules\": {\"tier\": rate}, \"reason\": \"one sentence\"}";

    private final ReplayService replay;
    private final RulesStore store;
    private final LlmClient llm;
    private final ObjectMapper om = new ObjectMapper();
    private final List<Step> steps = new CopyOnWriteArrayList<>();
    private volatile String status = "idle";

    public AgentService(ReplayService replay, RulesStore store, LlmClient llm) {
        this.replay = replay;
        this.store = store;
        this.llm = llm;
    }

    public Map<String, Object> snapshot() {
        return Map.of("status", status, "steps", steps);
    }

    public void reset() throws Exception {
        steps.clear();
        status = "idle";
        store.reset();
    }

    public void start(String changelog) {
        if ("running".equals(status)) return;
        steps.clear();
        status = "running";
        CompletableFuture.runAsync(() -> {
            try {
                run(changelog);
            } catch (Exception e) {
                add(0, "FAILED", String.valueOf(e.getMessage()));
                status = "failed";
            }
        });
    }

    private void run(String changelog) throws Exception {
        for (int round = 1; round <= MAX_ROUNDS; round++) {
            List<DiffResult> diffs = replay.replay();
            long changed = diffs.stream().filter(DiffResult::changed).count();
            add(round, "OBSERVE", changed + " of " + diffs.size() + " replayed requests changed");

            String context = "Changelog:\n" + changelog + "\nCurrent rules:\n"
                    + om.writeValueAsString(store.load()) + "\nDiffs:\n" + om.writeValueAsString(diffs);

            JsonNode triage = parse(llm.complete(TRIAGE, context));
            String summary = triage.path("summary").asText();
            add(round, "TRIAGE", summary);
            if (triage.path("unintendedCount").asInt() == 0) {
                add(round, "DONE", "All remaining changes match the changelog.");
                status = "success";
                return;
            }

            JsonNode fix = parse(llm.complete(FIX, context + "\nTriage:\n" + summary));
            Map<String, Double> newRules = om.convertValue(
                    fix.path("newRules"), new TypeReference<Map<String, Double>>() {});
            validate(newRules);
            store.save(newRules);
            add(round, "FIX", fix.path("reason").asText() + "  New rules: " + newRules);
        }
        add(MAX_ROUNDS, "FAILED",
                "Could not resolve all unintended changes within " + MAX_ROUNDS + " rounds. Backup kept.");
        status = "failed";
    }

    // Guardrail: the agent may only change existing tiers, with rates between 0 and 1.
    private void validate(Map<String, Double> rules) throws Exception {
        Set<String> allowed = store.load().keySet();
        for (var e : rules.entrySet()) {
            if (!allowed.contains(e.getKey()) || e.getValue() < 0 || e.getValue() > 1) {
                throw new IllegalStateException("Guardrail blocked patch: " + e);
            }
        }
    }

    private JsonNode parse(String raw) throws Exception {
        return om.readTree(raw.replaceAll("(?s)```json|```", "").trim());
    }

    private void add(int round, String kind, String detail) {
        steps.add(new Step(round, kind, detail));
    }
}
