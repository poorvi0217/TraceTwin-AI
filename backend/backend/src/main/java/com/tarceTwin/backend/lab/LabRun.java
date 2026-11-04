package com.tarceTwin.backend.lab;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "lab_run")
public class LabRun {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Instant createdAt = Instant.now();

    @Column(length = 2000)
    private String changelog;

    private int total;
    private int solved;

    @Column(columnDefinition = "LONGTEXT")
    private String payload;

    protected LabRun() {}

    public LabRun(String changelog, int total, int solved, String payload) {
        this.changelog = changelog;
        this.total = total;
        this.solved = solved;
        this.payload = payload;
    }

    public Long getId() { return id; }
    public Instant getCreatedAt() { return createdAt; }
    public String getChangelog() { return changelog; }
    public int getTotal() { return total; }
    public int getSolved() { return solved; }
    public String getPayload() { return payload; }
}