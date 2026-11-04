package com.tarceTwin.backend.agent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(name = "llm.mode", havingValue = "fake", matchIfMissing = true)
public class FakeLlmClient implements LlmClient {

    private static final Pattern TIER = Pattern.compile("tier=([a-z0-9_-]+)");
    private final ObjectMapper om = new ObjectMapper();

    @Override
    public String complete(String system, String user) {
        if (system.contains("TASK:VERDICT")) return fakeVerdicts(user);
        if (system.contains("TASK:SUGGEST")) return fakeSuggestions();

        if (system.contains("analyst")) {
            return user.contains("\"gold\":0.02")
                    ? "{\"unintendedCount\":1,\"summary\":\"Gold discount dropped from 20% to 2%. This is not in the changelog, so it is a bug. The basic-tier 5% matches the changelog.\"}"
                    : "{\"unintendedCount\":0,\"summary\":\"Only the basic-tier change remains and it matches the changelog.\"}";
        }
        return "{\"newRules\":{\"gold\":0.20,\"silver\":0.10,\"basic\":0.05},\"reason\":\"Restore gold to 20%; 0.02 looks like a typo for 0.20.\"}";
    }

    @SuppressWarnings("unchecked")
    private String fakeVerdicts(String user) {
        Map<String, Object> root = om.readValue(user, Map.class);
        String changelog = String.valueOf(root.get("changelog")).toLowerCase();
        List<Map<String, Object>> diffs = (List<Map<String, Object>>) root.get("differences");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> d : diffs) {
            Matcher m = TIER.matcher(String.valueOf(d.get("path")).toLowerCase());
            String tier = m.find() ? m.group(1) : "";
            boolean unsure = tier.isEmpty();
            boolean intended = !unsure && changelog.contains(tier);

            Map<String, Object> v = new LinkedHashMap<>();
            v.put("id", d.get("id"));
            v.put("verdict", unsure ? "UNSURE" : intended ? "INTENDED" : "BUG");
            v.put("confidence", unsure ? "low" : intended ? "high" : "medium");
            v.put("reason", unsure
                    ? "The changelog does not say whether this request should change."
                    : intended
                    ? "The changelog mentions the " + tier + " tier, so this difference is expected."
                    : "The changelog never mentions the " + tier + " tier, yet its result changed.");
            v.put("suspectedCause", !unsure && !intended
                    ? "The new version applies a different rate for the " + tier + " tier than the reference version." : "");
            v.put("proposedFix", !unsure && !intended
                    ? "Restore the " + tier + " tier rate to the reference value." : "");
            v.put("question", unsure ? "Is this difference expected for this request?" : "");
            out.add(v);
        }
        return om.writeValueAsString(Map.of("verdicts", out));
    }

    private String fakeSuggestions() {
        List<Map<String, String>> list = List.of(
                s("/discount?price=0&tier=gold", "A zero price should stay zero."),
                s("/discount?price=1000000&tier=silver", "A very large price checks rounding."),
                s("/discount?price=100&tier=platinum", "An unknown tier should get no discount."),
                s("/discount?price=100", "A missing tier should fail the same way on both versions."),
                s("/discount?price=-50&tier=gold", "A negative price should be handled the same way."));
        return om.writeValueAsString(Map.of("suggestions", list));
    }

    private static Map<String, String> s(String path, String why) {
        return Map.of("method", "GET", "path", path, "body", "", "why", why);
    }
}