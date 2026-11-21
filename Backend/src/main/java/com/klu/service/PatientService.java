package com.klu.service;

import com.klu.entity.Patient;
import com.klu.repository.PatientRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PatientService {

    private final PatientRepository repository;

    public PatientService(PatientRepository repository) {
        this.repository = repository;
    }

    public Patient save(Patient patient) {
        return repository.save(patient);
    }

    public List<Patient> getAll() {
        return repository.findAll();
    }

    public Patient getById(Long id) {

        return repository.findById(id)
                .orElseThrow(() ->
                        new RuntimeException("Patient not found"));
    }

    public Patient update(Long id, Patient p) {

        Patient old = getById(id);

        old.setName(p.getName());
        old.setAge(p.getAge());
        old.setGender(p.getGender());
        old.setHeight(p.getHeight());
        old.setWeight(p.getWeight());
        old.setRestingBp(p.getRestingBp());
        old.setCholesterol(p.getCholesterol());
        old.setHeartRate(p.getHeartRate());
        old.setBloodSugar(p.getBloodSugar());
        old.setSmoking(p.getSmoking());
        old.setAlcohol(p.getAlcohol());
        old.setChestPain(p.getChestPain());

        return repository.save(old);
    }

    public void delete(Long id) {
        repository.deleteById(id);
    }
}