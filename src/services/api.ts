import axios from "axios";
import type { Patient, Prediction, User } from "../types";

export const API_URL = "http://localhost:8080";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json"
  }
});

// ==============================
// REGISTER / SIGNUP
// ==============================
export async function registerUser(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const res = await api.post("/api/auth/signup", payload);

  return {
    id: res.data.user.id,
    name: res.data.user.name,
    email: res.data.user.email
  };
}

// ==============================
// LOGIN / SIGNIN
// ==============================
export async function loginUser(payload: {
  email: string;
  password: string;
}): Promise<User> {
  const res = await api.post("/api/auth/login", payload);

  return {
    id: res.data.user.id,
    name: res.data.user.name,
    email: res.data.user.email
  };
}

// ==============================
// PATIENTS
// ==============================
export async function createPatient(
  payload: Patient
): Promise<Patient> {
  const res = await api.post("/api/patients", payload);
  return res.data;
}

export async function getPatients(): Promise<Patient[]> {
  const res = await api.get("/api/patients");
  return res.data;
}

// ==============================
// PREDICTIONS
// ==============================
export async function createPrediction(
  patientId: number
): Promise<Prediction> {
  const res = await api.post(
    `/api/predictions/${patientId}`
  );

  return res.data;
}

export async function getPredictions(
  patientId?: number
): Promise<Prediction[]> {

  const url = patientId
    ? `/api/predictions/patient/${patientId}`
    : "/api/predictions";

  const res = await api.get(url);

  return res.data;
}

export default api;