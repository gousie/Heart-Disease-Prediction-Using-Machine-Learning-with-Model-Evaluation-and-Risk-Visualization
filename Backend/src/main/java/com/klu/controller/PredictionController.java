package com.klu.controller;

import com.klu.entity.Prediction;
import com.klu.service.PredictionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/predictions")
@CrossOrigin(origins = "http://localhost:5173")
public class PredictionController {

    private final PredictionService service;

    public PredictionController(PredictionService service) {
        this.service = service;
    }

    @PostMapping("/{patientId}")
    public ResponseEntity<Prediction> predict(
            @PathVariable Long patientId) {

        return ResponseEntity.ok(
                service.predict(patientId)
        );
    }

    @GetMapping
    public ResponseEntity<List<Prediction>> getAll() {

        return ResponseEntity.ok(
                service.getAll()
        );
    }

    @GetMapping("/patient/{patientId}")
    public ResponseEntity<List<Prediction>> getByPatient(
            @PathVariable Long patientId) {

        return ResponseEntity.ok(
                service.getByPatient(patientId)
        );
    }
}