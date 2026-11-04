package com.tarceTwin.backend.replay;

import java.util.Map;

public record DiffResult(String request, Map<String, Object> v1,
                         Map<String, Object> v2, boolean changed) {}
