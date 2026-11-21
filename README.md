# CardioPredict — Advanced Heart Disease Risk Prediction Using Machine Learning Model

Modern React + TypeScript + Vite frontend for heart-disease analytics.

## What's improved

- **Fixed PDF download**: multi-page report with risk, patient inputs, stats table (mean, SD, **t-statistic**, **p-value**), chart image, AI findings, and **conclusion**. Theme is restored after capture — no more stuck white screen without a file.
- **Real-time AI image analysis**: each uploaded report image is analyzed with client-side vision (brightness, contrast, entropy, edge density, color balance). Document type is classified (ECG / Lab / Imaging / Discharge / Photo). **Different images produce different findings** via a stable image fingerprint.
- **Hypothesis tests**: one-sample t-tests vs clinical reference means (BP 120, cholesterol 200, etc.) with approximate two-tailed p-values.
- **On-screen conclusion** panel summarizing risk, significant variables, form factors, and AI highlights.
- Theme: White · Blue · Red medical palette with full **dark mode**
- Realistic animated heart, multi-type charts (bar / line / area / bell)
- CSV upload + local persistence, offline risk heuristic fallback

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Backend endpoints expected

- POST /api/auth/register (or /signup)
- POST /api/auth/login
- POST /api/patients
- POST /api/predictions/{patientId}

Backend default: http://localhost:8080

## Notes

- CSV analysis and distribution fitting run in the browser.
- AI report scanning uses **real pixel-level vision features** on the uploaded image (not the same template for every file). For production OCR / multimodal models, wire POST /api/reports/analyze on the backend.
- Risk scores and AI scans are educational, not a clinical diagnosis.
