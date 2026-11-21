import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  FileImage,
  FileSpreadsheet,
  HeartPulse,
  Info,
  LineChart,
  Moon,
  Scan,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  X,
  TrendingUp,
  TrendingDown,
  Cpu,
  Sigma,
  Target,
  FlaskConical,
  Eraser
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart as ReLineChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Navbar from "../components/Navbar";
import HeartVisual from "../components/HeartVisual";
import type {
  CategoricalResult,
  ChartType,
  DatasetState,
  DistributionResult,
  Prediction,
  ReportAnalysis,
  ThemeMode,
  User
} from "../types";
import {
  analyzeBiasVariance,
  analyzeCategorical,
  buildConclusion,
  buildRegressions,
  chooseDistribution,
  cleanDataset,
  detectColumnTypes,
  engineerFeatures,
  histogram,
  histogramWithBell,
  normalDensityCurve,
  sortedSeries
} from "../utils/analytics";
import type { BiasVarianceResult, CleanReport } from "../utils/analytics";
import type { RegressionResult } from "../types";
import { analyzeImageFile, buildInsightsFromImage } from "../utils/imageAnalysis";
import { createPatient, createPrediction } from "../services/api";

const DATASET_KEY = "cardio_saved_dataset";

export default function Dashboard({
  user,
  onLogout,
  theme,
  onToggleTheme
}: {
  user: User;
  onLogout: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [dataset, setDataset] = useState<DatasetState | null>(() => {
    try {
      const raw = localStorage.getItem(DATASET_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DatasetState;
      // Backfill categoricalColumns for datasets saved before this field existed
      if (!parsed.categoricalColumns && parsed.rows?.length && parsed.columns?.length) {
        const { numericColumns, categoricalColumns } = detectColumnTypes(
          parsed.rows,
          parsed.columns
        );
        parsed.numericColumns = numericColumns;
        parsed.categoricalColumns = categoricalColumns;
      } else if (!parsed.categoricalColumns) {
        parsed.categoricalColumns = [];
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [distribution, setDistribution] = useState<DistributionResult[]>(() => {
    if (!dataset) return [];
    return chooseDistribution(dataset.rows, dataset.numericColumns);
  });
  const [categorical, setCategorical] = useState<CategoricalResult[]>(() => {
    if (!dataset?.categoricalColumns?.length) return [];
    return analyzeCategorical(dataset.rows, dataset.categoricalColumns);
  });
  const [regressions, setRegressions] = useState<RegressionResult[]>(() => {
    if (!dataset) return [];
    const n = dataset.numericColumns?.length || 0;
    const c = dataset.categoricalColumns?.length || 0;
    if (n + c < 2) return [];
    return buildRegressions(
      dataset.rows,
      dataset.numericColumns || [],
      dataset.categoricalColumns || []
    );
  });
  const [selectedRegIdx, setSelectedRegIdx] = useState(0);
  const [selectedColumn, setSelectedColumn] = useState(
    () => dataset?.numericColumns[0] || dataset?.categoricalColumns?.[0] || ""
  );
  const [chartType, setChartType] = useState<ChartType>("bell");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reportAnalyses, setReportAnalyses] = useState<ReportAnalysis[]>([]);
  const reportInputRef = useRef<HTMLInputElement>(null);
  const chartCaptureRef = useRef<HTMLDivElement>(null);
  const bellCaptureRef = useRef<HTMLDivElement>(null);
  const barCaptureRef = useRef<HTMLDivElement>(null);
  const lineCaptureRef = useRef<HTMLDivElement>(null);
  const areaCaptureRef = useRef<HTMLDivElement>(null);
  const simpleRegCaptureRef = useRef<HTMLDivElement>(null);
  const multiRegCaptureRef = useRef<HTMLDivElement>(null);
  const multiColCaptureRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [cleanReport, setCleanReport] = useState<CleanReport | null>(null);
  const [cleanName, setCleanName] = useState("cleaned_dataset.csv");
  const [catChartCol, setCatChartCol] = useState("");

  const [form, setForm] = useState({
    age: 50,
    gender: "Male",
    height: 170,
    weight: 70,
    restingBp: 120,
    cholesterol: 200,
    heartRate: 75,
    bloodSugar: 90,
    smoking: "No",
    alcohol: "No",
    chestPain: "No"
  });

  const selectedDist = useMemo(
    () => distribution.find((d) => d.column === selectedColumn),
    [distribution, selectedColumn]
  );

  const chartData = useMemo(() => {
    if (!dataset || !selectedColumn) return [];
    if (chartType === "bell") return histogramWithBell(dataset.rows, selectedColumn, 14);
    if (chartType === "area") return normalDensityCurve(dataset.rows, selectedColumn, 48);
    if (chartType === "line") return sortedSeries(dataset.rows, selectedColumn, 50);
    return histogram(dataset.rows, selectedColumn, 12);
  }, [dataset, selectedColumn, chartType]);

  // Precompute chart variants for selected column (dashboard + PDF)
  const allCharts = useMemo(() => {
    if (!dataset || !selectedColumn) return null;
    return {
      bell: histogramWithBell(dataset.rows, selectedColumn, 14),
      bar: histogram(dataset.rows, selectedColumn, 12),
      line: sortedSeries(dataset.rows, selectedColumn, 50),
      area: normalDensityCurve(dataset.rows, selectedColumn, 48)
    };
  }, [dataset, selectedColumn]);

  // Charts for EVERY numeric column (for PDF multi-column export)
  const allColumnCharts = useMemo(() => {
    if (!dataset) return [];
    return dataset.numericColumns.slice(0, 8).map((col) => ({
      column: col,
      dist: distribution.find((d) => d.column === col),
      bell: histogramWithBell(dataset.rows, col, 12),
      bar: histogram(dataset.rows, col, 10),
      line: sortedSeries(dataset.rows, col, 40),
      area: normalDensityCurve(dataset.rows, col, 36)
    }));
  }, [dataset, distribution]);

  const selectedRegression = regressions[selectedRegIdx] || null;
  const biasVariance: BiasVarianceResult | null = useMemo(() => {
    if (!dataset?.rows?.length) return null;
    return analyzeBiasVariance(dataset.rows, dataset.columns);
  }, [dataset]);
  const activeCat = categorical.find((c) => c.column === catChartCol) || categorical[0] || null;

  // ── Correlation matrix (Pearson) for top-N numeric columns ───────────────
  const correlationMatrix = useMemo(() => {
    if (!dataset || dataset.numericColumns.length < 2) return null;
    const cols = dataset.numericColumns.slice(0, 8);
    const rows = dataset.rows;
    function pearson(a: string, b: string): number {
      const pairs = rows
        .map((r) => [Number(r[a]), Number(r[b])])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      if (pairs.length < 3) return 0;
      const n = pairs.length;
      const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
      const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
      const num = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
      const dx = Math.sqrt(pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0));
      const dy = Math.sqrt(pairs.reduce((s, [, y]) => s + (y - my) ** 2, 0));
      if (!dx || !dy) return 0;
      return Math.round((num / (dx * dy)) * 1000) / 1000;
    }
    return {
      cols,
      matrix: cols.map((a) => cols.map((b) => pearson(a, b)))
    };
  }, [dataset]);

  // ── Data quality metrics ─────────────────────────────────────────────────
  const dataQuality = useMemo(() => {
    if (!dataset) return null;
    const total = dataset.rows.length * dataset.columns.length;
    let missing = 0;
    for (const row of dataset.rows) {
      for (const col of dataset.columns) {
        const v = row[col];
        if (v === null || v === undefined || v === "") missing++;
      }
    }
    const completeness = Math.round(((total - missing) / total) * 1000) / 10;
    const numericRatio = Math.round((dataset.numericColumns.length / dataset.columns.length) * 1000) / 10;
    return { completeness, missing, numericRatio, total };
  }, [dataset]);

  // ── BMI & derived risk from form ─────────────────────────────────────────
  const bmi = useMemo(() => {
    const h = form.height / 100;
    const b = h > 0 ? form.weight / (h * h) : 0;
    return Math.round(b * 10) / 10;
  }, [form.height, form.weight]);

  const bmiCategory = useMemo(() => {
    if (bmi < 18.5) return { label: "Underweight", color: "#3498db" };
    if (bmi < 25) return { label: "Normal", color: "#27ae60" };
    if (bmi < 30) return { label: "Overweight", color: "#f1c40f" };
    return { label: "Obese", color: "#e74c3c" };
  }, [bmi]);

  // ── Risk gauge data ──────────────────────────────────────────────────────
  const riskGaugeData = useMemo(() => {
    if (!prediction) return [];
    return [
      { name: "Risk", value: prediction.riskScore, fill: prediction.riskLevel === "HIGH" ? "#e74c3c" : prediction.riskLevel === "MEDIUM" ? "#e67e22" : "#27ae60" },
      { name: "Safe", value: 100 - prediction.riskScore, fill: "var(--border)" }
    ];
  }, [prediction]);

  // ── Scatter data for correlation explorer ────────────────────────────────
  const [scatterX, setScatterX] = useState(() => dataset?.numericColumns[0] || "");
  const [scatterY, setScatterY] = useState(() => dataset?.numericColumns[1] || "");
  const scatterData = useMemo(() => {
    if (!dataset || !scatterX || !scatterY) return [];
    return dataset.rows
      .map((r) => ({ x: Number(r[scatterX]), y: Number(r[scatterY]) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, 300); // cap for perf
  }, [dataset, scatterX, scatterY]);

  const conclusion = useMemo(
    () =>
      buildConclusion({
        prediction,
        distributions: distribution,
        form,
        aiFindings: reportAnalyses
          .filter((r) => r.status === "done")
          .flatMap((r) => r.findings)
          .slice(0, 4)
      }),
    [prediction, distribution, form, reportAnalyses]
  );

  function persistDataset(ds: DatasetState) {
    const payload = { ...ds, savedAt: new Date().toISOString(), savedLocally: true };
    try {
      // Store a compact version to avoid quota issues (keep up to ~800 rows)
      const compact = {
        ...payload,
        rows: payload.rows.slice(0, 800)
      };
      localStorage.setItem(DATASET_KEY, JSON.stringify(compact));
      setDataset(payload);
      setMessage(
        `Dataset “${ds.name}” saved locally (${ds.rowCount.toLocaleString()} rows). Backend persistence can be added via POST /api/datasets when available.`
      );
    } catch {
      setDataset(payload);
      setMessage("Dataset loaded. Local storage is full — data kept in session only.");
    }
  }

  function handleFile(file?: File) {
    if (!file) return;
    setMessage("");
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        const rows = results.data.filter((r) =>
          Object.values(r).some((v) => String(v ?? "").trim() !== "")
        );
        const columns = results.meta.fields || Object.keys(rows[0] || {});
        const { numericColumns, categoricalColumns } = detectColumnTypes(rows, columns);
        const ds: DatasetState = {
          name: file.name,
          rows,
          columns,
          numericColumns,
          categoricalColumns,
          rowCount: rows.length
        };
        setSelectedColumn(numericColumns[0] || categoricalColumns[0] || "");
        setDistribution(chooseDistribution(rows, numericColumns));
        setCategorical(analyzeCategorical(rows, categoricalColumns));
        setRegressions(buildRegressions(rows, numericColumns, categoricalColumns));
        setSelectedRegIdx(0);
        persistDataset(ds);
        setMessage(
          `Loaded “${file.name}” — ${rows.length.toLocaleString()} rows · ${numericColumns.length} numeric · ${categoricalColumns.length} categorical. Stats, regression & prediction use both.`
        );
      },
      error: () => setMessage("Could not read this CSV file.")
    });
  }

  function handleCleanFile(file?: File) {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data as Record<string, unknown>[]).filter((r) => r && Object.keys(r).length);
        const columns = res.meta.fields?.filter(Boolean) as string[] || (rows[0] ? Object.keys(rows[0]) : []);
        const report = cleanDataset(rows, columns);
        setCleanReport(report);
        setCleanName(file.name.replace(/\.csv$/i, "") + "_cleaned.csv");
        setMessage(`Cleaned “${file.name}”: ${report.originalRows} → ${report.cleanedRows} rows. Download the cleaned CSV below.`);
      },
      error: () => setMessage("Could not read that file. Upload a CSV with a header row.")
    });
  }

  function downloadCleaned() {
    if (!cleanReport) return;
    const csv = Papa.unparse({ fields: cleanReport.columns, data: cleanReport.rows });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cleanName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadFeatureEngineered() {
    if (!dataset) {
      setMessage("Upload an analysis dataset first to export engineered features.");
      return;
    }
    const { rows: engRows, newColumns } = engineerFeatures(
      dataset.rows,
      dataset.categoricalColumns || []
    );
    const fields = [...dataset.columns, ...newColumns.filter((c) => !dataset.columns.includes(c))];
    const csv = Papa.unparse({ fields, data: engRows });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (dataset.name || "dataset").replace(/\.csv$/i, "") + "_feature_engineered.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMessage(
      `Feature-engineered CSV ready (${newColumns.length} new columns: ${newColumns.slice(0, 6).join(", ")}${newColumns.length > 6 ? "…" : ""}).`
    );
  }

  function clearDataset() {
    setDataset(null);
    setDistribution([]);
    setCategorical([]);
    setRegressions([]);
    setSelectedColumn("");
    setSelectedRegIdx(0);
    localStorage.removeItem(DATASET_KEY);
    setMessage("Dataset cleared.");
  }

  async function runPrediction() {
    setBusy(true);
    setMessage("");
    try {
      const patient = await createPatient({
        name: user.name,
        ...form
      });
      const result = await createPrediction(patient.id!);
      setPrediction(result);
      setMessage("Risk analysis completed.");
    } catch (e: any) {
      // Graceful offline / demo fallback so the UI remains useful
      const score = computeLocalRisk(form);
      const level = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
      const result: Prediction = {
        patientId: 0,
        riskScore: score,
        riskLevel: level,
        result:
          level === "HIGH"
            ? "Elevated cardiovascular risk indicators detected. Lifestyle review and clinical follow-up are recommended."
            : level === "MEDIUM"
              ? "Moderate risk profile. Monitor blood pressure, cholesterol and activity levels."
              : "Lower estimated risk based on the provided indicators. Maintain healthy habits.",
        createdAt: new Date().toISOString()
      };
      setPrediction(result);
      setMessage(
        e?.response?.data?.message ||
          "Backend unreachable — local heuristic risk estimate shown (not a medical diagnosis)."
      );
    } finally {
      setBusy(false);
    }
  }

  function computeLocalRisk(f: typeof form): number {
    let s = 20;
    if (f.age >= 55) s += 18;
    else if (f.age >= 45) s += 10;
    if (f.restingBp >= 140) s += 16;
    else if (f.restingBp >= 130) s += 8;
    if (f.cholesterol >= 240) s += 14;
    else if (f.cholesterol >= 200) s += 7;
    if (f.bloodSugar >= 126) s += 10;
    if (f.heartRate > 100 || f.heartRate < 50) s += 6;
    if (f.smoking === "Yes") s += 12;
    if (f.alcohol === "Yes") s += 5;
    if (f.chestPain === "Yes") s += 15;
    const bmi = f.weight / ((f.height / 100) ** 2);
    if (bmi >= 30) s += 10;
    else if (bmi >= 25) s += 5;
    return Math.min(98, Math.max(5, Math.round(s)));
  }

  async function handleReportImage(file?: File) {
    if (!file || !file.type.startsWith("image/")) {
      setMessage("Please upload an image file (PNG, JPG, WEBP).");
      return;
    }
    const id = `rep_${Date.now()}`;
    const previewUrl = URL.createObjectURL(file);
    const pending: ReportAnalysis = {
      id,
      fileName: file.name,
      previewUrl,
      status: "analyzing",
      findings: [],
      suggestedCondition: "",
      confidence: 0,
      recommendations: [],
      analyzedAt: new Date().toISOString()
    };
    setReportAnalyses((prev) => [pending, ...prev]);
    setMessage(`AI vision analysis started for "${file.name}"…`);

    try {
      const features = await analyzeImageFile(file);
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
      const insights = buildInsightsFromImage(features, file.name, form);

      setReportAnalyses((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "done",
                ...insights,
                imageFeatures: features,
                analyzedAt: new Date().toISOString()
              }
            : r
        )
      );
      setMessage(
        `AI analysis complete for "${file.name}" — classified as ${features.docType} (unique fingerprint).`
      );
    } catch (err) {
      console.error(err);
      setReportAnalyses((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "error",
                findings: ["Image analysis failed. Try a clearer PNG/JPG of the report."],
                suggestedCondition: "Analysis error",
                confidence: 0,
                recommendations: ["Re-upload a clearer image."]
              }
            : r
        )
      );
      setMessage("AI analysis failed for this image.");
    }

    if (reportInputRef.current) reportInputRef.current.value = "";
  }

  async function downloadReport() {
    if (downloading) return;
    setDownloading(true);
    setMessage("Generating PDF report…");

    const prevTheme = document.documentElement.getAttribute("data-theme");
    try {
      // Prefer green theme for UI; capture charts with white canvas background for print
      document.documentElement.setAttribute("data-theme", "green");
      await new Promise((r) => setTimeout(r, 150));

      const captureOpts = {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        allowTaint: true
      } as const;

      async function captureEl(el: HTMLElement | null): Promise<string | null> {
        if (!el) return null;
        try {
          const canvas = await html2canvas(el, captureOpts);
          return canvas.toDataURL("image/png");
        } catch (e) {
          console.warn("Chart capture failed", e);
          return null;
        }
      }

      // Capture chart types for selected column + regressions + multi-column grid
      const chartImgs: { label: string; img: string }[] = [];
      if (dataset && selectedColumn) {
        const pairs: [string, React.RefObject<HTMLDivElement | null>][] = [
          ["Bell / Gaussian curve", bellCaptureRef],
          ["Histogram (Bar)", barCaptureRef],
          ["Sorted series (Line)", lineCaptureRef],
          ["Density curve (Area)", areaCaptureRef]
        ];
        for (const [label, ref] of pairs) {
          const img = await captureEl(ref.current);
          if (img) chartImgs.push({ label: `${label} — ${selectedColumn}`, img });
        }
        if (!chartImgs.length) {
          const img = await captureEl(chartCaptureRef.current);
          if (img) chartImgs.push({ label: `Chart (${chartType}) — ${selectedColumn}`, img });
        }
      }
      const simpleRegImg = await captureEl(simpleRegCaptureRef.current);
      const multiRegImg = await captureEl(multiRegCaptureRef.current);
      const multiColImg = await captureEl(multiColCaptureRef.current);

      if (prevTheme) document.documentElement.setAttribute("data-theme", prevTheme);
      else document.documentElement.removeAttribute("data-theme");

      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const contentW = pageW - margin * 2;
      let y = 0;

      const ensureSpace = (needed: number) => {
        if (y + needed > pageH - 14) {
          pdf.addPage();
          y = 16;
        }
      };

      const addWrapped = (
        text: string,
        fontSize = 9,
        color: [number, number, number] = [30, 40, 60]
      ) => {
        pdf.setFontSize(fontSize);
        pdf.setTextColor(color[0], color[1], color[2]);
        const lines = pdf.splitTextToSize(text, contentW);
        ensureSpace(lines.length * (fontSize * 0.45) + 2);
        pdf.text(lines, margin, y);
        y += lines.length * (fontSize * 0.45) + 3;
      };

      pdf.setFillColor(230, 57, 70);
      pdf.rect(0, 0, pageW, 32, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("CardioPredict — Heart Risk Report", margin, 14);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(
        `Generated ${new Date().toLocaleString()}  ·  Patient: ${user.name}  ·  ${user.email}`,
        margin,
        24
      );
      y = 42;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(20, 40, 70);
      pdf.text("1. Risk Assessment", margin, y);
      y += 8;

      if (prediction) {
        const riskColor: [number, number, number] =
          prediction.riskLevel === "HIGH"
            ? [200, 30, 40]
            : prediction.riskLevel === "MEDIUM"
              ? [180, 120, 0]
              : [20, 140, 80];
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
        pdf.text(
          `Risk level: ${prediction.riskLevel}   Score: ${prediction.riskScore}/100`,
          margin,
          y
        );
        y += 7;
        pdf.setFont("helvetica", "normal");
        addWrapped(prediction.result, 9, [40, 50, 70]);
      } else {
        addWrapped(
          "No prediction run yet. Complete the health form and click Predict to include a risk score.",
          9,
          [100, 100, 110]
        );
      }

      ensureSpace(40);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(20, 40, 70);
      pdf.text("2. Patient Inputs", margin, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(40, 50, 70);
      const inputs = [
        `Age: ${form.age}`,
        `Gender: ${form.gender}`,
        `Height: ${form.height} cm`,
        `Weight: ${form.weight} kg`,
        `Resting BP: ${form.restingBp}`,
        `Cholesterol: ${form.cholesterol}`,
        `Heart rate: ${form.heartRate}`,
        `Blood sugar: ${form.bloodSugar}`,
        `Smoking: ${form.smoking}`,
        `Alcohol: ${form.alcohol}`,
        `Chest pain: ${form.chestPain}`
      ];
      const colW = contentW / 3;
      inputs.forEach((t, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        pdf.text(t, margin + col * colW, y + row * 5.5);
      });
      y += Math.ceil(inputs.length / 3) * 5.5 + 8;

      ensureSpace(20);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(20, 40, 70);
      pdf.text("3. Statistical Analysis (mean, SD, t, p-value)", margin, y);
      y += 8;

      if (distribution.length) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(80, 90, 110);
        const headers = ["Column", "Dist", "Mean", "SD", "t", "p-value", "Sig"];
        const colXs = [
          margin,
          margin + 32,
          margin + 52,
          margin + 72,
          margin + 92,
          margin + 112,
          margin + 140
        ];
        headers.forEach((h, i) => pdf.text(h, colXs[i], y));
        y += 5;
        pdf.setDrawColor(200, 210, 220);
        pdf.line(margin, y, pageW - margin, y);
        y += 4;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(30, 40, 60);

        for (const d of distribution.slice(0, 14)) {
          ensureSpace(7);
          const pStr = d.pValue < 0.001 ? "<0.001" : d.pValue.toFixed(4);
          const sig = d.pValue < 0.05 ? "Yes*" : "No";
          const row = [
            d.column.slice(0, 14),
            d.distribution.slice(0, 10),
            String(d.mean),
            String(d.sd),
            String(d.tStatistic),
            pStr,
            sig
          ];
          row.forEach((cell, i) => pdf.text(cell, colXs[i], y));
          y += 5;
        }
        y += 3;
        pdf.setFontSize(8);
        addWrapped(
          "* Significant at α=0.05 (two-tailed one-sample t-test vs clinical reference mean). Exploratory only.",
          8,
          [100, 110, 120]
        );

        if (selectedDist) {
          ensureSpace(28);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          pdf.setTextColor(20, 40, 70);
          pdf.text(`Selected variable: ${selectedDist.column}`, margin, y);
          y += 6;
          pdf.setFont("helvetica", "normal");
          addWrapped(
            `${selectedDist.distribution} fit · n=${selectedDist.count} · mean ${selectedDist.mean} · median ${selectedDist.median} · SD ${selectedDist.sd} · skew ${selectedDist.skewness} · kurtosis ${selectedDist.kurtosis} · range [${selectedDist.min}, ${selectedDist.max}]. t=${selectedDist.tStatistic}, p=${selectedDist.pValue < 0.001 ? "<0.001" : selectedDist.pValue.toFixed(4)}.`,
            9
          );
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(20, 100, 60);
          ensureSpace(6);
          pdf.text("Why this distribution is suited:", margin, y);
          y += 5;
          pdf.setFont("helvetica", "normal");
          addWrapped(selectedDist.reason, 8, [30, 60, 40]);

          if (selectedDist.altReasons?.length) {
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(9);
            pdf.setTextColor(140, 60, 40);
            ensureSpace(6);
            pdf.text("Why other distributions are not suited:", margin, y);
            y += 5;
            pdf.setFont("helvetica", "normal");
            for (const ar of selectedDist.altReasons) {
              addWrapped(`• ${ar}`, 8, [80, 50, 40]);
            }
          }
        }

        // Brief why/why-not for top columns
        ensureSpace(16);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(20, 40, 70);
        pdf.text("Distribution suitability (top variables)", margin, y);
        y += 6;
        for (const d of distribution.slice(0, 6)) {
          ensureSpace(18);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(30, 50, 40);
          pdf.text(`${d.column} → ${d.distribution}`, margin, y);
          y += 4;
          pdf.setFont("helvetica", "normal");
          addWrapped(`Suited because: ${d.reason}`, 7, [40, 70, 50]);
          if (d.altReasons?.length) {
            addWrapped(
              `Not suited: ${d.altReasons.slice(0, 2).join(" | ")}`,
              7,
              [100, 60, 50]
            );
          }
        }
      } else {
        addWrapped(
          "No dataset uploaded. Upload a CSV to include distribution statistics and hypothesis tests.",
          9,
          [100, 100, 110]
        );
      }

      if (chartImgs.length) {
        ensureSpace(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("4. Data Visualizations (all chart types)", margin, y);
        y += 6;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 110, 120);
        pdf.text(`Column: ${selectedColumn || "—"}`, margin, y);
        y += 6;

        for (const { label, img } of chartImgs) {
          ensureSpace(78);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          pdf.setTextColor(30, 50, 40);
          pdf.text(label, margin, y);
          y += 5;
          const imgW = contentW;
          const imgH = Math.min(70, imgW * 0.48);
          ensureSpace(imgH + 4);
          pdf.addImage(img, "PNG", margin, y, imgW, imgH);
          y += imgH + 8;
        }
      }

      // Multi-column chart grid
      if (multiColImg) {
        ensureSpace(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("4b. Histograms for all numeric columns", margin, y);
        y += 6;
        const imgW = contentW;
        const imgH = Math.min(120, imgW * 0.75);
        ensureSpace(imgH + 4);
        pdf.addImage(multiColImg, "PNG", margin, y, imgW, imgH);
        y += imgH + 8;
      }

      // Per-column distribution + mini bar chart drawn with jsPDF
      if (allColumnCharts.length) {
        ensureSpace(16);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("4c. Every column — distribution fit & histogram", margin, y);
        y += 7;
        for (const colChart of allColumnCharts) {
          ensureSpace(42);
          const d = colChart.dist;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(20, 60, 40);
          pdf.text(
            `${colChart.column}  →  ${d ? d.distribution : "—"}`,
            margin,
            y
          );
          y += 4;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7);
          if (d) {
            addWrapped(
              `n=${d.count} mean=${d.mean} SD=${d.sd} skew=${d.skewness} t=${d.tStatistic} p=${d.pValue < 0.001 ? "<0.001" : d.pValue.toFixed(3)}`,
              7,
              [50, 60, 70]
            );
            addWrapped(`Suited: ${d.reason}`, 7, [30, 90, 50]);
            if (d.altReasons?.length) {
              addWrapped(`Not suited: ${d.altReasons.slice(0, 2).join(" | ")}`, 7, [120, 50, 40]);
            }
          }
          // Mini histogram bars
          const bars = colChart.bar;
          if (bars.length) {
            const maxV = Math.max(...bars.map((b) => b.value), 1);
            const barH = 18;
            const barW = contentW / bars.length;
            ensureSpace(barH + 4);
            const baseY = y + barH;
            bars.forEach((b, i) => {
              const h = (b.value / maxV) * barH;
              pdf.setFillColor(46, 204, 113);
              pdf.rect(margin + i * barW, baseY - h, Math.max(0.8, barW - 0.5), h, "F");
            });
            y = baseY + 6;
          }
        }
      }

      // Regression section in PDF
      ensureSpace(20);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(20, 40, 70);
      pdf.text("4d. Linear & Multiple Regression", margin, y);
      y += 7;

      if (simpleRegImg) {
        ensureSpace(70);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text("Simple linear regression (actual vs predicted, dotted trend)", margin, y);
        y += 5;
        const imgH = Math.min(65, contentW * 0.45);
        pdf.addImage(simpleRegImg, "PNG", margin, y, contentW, imgH);
        y += imgH + 6;
      }
      if (multiRegImg) {
        ensureSpace(70);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text("Multiple linear regression (actual vs predicted)", margin, y);
        y += 5;
        const imgH = Math.min(65, contentW * 0.45);
        pdf.addImage(multiRegImg, "PNG", margin, y, contentW, imgH);
        y += imgH + 6;
      }

      for (const reg of regressions.slice(0, 8)) {
        ensureSpace(16);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(30, 50, 40);
        pdf.text(
          `${reg.type === "multiple" ? "MULTI" : "SIMPLE"}  R²=${reg.rSquared}  ${reg.equation}`,
          margin,
          y
        );
        y += 4;
        pdf.setFont("helvetica", "normal");
        addWrapped(reg.interpretation, 7, [50, 60, 70]);
      }
      if (!regressions.length) {
        addWrapped("Need at least 2 numeric columns for regression analysis.", 9, [100, 100, 110]);
      }

      const doneAI = reportAnalyses.filter((r) => r.status === "done");
      ensureSpace(20);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(20, 40, 70);
      pdf.text("5. AI Report Image Analysis", margin, y);
      y += 8;

      if (doneAI.length) {
        for (const r of doneAI) {
          ensureSpace(28);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          pdf.setTextColor(30, 40, 60);
          pdf.text(`${r.fileName}  ·  ${r.suggestedCondition}`, margin, y);
          y += 5;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(60, 70, 90);
          pdf.text(
            `Confidence ~${r.confidence}%${r.imageFeatures ? `  ·  Type: ${r.imageFeatures.docType}` : ""}`,
            margin,
            y
          );
          y += 5;
          for (const f of r.findings.slice(0, 5)) {
            addWrapped(`• ${f}`, 8, [50, 60, 80]);
          }
          y += 3;
        }
      } else {
        addWrapped(
          "No report images analyzed yet. Upload lab/ECG/discharge photos in the AI scanner section.",
          9,
          [100, 100, 110]
        );
      }

      ensureSpace(30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(20, 40, 70);
      pdf.text("6. Conclusion", margin, y);
      y += 8;
      pdf.setFont("helvetica", "normal");
      addWrapped(conclusion, 9, [30, 40, 60]);

      pdf.setFontSize(7.5);
      pdf.setTextColor(130, 140, 155);
      pdf.text(
        "Educational use only. Not a medical diagnosis. Consult a qualified healthcare professional.",
        margin,
        pageH - 8
      );

      const fname = "HeartDisease_Prediction.pdf";
      pdf.save(fname);
      setMessage(`Report PDF downloaded: ${fname}`);
    } catch (err) {
      console.error(err);
      setMessage("PDF generation failed. Try again or check the browser console.");
    } finally {
      if (prevTheme) document.documentElement.setAttribute("data-theme", prevTheme);
      else document.documentElement.removeAttribute("data-theme");
      setDownloading(false);
    }
  }

  const isDark = theme === "dark";

  return (
    <div className="app-shell">
      <Navbar user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />
      <main className="dashboard">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">PERSONAL HEALTH ANALYTICS</p>
            <h1>
              Hello, {user.name.split(" ")[0]} <span className="heart-emoji">♥</span>
            </h1>
            <p className="muted">
              Upload datasets & medical report images, explore statistical shapes, and generate a
              full risk report with charts.
            </p>
          </div>
          <div className="welcome-actions">
            <button className="outline-btn" onClick={onToggleTheme} type="button">
              {isDark ? <Sun size={17} /> : <Moon size={17} />} {isDark ? "Green" : "Dark"}
            </button>
            <button
              className="outline-btn"
              onClick={downloadReport}
              type="button"
              disabled={downloading}
            >
              <Download size={17} /> {downloading ? "Generating…" : "Download report"}
            </button>
          </div>
        </section>

        {message && (
          <div className="notice">
            <Info size={17} /> {message}
          </div>
        )}

        <section className="top-grid">
          <HeartVisual />
          <div className="upload-stack">
            <div className="upload-card">
              <div className="section-title">
                <div className="title-icon">
                  <Database size={20} />
                </div>
                <div>
                  <h3>Dataset analysis</h3>
                  <p>Upload CSV — auto-saved to your browser database</p>
                </div>
              </div>
              <label className="upload-zone">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <div className="upload-icon">
                  <Upload size={25} />
                </div>
                <strong>Drop your CSV here or browse</strong>
                <span>Numeric health variables · saved locally for return visits</span>
              </label>
              {dataset && (
                <div className="file-row">
                  <FileSpreadsheet size={20} />
                  <div>
                    <strong>{dataset.name}</strong>
                    <span>
                      {dataset.rowCount.toLocaleString()} rows · {dataset.numericColumns.length}{" "}
                      numeric · {dataset.categoricalColumns?.length || 0} categorical ·{" "}
                      {dataset.savedLocally ? "saved" : "session"}
                    </span>
                  </div>
                  <button type="button" onClick={clearDataset} aria-label="Clear dataset">
                    <X size={17} />
                  </button>
                </div>
              )}
            </div>

            <div className="upload-card ai-card">
              <div className="section-title">
                <div className="title-icon ai">
                  <Scan size={20} />
                </div>
                <div>
                  <h3>AI report scanner</h3>
                  <p>Real-time vision analysis of each uploaded image</p>
                </div>
              </div>
              <label className="upload-zone compact-zone">
                <input
                  ref={reportInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleReportImage(e.target.files?.[0])}
                />
                <div className="upload-icon ai">
                  <FileImage size={22} />
                </div>
                <strong>Upload report image</strong>
                <span>PNG · JPG · WEBP — unique analysis per image (brightness, edges, type)</span>
              </label>
            </div>
          </div>
        </section>

        {reportAnalyses.length > 0 && (
          <section className="ai-results">
            {reportAnalyses.map((r) => (
              <div key={r.id} className={`ai-result-card ${r.status}`}>
                <div className="ai-result-media">
                  <img src={r.previewUrl} alt={r.fileName} />
                </div>
                <div className="ai-result-body">
                  <div className="ai-result-head">
                    <Sparkles size={16} />
                    <strong>{r.fileName}</strong>
                    <span className={`ai-status ${r.status}`}>
                      {r.status === "analyzing" ? "Analyzing…" : "Complete"}
                    </span>
                  </div>
                  {r.status === "done" && (
                    <>
                      <p className="ai-condition">{r.suggestedCondition}</p>
                      <p className="ai-conf">
                        Confidence ~{r.confidence}%
                        {r.imageFeatures && (
                          <>
                            {" "}
                            · Type: <em>{r.imageFeatures.docType}</em>
                          </>
                        )}
                      </p>
                      {r.imageFeatures && (
                        <p className="ai-conf" style={{ opacity: 0.85, fontSize: "0.82rem" }}>
                          Vision: brightness {r.imageFeatures.brightness} · contrast{" "}
                          {r.imageFeatures.contrast} · edges {r.imageFeatures.edgeDensity} ·
                          entropy {r.imageFeatures.entropy}
                        </p>
                      )}
                      <ul>
                        {r.findings.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                      <div className="ai-recs">
                        {r.recommendations.map((rec, i) => (
                          <span key={i}>{rec}</span>
                        ))}
                      </div>
                    </>
                  )}
                  {r.status === "analyzing" && (
                    <div className="ai-loading">
                      <div className="ai-bar" />
                      Running real-time vision analysis on this image…
                    </div>
                  )}
                  {r.status === "error" && (
                    <ul>
                      {r.findings.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="ai-dismiss"
                  onClick={() => {
                    URL.revokeObjectURL(r.previewUrl);
                    setReportAnalyses((prev) => prev.filter((x) => x.id !== r.id));
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="stat-grid">
          <Stat
            icon={<Database />}
            label="Dataset rows"
            value={dataset ? dataset.rowCount.toLocaleString() : "—"}
            sub={dataset ? `${dataset.columns.length} columns` : "No dataset"}
            trend={dataset ? "up" : "neutral"}
          />
          <Stat
            icon={<BarChart3 />}
            label="Numeric variables"
            value={dataset ? String(dataset.numericColumns.length) : "—"}
            sub={dataQuality ? `${dataQuality.numericRatio}% of columns` : ""}
            trend="neutral"
          />
          <Stat
            icon={<FlaskConical />}
            label="Categorical variables"
            value={dataset ? String(dataset.categoricalColumns?.length || 0) : "—"}
            sub={categorical.length ? `${categorical.length} analysed` : "String / low-card"}
            trend={categorical.length > 0 ? "up" : "neutral"}
          />
          <Stat
            icon={<LineChart />}
            label="Distribution fits"
            value={distribution.length ? String(distribution.length) : "—"}
            sub={distribution.length ? "Fitted successfully" : "Upload dataset"}
            trend={distribution.length > 0 ? "up" : "neutral"}
          />
          <Stat
            icon={<ShieldCheck />}
            label="Risk level"
            value={prediction ? prediction.riskLevel : "Ready"}
            sub={prediction ? `Score: ${prediction.riskScore}/100` : "Run prediction"}
            trend={prediction?.riskLevel === "HIGH" ? "down" : prediction?.riskLevel === "LOW" ? "up" : "neutral"}
          />
          <Stat
            icon={<Target />}
            label="Data completeness"
            value={dataQuality ? `${dataQuality.completeness}%` : "—"}
            sub={dataQuality ? `${dataQuality.missing} missing cells` : "No dataset"}
            trend={dataQuality && dataQuality.completeness > 90 ? "up" : "down"}
          />
          <Stat
            icon={<Cpu />}
            label="Regression models"
            value={regressions.length ? String(regressions.length) : "—"}
            sub={regressions.length ? `Best R²: ${Math.max(...regressions.map(r => r.rSquared)).toFixed(3)}` : "Need ≥2 numeric cols"}
            trend="neutral"
          />
          <Stat
            icon={<Sigma />}
            label="BMI"
            value={String(bmi)}
            sub={bmiCategory.label}
            trend={bmi < 25 ? "up" : "down"}
          />
          <Stat
            icon={<FlaskConical />}
            label="Sig. tests (α=0.05)"
            value={distribution.filter(d => d.pValue < 0.05).length ? String(distribution.filter(d => d.pValue < 0.05).length) : "0"}
            sub={`of ${distribution.length} variables`}
            trend={distribution.filter(d => d.pValue < 0.05).length > 0 ? "down" : "up"}
          />
        </section>

        {dataset && (distribution.length > 0 || categorical.length > 0) && (
          <section className="analytics-grid">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">STATISTICAL ANALYSIS</p>
                  <h2>
                    {distribution.length > 0
                      ? "Distribution + hypothesis tests"
                      : "Categorical frequency analysis"}
                  </h2>
                </div>
                {dataset.numericColumns.length > 0 && (
                  <select
                    value={selectedColumn}
                    onChange={(e) => setSelectedColumn(e.target.value)}
                  >
                    {dataset.numericColumns.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>
              {distribution.length > 0 && (
                <div className="distribution-table">
                  {distribution.slice(0, 20).map((d) => (
                    <div
                      className={`distribution-item ${d.column === selectedColumn ? "active" : ""}`}
                      key={d.column}
                      onClick={() => setSelectedColumn(d.column)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="dist-name">
                        <strong>{d.column}</strong>
                        <span>
                          mean {d.mean} · SD {d.sd} · skew {d.skewness} · t={d.tStatistic} · p=
                          {d.pValue < 0.001 ? "<0.001" : d.pValue.toFixed(3)}
                          {d.pValue < 0.05 ? " *" : ""}
                        </span>
                      </div>
                      <div className={`dist-pill ${d.distribution.toLowerCase().replace(/\s/g, "-")}`}>
                        {d.distribution}
                      </div>
                      <div className="dist-reason">{d.reason}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Categorical columns appear here in Statistical Analysis */}
              {categorical.length > 0 && (
                <div style={{ marginTop: distribution.length ? 16 : 0 }}>
                  <p className="eyebrow" style={{ marginBottom: 8 }}>
                    CATEGORICAL COLUMNS ({categorical.length})
                  </p>
                  <div className="distribution-table">
                    {categorical.map((c) => (
                      <div className="distribution-item" key={c.column}>
                        <div className="dist-name">
                          <strong>{c.column}</strong>
                          <span>
                            {c.uniqueCount} levels · mode “{c.mode}” ({c.modePct}%) · entropy{" "}
                            {c.entropy}
                          </span>
                        </div>
                        <div className="dist-pill" style={{ background: "rgba(231,76,60,0.15)", color: "#e74c3c" }}>
                          Categorical
                        </div>
                        <div className="dist-reason">
                          {c.interpretation}
                          {c.frequencies.length > 0 && (
                            <span>
                              {" "}
                              Top:{" "}
                              {c.frequencies
                                .slice(0, 5)
                                .map((f) => `${f.value} (${f.count})`)
                                .join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {distribution.length > 0 && (
                <div className="reason-box">
                  <Info size={18} />
                  <div>
                    <strong>Why this distribution & t-test?</strong>
                    <p>
                      Fits use skewness, kurtosis and CV. One-sample t-tests compare each mean to a
                      clinical reference (e.g. BP 120, cholesterol 200). * p&lt;0.05. Exploratory only.
                      Categorical columns are listed above and are label-encoded for regression.
                    </p>
                    {selectedDist && (
                      <div style={{ marginTop: 10 }}>
                        <p style={{ margin: "0 0 6px", color: "var(--success)" }}>
                          <strong>Why {selectedDist.distribution} suits “{selectedDist.column}”:</strong>{" "}
                          {selectedDist.reason}
                        </p>
                        {selectedDist.altReasons?.length > 0 && (
                          <div>
                            <strong style={{ color: "var(--danger)" }}>
                              Why others are not suited:
                            </strong>
                            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                              {selectedDist.altReasons.map((ar, i) => (
                                <li key={i} style={{ marginBottom: 4, color: "var(--muted)" }}>
                                  {ar}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="panel chart-panel" ref={chartCaptureRef}>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">DATA VISUALIZATION</p>
                  <h2>
                    {chartType === "bell"
                      ? "Bell / Gaussian curve"
                      : chartType === "area"
                        ? "Density curve"
                        : chartType === "line"
                          ? "Sorted value series"
                          : chartType === "regression"
                            ? "Linear regression (actual · predicted)"
                            : "Histogram"}
                  </h2>
                </div>
                <div className="chart-type-tabs">
                  {(
                    [
                      ["bell", "Bell/Gaussian"],
                      ["bar", "Bar"],
                      ["line", "Line"],
                      ["area", "Area"],
                      ["regression", "Regression"]
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={chartType === key ? "active" : ""}
                      onClick={() => setChartType(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {chartType === "regression" && regressions.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <select
                    value={selectedRegIdx}
                    onChange={(e) => setSelectedRegIdx(Number(e.target.value))}
                    style={{ maxWidth: "100%" }}
                  >
                    {regressions.map((r, i) => (
                      <option key={i} value={i}>
                        {r.type === "multiple" ? "MULTI" : "SIMPLE"} R²={r.rSquared} — {r.equation.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  {selectedRegression && (
                    <p className="chart-caption" style={{ marginTop: 6 }}>
                      {selectedRegression.interpretation}
                    </p>
                  )}
                </div>
              )}
              <ResponsiveContainer width="100%" height={320}>
                {chartType === "regression" && selectedRegression ? (
                  <ComposedChart data={selectedRegression.points}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 10
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Actual"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted (fit)"
                      stroke="var(--danger)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  </ComposedChart>
                ) : chartType === "bar" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 10
                      }}
                    />
                    <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                ) : chartType === "line" ? (
                  <ReLineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 10
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--danger)"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </ReLineChart>
                ) : chartType === "area" ? (
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="densGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e63946" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#e63946" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 10
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#e63946"
                      fill="url(#densGrad)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                ) : (
                  <ComposedChart data={chartData}>
                    <defs>
                      <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0b74de" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#0b74de" stopOpacity={0.35} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="name" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 10
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="value"
                      name="Observed"
                      fill="url(#bellGrad)"
                      radius={[5, 5, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="theoretical"
                      name="Normal fit"
                      stroke="#e63946"
                      strokeWidth={2.8}
                      dot={false}
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
              {selectedDist && (
                <p className="chart-caption">
                  {selectedDist.distribution} · mean {selectedDist.mean} · SD {selectedDist.sd} ·
                  t={selectedDist.tStatistic} · p=
                  {selectedDist.pValue < 0.001 ? "<0.001" : selectedDist.pValue.toFixed(4)} ·
                  range [{selectedDist.min}, {selectedDist.max}]
                </p>
              )}
            </div>
          </section>
        )}

        {regressions.length > 0 && (
          <section className="panel" style={{ marginTop: 12 }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">REGRESSION ANALYSIS</p>
                <h2>Simple & multiple linear regression</h2>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Numeric columns plus label-encoded categorical columns (new string/code fields
              included). Actual vs fitted line. Switch the chart tab to &quot;Regression&quot;
              for interactive view.
            </p>
            <div className="distribution-table">
              {regressions.map((r, i) => (
                <div
                  key={i}
                  className={`distribution-item ${i === selectedRegIdx ? "active" : ""}`}
                  onClick={() => {
                    setSelectedRegIdx(i);
                    setChartType("regression");
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="dist-name">
                    <strong>
                      {r.type === "multiple" ? "Multiple" : "Simple"} · R²={r.rSquared}
                    </strong>
                    <span>{r.equation}</span>
                  </div>
                  <div className={`dist-pill ${r.type === "multiple" ? "skewed-right" : "normal"}`}>
                    {r.type}
                  </div>
                  <div className="dist-reason">{r.interpretation}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Correlation Matrix ── */}
        {correlationMatrix && (
          <section className="panel corr-section" style={{ marginTop: 12 }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">PEARSON CORRELATION</p>
                <h2>Feature correlation matrix</h2>
              </div>
              <Sigma className="blue-icon" />
            </div>
            <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
              Values close to ±1 indicate strong linear correlation. Diagonal is always 1. Positive = same direction, negative = inverse.
            </p>
            <div className="corr-grid" style={{ gridTemplateColumns: `repeat(${correlationMatrix.cols.length + 1}, auto)` }}>
              <div className="corr-cell corr-header" />
              {correlationMatrix.cols.map((c) => (
                <div key={c} className="corr-cell corr-header">{c.slice(0, 7)}</div>
              ))}
              {correlationMatrix.matrix.map((row, ri) => (
                <>
                  <div key={`row-${ri}`} className="corr-cell corr-header">
                    {correlationMatrix.cols[ri].slice(0, 7)}
                  </div>
                  {row.map((val, ci) => {
                    const abs = Math.abs(val);
                    const bg =
                      val === 1
                        ? "var(--accent)"
                        : val > 0.5
                        ? `rgba(46,204,113,${0.3 + abs * 0.5})`
                        : val < -0.5
                        ? `rgba(231,76,60,${0.3 + abs * 0.5})`
                        : `rgba(120,140,160,${abs * 0.4 + 0.05})`;
                    return (
                      <div
                        key={`${ri}-${ci}`}
                        className="corr-cell corr-val"
                        style={{ background: bg, color: abs > 0.4 ? "#fff" : "var(--text)" }}
                        title={`${correlationMatrix.cols[ri]} × ${correlationMatrix.cols[ci]} = ${val}`}
                      >
                        {val.toFixed(2)}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </section>
        )}

        {/* ── Scatter Explorer ── */}
        {dataset && dataset.numericColumns.length >= 2 && (
          <section className="panel" style={{ marginTop: 12 }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">CORRELATION EXPLORER</p>
                <h2>Scatter plot — variable vs variable</h2>
              </div>
              <TrendingUp className="blue-icon" />
            </div>
            <div className="scatter-controls">
              <label>
                X axis
                <select value={scatterX} onChange={(e) => setScatterX(e.target.value)}>
                  {dataset.numericColumns.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>
                Y axis
                <select value={scatterY} onChange={(e) => setScatterY(e.target.value)}>
                  {dataset.numericColumns.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <span className="scatter-count">{scatterData.length.toLocaleString()} points</span>
            </div>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                  <XAxis type="number" dataKey="x" name={scatterX} stroke="var(--muted)" tick={{ fontSize: 11 }} label={{ value: scatterX, position: "insideBottom", offset: -5, fill: "var(--muted)", fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name={scatterY} stroke="var(--muted)" tick={{ fontSize: 11 }} label={{ value: scatterY, angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
                  <ZAxis range={[25, 25]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(val: number, name: string) => [val.toFixed(3), name]}
                  />
                  <Scatter data={scatterData} fill="var(--accent)" opacity={0.65} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            {correlationMatrix && (() => {
              const xi = correlationMatrix.cols.indexOf(scatterX);
              const yi = correlationMatrix.cols.indexOf(scatterY);
              if (xi >= 0 && yi >= 0) {
                const r = correlationMatrix.matrix[xi][yi];
                return (
                  <p className="chart-caption" style={{ marginTop: 8 }}>
                    Pearson r = <strong style={{ color: Math.abs(r) > 0.5 ? "var(--accent)" : "var(--muted)" }}>{r.toFixed(3)}</strong>
                    {" · "}
                    {Math.abs(r) > 0.7 ? "Strong" : Math.abs(r) > 0.4 ? "Moderate" : "Weak"}
                    {r >= 0 ? " positive" : " negative"} linear association
                    {" · "}{scatterData.length} data points shown
                  </p>
                );
              }
              return null;
            })()}
          </section>
        )}

        {dataset && categorical.length > 0 && (
          <section className="panel" style={{ marginTop: 12 }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">CATEGORICAL ANALYSIS</p>
                <h2>Frequency · mode · entropy</h2>
              </div>
              <FlaskConical className="blue-icon" />
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
              All detected categorical columns (string labels and low-cardinality codes) are listed
              in Statistical Analysis above, charted here, label-encoded for regression, and used in
              risk prediction.
            </p>
            <div className="mini-hist-grid">
              {categorical.slice(0, 20).map((c) => (
                <div key={c.column} className="mini-hist" style={{ minHeight: 180 }}>
                  <div className="mini-hist-label">
                    {c.column}
                    <span className="mini-dist">
                      mode: {c.mode} ({c.modePct}%)
                    </span>
                  </div>
                  <div style={{ width: "100%", height: 130 }}>
                    <ResponsiveContainer>
                      <BarChart
                        data={c.frequencies.slice(0, 10).map((f) => ({
                          name: f.value.length > 12 ? f.value.slice(0, 11) + "…" : f.value,
                          value: f.count
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis dataKey="name" stroke="var(--muted)" tick={{ fontSize: 9 }} />
                        <YAxis stroke="var(--muted)" tick={{ fontSize: 10 }} width={28} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12
                          }}
                        />
                        <Bar dataKey="value" name="Count" fill="#e74c3c" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    {c.uniqueCount} levels · entropy {c.entropy} bits
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="panel" style={{ marginTop: 12 }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">DATA CLEANING</p>
                <h2>Upload a file and download the cleaned dataset</h2>
              </div>
              <Eraser className="blue-icon" />
            </div>
            <p className="chart-caption">
              Drops empty and duplicate rows, trims text, fills numeric gaps with the median, fills categories with the mode, and coerces numeric columns.
            </p>
            <label className="upload-zone" style={{ marginTop: 12 }}>
              <input type="file" accept=".csv,text/csv" onChange={(e) => handleCleanFile(e.target.files?.[0])} />
              <div className="upload-icon"><Upload size={25} /></div>
              <strong>Upload CSV to clean</strong>
              <span>Does not replace the analysis dataset unless you also upload it above.</span>
            </label>
            {cleanReport && (
              <div style={{ marginTop: 14 }}>
                <div className="stat-grid">
                  <Stat icon={<Database />} label="Rows in" value={String(cleanReport.originalRows)} sub="before cleaning" trend="neutral" />
                  <Stat icon={<CheckCircle2 />} label="Rows out" value={String(cleanReport.cleanedRows)} sub={`${cleanReport.removedRows} removed`} trend="up" />
                  <Stat icon={<Eraser />} label="Columns touched" value={String(cleanReport.columnsTouched.length)} sub="imputed or coerced" trend="neutral" />
                </div>
                <ul style={{ margin: "12px 0", color: "var(--muted)", fontSize: 13 }}>
                  {cleanReport.steps.map((s) => <li key={s}>{s}</li>)}
                </ul>
                <button type="button" className="primary-btn" onClick={downloadCleaned}>
                  <Download size={16} /> Download cleaned CSV
                </button>
              </div>
            )}
          </section>

          <section className="panel" style={{ marginTop: 12 }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">FEATURE ENGINEERING EXPORT</p>
                <h2>Download dataset with engineered columns</h2>
              </div>
              <Sparkles className="blue-icon" />
            </div>
            <p className="chart-caption">
              Separate export that keeps all original columns and appends Risk_pct, Has_Disease, Risk_Level, plus one-hot categorical flags (drop-first style) — matching the Python pipeline extras.
            </p>
            <button
              type="button"
              className="primary-btn"
              style={{ marginTop: 10 }}
              onClick={downloadFeatureEngineered}
              disabled={!dataset}
            >
              <Download size={16} /> Download feature-engineered CSV
            </button>
          </section>

          <section className="panel" style={{ marginTop: 12 }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">BIAS AND VARIANCE · ADVANCED</p>
                <h2>Learning curve, complexity &amp; error decomposition</h2>
              </div>
              <Sigma className="blue-icon" />
            </div>
            {!biasVariance ? (
              <p className="chart-caption">Upload a dataset (≥20 rows) to run hold-out, 5-fold CV, learning curve, and complexity analysis.</p>
            ) : (
              <>
                <p className="chart-caption">
                  Result: <strong>{biasVariance.result}</strong> — {biasVariance.explanation}
                  {" "}Optimal cutoff {biasVariance.optimalCutoff}. Target column {biasVariance.targetUsed ? "detected" : "proxy"}.
                  {" "}n={biasVariance.sampleSize}.
                </p>
                <p className="chart-caption" style={{ marginTop: 4 }}>
                  Recommendation: {biasVariance.recommendation}
                </p>
                <div className="stat-grid" style={{ marginTop: 10, marginBottom: 8 }}>
                  <Stat icon={<TrendingUp />} label="Train acc" value={`${(biasVariance.trainAcc * 100).toFixed(1)}%`} sub={`Brier loss ${(biasVariance.trainLoss * 100).toFixed(1)}`} trend="up" />
                  <Stat icon={<TrendingDown />} label="Test acc" value={`${(biasVariance.testAcc * 100).toFixed(1)}%`} sub={`Brier loss ${(biasVariance.testLoss * 100).toFixed(1)}`} trend={biasVariance.gap > 0.08 ? "down" : "neutral"} />
                  <Stat icon={<Sigma />} label="Est. bias²" value={biasVariance.estimatedBias.toFixed(3)} sub={`Var ${biasVariance.estimatedVariance.toFixed(3)} · noise ${biasVariance.irreducibleNoise.toFixed(3)}`} trend="neutral" />
                  <Stat icon={<Target />} label="CV mean" value={`${biasVariance.meanCv}%`} sub={`± ${biasVariance.stdCv} (5-fold)`} trend="up" />
                </div>
                <div className="analytics-grid" style={{ marginTop: 8 }}>
                  <div style={{ height: 260 }}>
                    <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>Train vs test accuracy &amp; loss</p>
                    <ResponsiveContainer>
                      <ComposedChart data={biasVariance.chart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis dataKey="name" stroke="var(--muted)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="var(--muted)" domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="accuracy" name="Accuracy %" radius={[6, 6, 0, 0]} fill="#2ecc71" />
                        <Line type="monotone" dataKey="loss" name="Brier loss ×100" stroke="#e74c3c" strokeWidth={2} dot />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ height: 260 }}>
                    <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>5-fold CV accuracy &amp; fold deviation</p>
                    <ResponsiveContainer>
                      <ReLineChart data={biasVariance.foldAccuracies.map((accuracy, i) => ({ name: `Fold ${i + 1}`, accuracy, variance: Math.abs(accuracy - biasVariance.meanCv) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis dataKey="name" stroke="var(--muted)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="var(--muted)" domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="accuracy" name="Fold accuracy %" stroke="#3498db" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="variance" name="|acc − mean|" stroke="#e67e22" strokeWidth={2} dot />
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="analytics-grid" style={{ marginTop: 12 }}>
                  <div style={{ height: 260 }}>
                    <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>Learning curve (train size %)</p>
                    <ResponsiveContainer>
                      <ReLineChart data={biasVariance.learningCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis dataKey="frac" stroke="var(--muted)" tick={{ fontSize: 11 }} unit="%" />
                        <YAxis stroke="var(--muted)" domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="trainAcc" name="Train %" stroke="#2ecc71" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="testAcc" name="Test %" stroke="#e74c3c" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="gap" name="Gap pts" stroke="#f1c40f" strokeWidth={2} strokeDasharray="4 4" dot />
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ height: 260 }}>
                    <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>Complexity curve (decision cutoff capacity)</p>
                    <ResponsiveContainer>
                      <ReLineChart data={biasVariance.complexityCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis dataKey="label" stroke="var(--muted)" tick={{ fontSize: 10 }} />
                        <YAxis stroke="var(--muted)" domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="trainAcc" name="Train %" stroke="#1abc9c" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="testAcc" name="Test %" stroke="#9b59b6" strokeWidth={2} dot />
                      </ReLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </section>

          {categorical.length > 0 && activeCat && (
            <section className="panel" style={{ marginTop: 12 }}>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">CATEGORICAL GRAPHS</p>
                  <h2>Frequency and share for category columns</h2>
                </div>
                <BarChart3 className="blue-icon" />
              </div>
              <label className="field" style={{ maxWidth: 280 }}>
                <span>Category column</span>
                <select value={activeCat.column} onChange={(e) => setCatChartCol(e.target.value)}>
                  {categorical.map((c) => <option key={c.column} value={c.column}>{c.column}</option>)}
                </select>
              </label>
              <div className="analytics-grid">
                <div style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={activeCat.frequencies.slice(0, 12)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                      <XAxis dataKey="value" stroke="var(--muted)" tick={{ fontSize: 10 }} interval={0} angle={-25} height={60} />
                      <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Count" fill="#e74c3c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={activeCat.frequencies.slice(0, 8)} dataKey="pct" nameKey="value" outerRadius={100} label>
                        {activeCat.frequencies.slice(0, 8).map((_, i) => <Cell key={i} fill={["#e74c3c", "#2ecc71", "#3498db", "#f1c40f", "#9b59b6", "#1abc9c", "#e67e22", "#34495e"][i % 8]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="chart-caption">Mode {activeCat.mode} ({activeCat.modePct}%) · {activeCat.uniqueCount} levels · entropy {activeCat.entropy} bits. {activeCat.interpretation}</p>
            </section>
          )}

        <section className="prediction-section">
          <div className="panel prediction-form">
            <div className="panel-head">
              <div>
                <p className="eyebrow">HEART RISK ASSESSMENT</p>
                <h2>Enter health information</h2>
              </div>
              <HeartPulse className="blue-icon" />
            </div>
            <div className="form-grid">
              <Field label="Age" value={form.age} set={(v) => setForm({ ...form, age: Number(v) })} />
              <SelectField
                label="Gender"
                value={form.gender}
                options={["Male", "Female", "Other"]}
                set={(v) => setForm({ ...form, gender: v })}
              />
              <Field
                label="Height (cm)"
                value={form.height}
                set={(v) => setForm({ ...form, height: Number(v) })}
              />
              <Field
                label="Weight (kg)"
                value={form.weight}
                set={(v) => setForm({ ...form, weight: Number(v) })}
              />
              <Field
                label="Resting BP"
                value={form.restingBp}
                set={(v) => setForm({ ...form, restingBp: Number(v) })}
              />
              <Field
                label="Cholesterol"
                value={form.cholesterol}
                set={(v) => setForm({ ...form, cholesterol: Number(v) })}
              />
              <Field
                label="Heart rate"
                value={form.heartRate}
                set={(v) => setForm({ ...form, heartRate: Number(v) })}
              />
              <Field
                label="Blood sugar"
                value={form.bloodSugar}
                set={(v) => setForm({ ...form, bloodSugar: Number(v) })}
              />
              <SelectField
                label="Smoking"
                value={form.smoking}
                options={["No", "Yes"]}
                set={(v) => setForm({ ...form, smoking: v })}
              />
              <SelectField
                label="Alcohol"
                value={form.alcohol}
                options={["No", "Yes"]}
                set={(v) => setForm({ ...form, alcohol: v })}
              />
              <SelectField
                label="Chest pain"
                value={form.chestPain}
                options={["No", "Yes"]}
                set={(v) => setForm({ ...form, chestPain: v })}
              />
            </div>
            <button className="primary-btn" onClick={runPrediction} disabled={busy} type="button">
              {busy ? (
                "Analyzing..."
              ) : (
                <>
                  <HeartPulse size={18} /> Predict heart disease risk
                </>
              )}
            </button>
          </div>

          <div
            className={`result-card ${prediction ? prediction.riskLevel.toLowerCase() : "empty"}`}
          >
            {!prediction ? (
              <>
                <div className="result-icon">
                  <HeartPulse size={34} />
                </div>
                <p className="eyebrow">PREDICTION RESULT</p>
                <h2>Your result will appear here</h2>
                <p>Complete the health form and run the assessment.</p>
              </>
            ) : (
              <>
                <div className="result-icon">
                  {prediction.riskLevel === "HIGH" ? (
                    <AlertTriangle size={34} />
                  ) : (
                    <CheckCircle2 size={34} />
                  )}
                </div>
                <p className="eyebrow">PREDICTION RESULT</p>
                <h2>{prediction.riskLevel} RISK</h2>
                <div className="risk-score">
                  {prediction.riskScore}
                  <span>/100</span>
                </div>
                <p>{prediction.result}</p>
                <small>Generated {new Date(prediction.createdAt).toLocaleString()}</small>
              </>
            )}
          </div>
        </section>

        {/* Off-screen charts for multi-graph PDF export — always rendered when data exists */}
        {allCharts && (
          <div
            aria-hidden
            style={{
              position: "fixed",
              left: -9999,
              top: 0,
              width: 640,
              pointerEvents: "none",
              opacity: 1,
              background: "#ffffff",
              zIndex: -1
            }}
          >
            <div ref={bellCaptureRef} style={{ padding: 12, background: "#fff" }}>
              <p style={{ margin: "0 0 8px", color: "#10233f", fontWeight: 600, fontSize: 13 }}>
                Bell curve — {selectedColumn}
              </p>
              <ResponsiveContainer width={600} height={240}>
                <ComposedChart data={allCharts.bell}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef5" />
                  <XAxis dataKey="name" tick={{ fill: "#6c7f94", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#6c7f94", fontSize: 10 }} />
                  <Bar dataKey="value" name="Observed" fill="#0b74de" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="theoretical" name="Normal fit" stroke="#e63946" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div ref={barCaptureRef} style={{ padding: 12, background: "#fff" }}>
              <p style={{ margin: "0 0 8px", color: "#10233f", fontWeight: 600, fontSize: 13 }}>
                Histogram — {selectedColumn}
              </p>
              <ResponsiveContainer width={600} height={240}>
                <BarChart data={allCharts.bar}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef5" />
                  <XAxis dataKey="name" tick={{ fill: "#6c7f94", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#6c7f94", fontSize: 10 }} />
                  <Bar dataKey="value" fill="#2ecc71" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div ref={lineCaptureRef} style={{ padding: 12, background: "#fff" }}>
              <p style={{ margin: "0 0 8px", color: "#10233f", fontWeight: 600, fontSize: 13 }}>
                Sorted series — {selectedColumn}
              </p>
              <ResponsiveContainer width={600} height={240}>
                <ReLineChart data={allCharts.line}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef5" />
                  <XAxis dataKey="name" tick={{ fill: "#6c7f94", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#6c7f94", fontSize: 10 }} />
                  <Line type="monotone" dataKey="value" stroke="#e63946" strokeWidth={2.5} dot={false} />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
            <div ref={areaCaptureRef} style={{ padding: 12, background: "#fff" }}>
              <p style={{ margin: "0 0 8px", color: "#10233f", fontWeight: 600, fontSize: 13 }}>
                Density curve — {selectedColumn}
              </p>
              <ResponsiveContainer width={600} height={240}>
                <AreaChart data={allCharts.area}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef5" />
                  <XAxis dataKey="name" tick={{ fill: "#6c7f94", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#6c7f94", fontSize: 10 }} />
                  <Area type="monotone" dataKey="value" stroke="#e63946" fill="#e6394666" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Hidden multi-column histogram grid for PDF */}
        {allColumnCharts.length > 0 && (
          <div
            ref={multiColCaptureRef}
            aria-hidden
            style={{
              position: "fixed",
              left: -9999,
              top: 0,
              width: 720,
              padding: 16,
              background: "#ffffff",
              zIndex: -1
            }}
          >
            <p style={{ margin: "0 0 12px", color: "#10233f", fontWeight: 700, fontSize: 14 }}>
              Histograms — all numeric columns
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {allColumnCharts.map((c) => (
                <div key={c.column} style={{ border: "1px solid #e0eaf4", borderRadius: 8, padding: 8 }}>
                  <p style={{ margin: "0 0 4px", color: "#10233f", fontSize: 11, fontWeight: 600 }}>
                    {c.column} {c.dist ? `(${c.dist.distribution})` : ""}
                  </p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={c.bar}>
                      <XAxis dataKey="name" hide />
                      <YAxis hide />
                      <Bar dataKey="value" fill="#2ecc71" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hidden regression charts for PDF */}
        {regressions.length > 0 && (
          <>
            <div
              ref={simpleRegCaptureRef}
              aria-hidden
              style={{
                position: "fixed",
                left: -9999,
                top: 0,
                width: 640,
                padding: 12,
                background: "#fff",
                zIndex: -1
              }}
            >
              {(() => {
                const reg = regressions.find((r) => r.type === "simple") || regressions[0];
                return (
                  <>
                    <p style={{ margin: "0 0 8px", color: "#10233f", fontWeight: 600, fontSize: 12 }}>
                      Simple regression — {reg.equation} (R²={reg.rSquared})
                    </p>
                    <ResponsiveContainer width={600} height={220}>
                      <ComposedChart data={reg.points}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef5" />
                        <XAxis dataKey="name" tick={{ fill: "#6c7f94", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#6c7f94", fontSize: 10 }} />
                        <Line type="monotone" dataKey="actual" name="Actual" stroke="#2ecc71" strokeWidth={2} dot={{ r: 2 }} />
                        <Line
                          type="monotone"
                          dataKey="predicted"
                          name="Predicted"
                          stroke="#e63946"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </>
                );
              })()}
            </div>
            <div
              ref={multiRegCaptureRef}
              aria-hidden
              style={{
                position: "fixed",
                left: -9999,
                top: 0,
                width: 640,
                padding: 12,
                background: "#fff",
                zIndex: -1
              }}
            >
              {(() => {
                const reg = regressions.find((r) => r.type === "multiple") || regressions[regressions.length - 1];
                return (
                  <>
                    <p style={{ margin: "0 0 8px", color: "#10233f", fontWeight: 600, fontSize: 12 }}>
                      Multiple regression — {reg.equation.slice(0, 80)} (R²={reg.rSquared})
                    </p>
                    <ResponsiveContainer width={600} height={220}>
                      <ComposedChart data={reg.points}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef5" />
                        <XAxis dataKey="name" tick={{ fill: "#6c7f94", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#6c7f94", fontSize: 10 }} />
                        <Line type="monotone" dataKey="actual" name="Actual" stroke="#1abc9c" strokeWidth={2} dot={{ r: 2 }} />
                        <Line
                          type="monotone"
                          dataKey="predicted"
                          name="Predicted"
                          stroke="#e63946"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </>
                );
              })()}
            </div>
          </>
        )}

        {(prediction || distribution.length > 0 || reportAnalyses.some((r) => r.status === "done")) && (
          <section className="panel" style={{ marginTop: 8 }}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">CLINICAL SUMMARY</p>
                <h2>Conclusion</h2>
              </div>
              <Activity className="blue-icon" />
            </div>
            <p style={{ margin: 0, lineHeight: 1.65, color: "var(--text)" }}>{conclusion}</p>
          </section>
        )}

        <section className="disclaimer">
          <Info size={17} />
          <span>
            This application is a research/educational analytics interface. Risk outputs and AI
            report scans are not diagnoses and must not replace evaluation by a qualified healthcare
            professional.
          </span>
        </section>
      </main>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  trend
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
        {sub && (
          <div className="stat-sub">
            {trend === "up" && <TrendingUp size={11} style={{ color: "var(--success)" }} />}
            {trend === "down" && <TrendingDown size={11} style={{ color: "var(--danger)" }} />}
            <span>{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  set
}: {
  label: string;
  value: number;
  set: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  set
}: {
  label: string;
  value: string;
  options: string[];
  set: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
