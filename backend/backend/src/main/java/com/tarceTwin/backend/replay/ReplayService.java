package com.tarceTwin.backend.replay;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class ReplayService {
    private static final String BASE = "http://localhost:8080/api";
    private static final List<String> SAMPLES = List.of(
            "price=100&tier=gold", "price=250&tier=gold", "price=40&tier=gold",
            "price=100&tier=silver", "price=500&tier=silver",
            "price=100&tier=basic", "price=200&tier=basic");

    private final RestTemplate rest = new RestTemplate();

    public List<DiffResult> replay() {
        List<DiffResult> out = new ArrayList<>();
        for (String q : SAMPLES) {
            Map<String, Object> a = get("/v1/discount?" + q);
            Map<String, Object> b = get("/v2/discount?" + q);
            out.add(new DiffResult("GET /discount?" + q, a, b, !a.equals(b)));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> get(String path) {
        return rest.getForObject(BASE + path, Map.class);
    }
}