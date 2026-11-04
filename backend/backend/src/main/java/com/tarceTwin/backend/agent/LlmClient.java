package com.tarceTwin.backend.agent;

public interface LlmClient {
    String complete(String systemPrompt, String userPrompt);
}
