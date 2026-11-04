package com.tarceTwin.backend.sample;


import java.io.IOException;
import java.util.Map;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "http://localhost:5173")
public class DiscountController {

    private final RulesStore rules;

    public DiscountController(RulesStore rules) { this.rules = rules; }

    @GetMapping("/v1/discount")
    public Map<String, Object> v1(@RequestParam double price, @RequestParam String tier) {
        double rate = switch (tier) {
            case "gold" -> 0.20;
            case "silver" -> 0.10;
            default -> 0.0;
        };
        return Map.of("tier", tier, "finalPrice", price * (1 - rate));
    }

    @GetMapping("/v2/discount")
    public Map<String, Object> v2(@RequestParam double price, @RequestParam String tier) throws IOException {
        double rate = rules.load().getOrDefault(tier, 0.0);
        return Map.of("tier", tier, "finalPrice", price * (1 - rate));
    }
}
