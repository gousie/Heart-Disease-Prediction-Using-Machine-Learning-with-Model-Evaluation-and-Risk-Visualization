package com.klu.controller;

import com.klu.entity.Patient;
import com.klu.service.PatientService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/patients")
@CrossOrigin(origins = "http://localhost:5173")
public class PatientController {

    private final PatientService service;

    public PatientController(PatientService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<Patient> create(
            @RequestBody Patient patient) {

        return ResponseEntity.ok(
                service.save(patient)
        );
    }

    @GetMapping
    public ResponseEntity<List<Patient>> getAll() {

        return ResponseEntity.ok(
                service.getAll()
        );
    }

    @GetMapping("/{id}")
    public ResponseEntity<Patient> getById(
            @PathVariable Long id) {

        return ResponseEntity.ok(
                service.getById(id)
        );
    }

    @PutMapping("/{id}")
    public ResponseEntity<Patient> update(
            @PathVariable Long id,
            @RequestBody Patient patient) {

        return ResponseEntity.ok(
                service.update(id, patient)
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @PathVariable Long id) {

        service.delete(id);

        return ResponseEntity.ok(
                "Patient deleted successfully"
        );
    }
}