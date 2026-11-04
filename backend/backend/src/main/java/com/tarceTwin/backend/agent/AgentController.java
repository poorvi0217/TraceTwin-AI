package com.tarceTwin.backend.agent;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/agent")
@CrossOrigin(origins = "http://localhost:5173")
public class AgentController {
    private final AgentService agent;

    public AgentController(AgentService agent) { this.agent = agent; }

    @PostMapping("/run")
    public Map<String, String> run(@RequestBody Map<String, String> body) {
        agent.start(body.getOrDefault("changelog", ""));
        return Map.of("status", "started");
    }

    @GetMapping("/log")
    public Map<String, Object> log() { return agent.snapshot(); }

    @PostMapping("/reset")
    public Map<String, String> reset() throws Exception {
        agent.reset();
        return Map.of("status", "reset");
    }
}