package com.tarceTwin.backend.replay;

import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "http://localhost:5173")
public class ReplayController {
    private final ReplayService service;

    public ReplayController(ReplayService service) { this.service = service; }

    @GetMapping("/replay")
    public List<DiffResult> replay() { return service.replay(); }
}