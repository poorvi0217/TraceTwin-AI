package com.tarceTwin.backend.lab;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class LabService {
    public record LabCase(String id, String method, String path, String body) {}
    public record RunRequest(String reference, String candidate, List<LabCase> cases) {}
    public record LabResult(String id, String state, int referenceStatus, int candidateStatus,
                            String referenceBody, String candidateBody, String note) {}
    private record Resp(int status, String body, String error) {}

    private static final int MAX_CASES = 30;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper om = new ObjectMapper();

    public RunRequest defaults() {
        return new RunRequest("http://localhost:8080/api/v1", "http://localhost:8080/api/v2", List.of(
                new LabCase("c1", "GET", "/discount?price=100&tier=gold", ""),
                new LabCase("c2", "GET", "/discount?price=250&tier=gold", ""),
                new LabCase("c3", "GET", "/discount?price=100&tier=silver", ""),
                new LabCase("c4", "GET", "/discount?price=100&tier=basic", ""),
                new LabCase("c5", "GET", "/discount?price=100&tier=platinum", "")));
    }

    public List<LabResult> run(RunRequest req) {
        if (req == null || req.cases() == null || req.cases().isEmpty())
            throw new IllegalArgumentException("Add at least one test case.");
        if (req.cases().size() > MAX_CASES)
            throw new IllegalArgumentException("Maximum " + MAX_CASES + " test cases.");
        String ref = checkBase(req.reference(), "Reference address");
        String cand = checkBase(req.candidate(), "New version address");
        List<LabResult> out = new ArrayList<>();
        for (LabCase c : req.cases()) {
            checkCase(c);
            out.add(runOne(ref, cand, c));
        }
        return out;
    }

    private String checkBase(String raw, String label) {
        if (raw == null || raw.isBlank()) throw new IllegalArgumentException(label + " is required.");
        String s = raw.trim().replaceAll("/+$", "");
        URI u;
        try {
            u = URI.create(s);
        } catch (Exception e) {
            throw new IllegalArgumentException(label + " is not a valid address.");
        }
        if (u.getScheme() == null || u.getHost() == null
                || !(u.getScheme().equals("http") || u.getScheme().equals("https")))
            throw new IllegalArgumentException(label + " must start with http:// or https://");
        if (u.getHost().startsWith("169.254."))
            throw new IllegalArgumentException(label + " points to a blocked address.");
        return s;
    }

    private void checkCase(LabCase c) {
        if (c == null || c.id() == null) throw new IllegalArgumentException("Invalid test case.");
        String m = c.method() == null ? "" : c.method();
        if (!m.equals("GET") && !m.equals("POST")) throw new IllegalArgumentException("Method must be GET or POST.");
        String p = c.path();
        if (p == null || !p.startsWith("/") || p.length() > 300 || p.contains("://") || p.contains(" "))
            throw new IllegalArgumentException("Path must start with / and contain no spaces or full URLs: " + p);
        if (c.body() != null && c.body().length() > 5000) throw new IllegalArgumentException("Body is too long.");
        if (m.equals("POST") && c.body() != null && !c.body().isBlank()) {
            try {
                om.readTree(c.body());
            } catch (Exception e) {
                throw new IllegalArgumentException("Body is not valid JSON for test " + p);
            }
        }
    }

    private LabResult runOne(String ref, String cand, LabCase c) {
        Resp a = call(ref, c);
        Resp b = call(cand, c);
        if (a.error() != null || b.error() != null) {
            String note = a.error() != null
                    ? "Reference version unreachable: " + a.error()
                    : "New version unreachable: " + b.error();
            return new LabResult(c.id(), "ERROR", a.status(), b.status(), shorten(a.body()), shorten(b.body()), note);
        }
        boolean same = a.status() == b.status() && sameBody(a.body(), b.body());
        String note = same ? "" : a.status() != b.status()
                ? "Status differs (" + a.status() + " vs " + b.status() + ")"
                : "Response body differs";
        return new LabResult(c.id(), same ? "PASSING" : "DIFFERS", a.status(), b.status(),
                shorten(a.body()), shorten(b.body()), note);
    }

    private Resp call(String base, LabCase c) {
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + c.path()))
                    .timeout(Duration.ofSeconds(10));
            if ("POST".equals(c.method())) {
                b.header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(c.body() == null ? "" : c.body()));
            } else {
                b.GET();
            }
            HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            return new Resp(r.statusCode(), r.body() == null ? "" : r.body(), null);
        } catch (Exception e) {
            return new Resp(0, "", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private boolean sameBody(String x, String y) {
        try {
            JsonNode a = om.readTree(x);
            JsonNode b = om.readTree(y);
            return a.equals(b);
        } catch (Exception e) {
            return x.equals(y);
        }
    }

    private String shorten(String s) {
        return s.length() > 1000 ? s.substring(0, 1000) + "..." : s;
    }
}