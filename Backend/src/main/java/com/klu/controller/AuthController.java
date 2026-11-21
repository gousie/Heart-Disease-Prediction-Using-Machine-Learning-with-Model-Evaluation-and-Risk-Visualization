
package com.klu.controller;

import com.klu.dto.LoginRequest;
import com.klu.entity.User;
import com.klu.service.UserService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "http://localhost:5173")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    // =========================
    // SIGN UP
    // =========================
    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody User user) {

        try {

            User savedUser = userService.register(user);

            Map<String, Object> response = new HashMap<>();

            response.put("success", true);
            response.put("message", "Signup successful");

            Map<String, Object> userData = new HashMap<>();
            userData.put("id", savedUser.getId());
            userData.put("name", savedUser.getName());
            userData.put("email", savedUser.getEmail());

            response.put("user", userData);

            return ResponseEntity.ok(response);

        } catch (RuntimeException e) {

            Map<String, Object> response = new HashMap<>();

            response.put("success", false);
            response.put("message", e.getMessage());

            return ResponseEntity.badRequest().body(response);
        }
    }

    // =========================
    // SIGN IN
    // =========================
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {

        try {

            User user = userService.login(
                    request.getEmail(),
                    request.getPassword()
            );

            Map<String, Object> response = new HashMap<>();

            response.put("success", true);
            response.put("message", "Signin successful");

            Map<String, Object> userData = new HashMap<>();
            userData.put("id", user.getId());
            userData.put("name", user.getName());
            userData.put("email", user.getEmail());

            response.put("user", userData);

            return ResponseEntity.ok(response);

        } catch (RuntimeException e) {

            Map<String, Object> response = new HashMap<>();

            response.put("success", false);
            response.put("message", e.getMessage());

            return ResponseEntity.badRequest().body(response);
        }
    }
}

