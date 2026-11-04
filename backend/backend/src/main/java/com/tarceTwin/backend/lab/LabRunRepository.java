package com.tarceTwin.backend.lab;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LabRunRepository extends JpaRepository<LabRun, Long> {
    List<LabRun> findTop20ByOrderByCreatedAtDesc();
}