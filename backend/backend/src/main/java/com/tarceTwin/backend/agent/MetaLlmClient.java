package com.tarceTwin.backend.agent;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(name = "llm.mode", havingValue = "meta")
public class MetaLlmClient implements LlmClient {

    @Value("${meta.api.url:https://api.meta.ai/v1/chat/completions}")
    private String url;

    @Value("${meta.api.model:muse-wonder-1.0}")
    private String model;

    @Value("${META_API_KEY:}")
    private String apiKey;

    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper om = new ObjectMapper();

    @Override
    public String complete(String system, String user) {
        if (apiKey.isBlank()) {
            throw new IllegalStateException("META_API_KEY is not set");
        }
        Exception last = null;
        for (int attempt = 1; attempt <= 2; attempt++) {   // one retry
            try {
                Map<String, Object> body = Map.of(
                        "model", model,
                        "messages", List.of(
                                Map.of("role", "system", "content", system),
                                Map.of("role", "user", "content", user)));

                HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                        .header("Content-Type", "application/json")
                        .header("Authorization", "Bearer " + apiKey)
                        .timeout(Duration.ofSeconds(90))
                        .POST(HttpRequest.BodyPublishers.ofString(om.writeValueAsString(body)))
                        .build();

                HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() / 100 != 2) {
                    throw new IllegalStateException("Meta API " + res.statusCode() + ": " + res.body());
                }
                return om.readTree(res.body())
                        .path("choices").path(0).path("message").path("content").asText();
            } catch (Exception e) {
                last = e;
            }
        }
        throw new IllegalStateException("Meta API failed: " + last.getMessage(), last);
    }
}
