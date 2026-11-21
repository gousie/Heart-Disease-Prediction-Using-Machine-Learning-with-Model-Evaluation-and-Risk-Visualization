package com.klu.service;

import com.klu.entity.Patient;
import com.klu.entity.Prediction;
import com.klu.repository.PredictionRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class PredictionService {

    private final PredictionRepository repository;
    private final PatientService patientService;

    public PredictionService(PredictionRepository repository,
                             PatientService patientService) {
        this.repository = repository;
        this.patientService = patientService;
    }

    public Prediction predict(Long patientId) {

        Patient p = patientService.getById(patientId);

        int score = 0;

        if (p.getAge() != null && p.getAge() >= 55)
            score += 20;

        if (p.getRestingBp() != null && p.getRestingBp() >= 140)
            score += 20;

        if (p.getCholesterol() != null && p.getCholesterol() >= 240)
            score += 20;

        if (p.getBloodSugar() != null && p.getBloodSugar() >= 126)
            score += 15;

        if (p.getHeartRate() != null && p.getHeartRate() > 100)
            score += 10;

        if ("Yes".equalsIgnoreCase(p.getSmoking()))
            score += 10;

        if ("Yes".equalsIgnoreCase(p.getAlcohol()))
            score += 5;

        String level;
        String result;

        if (score >= 60) {
            level = "HIGH";
            result = "Higher risk";
        } else if (score >= 30) {
            level = "MEDIUM";
            result = "Moderate risk";
        } else {
            level = "LOW";
            result = "Lower risk";
        }

        Prediction prediction = new Prediction();

        prediction.setPatientId(patientId);
        prediction.setRiskScore(score);
        prediction.setRiskLevel(level);
        prediction.setResult(result);
        prediction.setCreatedAt(LocalDateTime.now());

        return repository.save(prediction);
    }

    public List<Prediction> getAll() {
        return repository.findAll();
    }

    public List<Prediction> getByPatient(Long patientId) {
        return repository.findByPatientId(patientId);
    }
}