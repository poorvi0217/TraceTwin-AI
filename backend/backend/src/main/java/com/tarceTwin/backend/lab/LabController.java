package com.tarceTwin.backend.lab;

import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/lab")
@CrossOrigin(origins = "http://localhost:5173")
public class LabController {

    public record HistoryItem(Long id, String createdAt, String changelog, int total, int solved) {}
    public record HistorySave(String changelog, int total, int solved, String payload) {}

    private final LabService service;
    private final LabAiService ai;
    private final LabRunRepository runs;
    private final ObjectMapper om = new ObjectMapper();

    public LabController(LabService service, LabAiService ai, LabRunRepository runs) {
        this.service = service;
        this.ai = ai;
        this.runs = runs;
    }

    @GetMapping("/defaults")
    public LabService.RunRequest defaults() { return service.defaults(); }

    @PostMapping("/run")
    public ResponseEntity<?> run(@RequestBody LabService.RunRequest req) {
        try {
            return ResponseEntity.ok(service.run(req));
        } catch (RuntimeException e) {
            return fail(e);
        }
    }

    @PostMapping("/verdicts")
    public ResponseEntity<?> verdicts(@RequestBody LabAiService.VerdictRequest req) {
        try {
            return ResponseEntity.ok(ai.verdicts(req));
        } catch (RuntimeException e) {
            return fail(e);
        }
    }

    @PostMapping("/suggest")
    public ResponseEntity<?> suggest(@RequestBody LabAiService.SuggestRequest req) {
        try {
            return ResponseEntity.ok(ai.suggest(req));
        } catch (RuntimeException e) {
            return fail(e);
        }
    }

    @GetMapping("/history")
    public List<HistoryItem> history() {
        return runs.findTop20ByOrderByCreatedAtDesc().stream()
                .map(r -> new HistoryItem(r.getId(), r.getCreatedAt().toString(), r.getChangelog(),
                        r.getTotal(), r.getSolved()))
                .toList();
    }

    @GetMapping("/history/{id}")
    public ResponseEntity<?> load(@PathVariable Long id) {
        return runs.findById(id)
                .<ResponseEntity<?>>map(r -> ResponseEntity.ok(Map.of("payload", r.getPayload())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/history")
    public ResponseEntity<?> save(@RequestBody HistorySave req) {
        try {
            if (req == null || req.payload() == null || req.payload().isBlank())
                throw new IllegalArgumentException("Nothing to save.");
            if (req.payload().length() > 200_000) throw new IllegalArgumentException("This run is too large to save.");
            try {
                om.readTree(req.payload());
            } catch (Exception e) {
                throw new IllegalArgumentException("The run data is not valid JSON.");
            }
            String changelog = req.changelog() == null ? "" : req.changelog();
            if (changelog.length() > 2000) changelog = changelog.substring(0, 2000);
            int total = Math.max(0, req.total());
            int solved = Math.min(Math.max(0, req.solved()), total);
            LabRun saved = runs.save(new LabRun(changelog, total, solved, req.payload()));
            return ResponseEntity.ok(new HistoryItem(saved.getId(), saved.getCreatedAt().toString(),
                    saved.getChangelog(), saved.getTotal(), saved.getSolved()));
        } catch (RuntimeException e) {
            return fail(e);
        }
    }

    private ResponseEntity<?> fail(RuntimeException e) {
        String message = String.valueOf(e.getMessage());
        if (e instanceof IllegalArgumentException) return ResponseEntity.badRequest().body(Map.of("message", message));
        return ResponseEntity.status(502).body(Map.of("message", message));
    }
}