package com.tarceTwin.backend.sample;


import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Component
public class RulesStore {
    private final Path file = Path.of("sample-data/discount-rules.json");
    private final ObjectMapper om = new ObjectMapper();

    public Map<String, Double> load() throws IOException {
        return om.readValue(file.toFile(), new TypeReference<Map<String, Double>>() {});
    }

    public void save(Map<String, Double> rules) throws IOException {
        Files.copy(file, Path.of("sample-data/backup.json"), StandardCopyOption.REPLACE_EXISTING);
        om.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), rules);
    }

    public void reset() throws IOException {
        save(Map.of("gold", 0.02, "silver", 0.10, "basic", 0.05));
    }
}