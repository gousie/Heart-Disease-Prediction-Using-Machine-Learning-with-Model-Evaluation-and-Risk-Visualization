import { useCallback, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Layers,
  Play,
  Terminal,
  Trash2,
  Upload,
  X,
  Zap,
  AlertCircle,
  Settings2
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  ZAxis
} from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Navbar from "../components/Navbar";
import type {
  CategoricalResult,
  DatasetState,
  DistributionResult,
  RegressionResult,
  StatTestResult,
  ThemeMode,
  User
} from "../types";
import {
  chooseDistribution,
  runStatTests,
  buildRegressions,
  histogramWithBell,
  histogram,
  detectColumnTypes,
  analyzeCategorical,
  categoricalRiskBoost,
  engineerFeatures,
  analyzeBiasVariance
} from "../utils/analytics";

const DEFAULT_CODE = `# Heart Disease Analysis Console
# Upload any CSV → click RUN
# Pipeline: descriptive stats · categorical frequencies
#           · distribution fit · t-tests · regression
#           · row predictions (numeric + categorical)
#           · feature engineering (new columns at the end)
#           · graphs · statistical conclusion

df = load_csv("your_dataset.csv")
run_full_analysis(df)

# Feature engineering — new columns appended at the end
df["bmi"] = weight / (height / 100) ** 2
df["high_bp"] = (trestbps >= 140).astype(int)
df["high_chol"] = (chol >= 240).astype(int)
df["elderly"] = (age >= 60).astype(int)
df["age_band"] = cut(age, bins=[0, 40, 55, 70, 120])
df["chol_per_age"] = chol / age
df["bp_x_age"] = trestbps * age / 100
df["hr_reserve"] = thalach / (220 - age)
df["log_chol"] = log1p(chol)
df["z_age"] = (age - age.mean()) / age.std()
df["z_chol"] = (chol - chol.mean()) / chol.std()
df["z_bp"] = (trestbps - trestbps.mean()) / trestbps.std()
# one-hot flags: sex__1, cp__2, ... plus Risk_pct, Has_Disease, Risk_Level
`;

type PredRow = {
  index: number;
  riskPct: number;
  hasDisease: "Yes" | "No";
  riskLevel: "None" | "Low" | "Medium" | "High";
  [key: string]: unknown;
};

type AnalysisBundle = {
  distributions: DistributionResult[];
  tests: StatTestResult[];
  regressions: RegressionResult[];
  categorical: CategoricalResult[];
  predictions: PredRow[];
  conclusion: string;
  selectedHistCol: string;
  processedAt: string;
  durationMs: number;
  engineeredRows: EngineeredRow[];
  newColumns: string[];
};

type DownloadOptions = {
  includeText: boolean;
  includeCharts: boolean;
  includeConclusion: boolean;
  includeTables: boolean;
  includeRegression: boolean;
  paperSize: "a4" | "letter";
  orientation: "portrait" | "landscape";
};

function riskLevel(pct: number): "None" | "Low" | "Medium" | "High" {
  if (pct <= 0) return "None";
  if (pct <= 30) return "Low";
  if (pct <= 60) return "Medium";
  return "High";
}

function heuristicRisk(row: Record<string, unknown>): number {
  let score = 0;
  const num = (keys: string[]) => {
    for (const k of keys) {
      const v = Number(row[k]);
      if (Number.isFinite(v)) return v;
      // case-insensitive fallback
      const found = Object.keys(row).find(
        (rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, "")
      );
      if (found) {
        const vv = Number(row[found]);
        if (Number.isFinite(vv)) return vv;
      }
    }
    return null;
  };
  const age = num(["age", "Age"]);
  if (age != null) {
    if (age >= 65) score += 25;
    else if (age >= 55) score += 15;
    else if (age >= 45) score += 8;
  }
  const bp = num(["trestbps", "restingbp", "RestingBP", "bp", "restingBp"]);
  if (bp != null) {
    if (bp >= 140) score += 20;
    else if (bp >= 130) score += 12;
    else if (bp >= 120) score += 5;
  }
  const chol = num(["chol", "cholesterol", "Cholesterol"]);
  if (chol != null) {
    if (chol >= 240) score += 20;
    else if (chol >= 200) score += 10;
  }
  const hr = num(["thalach", "maxhr", "MaxHR", "heartrate", "heartRate"]);
  if (hr != null) {
    if (hr < 120) score += 15;
    else if (hr < 140) score += 8;
  }
  const op = num(["oldpeak", "Oldpeak"]);
  if (op != null) {
    if (op >= 2) score += 15;
    else if (op >= 1) score += 8;
  }
  // Numeric-coded categoricals still counted if present as numbers
  const fbs = num(["fbs", "bloodsugar", "bloodSugar", "Fbs"]);
  if (fbs != null && fbs >= 1) score += 10;
  const cp = num(["cp", "chestpain", "chestPain", "ChestPainType"]);
  if (cp != null && cp >= 1) score += 10;
  const exang = num(["exang", "ExerciseAngina"]);
  if (exang != null && exang === 1) score += 12;

  // String + coded categorical features (sex, smoking, alcohol, thal, slope, …)
  score += categoricalRiskBoost(row);

  return Math.min(score, 100);
}

function logisticStyleProb(row: Record<string, unknown>): number {
  let z = -1.5;
  const add = (keys: string[], weight: number, healthy: number) => {
    for (const k of keys) {
      const v = Number(row[k]);
      if (Number.isFinite(v)) {
        z += weight * ((v - healthy) / Math.max(Math.abs(healthy), 1));
        return;
      }
      const found = Object.keys(row).find(
        (rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, "")
      );
      if (found) {
        const vv = Number(row[found]);
        if (Number.isFinite(vv)) {
          z += weight * ((vv - healthy) / Math.max(Math.abs(healthy), 1));
          return;
        }
      }
    }
  };
  add(["age", "Age"], 0.04, 45);
  add(["trestbps", "restingbp", "RestingBP", "bp"], 0.025, 120);
  add(["chol", "cholesterol"], 0.008, 200);
  add(["thalach", "maxhr", "MaxHR"], -0.02, 150);
  add(["oldpeak", "Oldpeak"], 0.4, 0.5);
  add(["fbs", "bloodsugar"], 0.5, 0);
  add(["exang"], 0.8, 0);
  add(["cp", "chestpain"], 0.35, 0);
  // Categorical boost mapped into logistic scale (~0–0.6 extra)
  z += categoricalRiskBoost(row) / 50;
  return Math.round((1 / (1 + Math.exp(-z))) * 1000) / 10;
}

function findTargetColumn(columns: string[]): string | null {
  const candidates = [
    "target", "num", "disease", "heartdisease", "heart_disease",
    "outcome", "class", "hd", "heart"
  ];
  for (const c of columns) {
    if (candidates.includes(c.toLowerCase().replace(/[^a-z]/g, ""))) return c;
  }
  return null;
}

function buildFullConclusion(
  dists: DistributionResult[],
  tests: StatTestResult[],
  regs: RegressionResult[],
  preds: PredRow[],
  datasetName: string,
  rowCount: number,
  cats: CategoricalResult[] = []
): string {
  const parts: string[] = [];
  parts.push(
    `Dataset "${datasetName}" (${rowCount} observations) was analysed end-to-end: descriptive statistics, categorical frequency analysis, distribution selection, hypothesis tests, linear regression, and individual risk scoring (numeric + categorical features).`
  );
  const sig = tests.filter((t) => t.significant);
  if (sig.length) {
    parts.push(
      `Hypothesis testing (one-sample t-tests, α = 0.05): ${sig.length} variable(s) differ significantly from clinical reference means — ` +
        sig
          .slice(0, 5)
          .map(
            (t) =>
              `${t.column} (mean ${t.mean} vs ref ${t.referenceMean}, t = ${t.tStatistic}, p ${
                t.pValue < 0.001 ? "< 0.001" : "= " + t.pValue.toFixed(4)
              })`
          )
          .join("; ") +
        `. Reject H₀ for these features; sample means are not compatible with the stated healthy/reference values.`
    );
  } else if (tests.length) {
    parts.push(
      `Hypothesis testing (one-sample t-tests, α = 0.05): no variable reached statistical significance against clinical references. Fail to reject H₀ — observed means are consistent with reference values within sampling error.`
    );
  }
  if (cats.length) {
    const catSummary = cats
      .slice(0, 8)
      .map((c) => `${c.column} (mode "${c.mode}" ${c.modePct}%, ${c.uniqueCount} levels)`)
      .join("; ");
    parts.push(
      `Categorical frequency analysis: ${catSummary}. Modes and entropy summarise class balance; imbalanced levels can bias simple risk rules.`
    );
  }
  if (dists.length) {
    const summary = dists
      .slice(0, 8)
      .map((d) => `${d.column} → ${d.distribution} (skew ${d.skewness.toFixed(2)})`)
      .join("; ");
    parts.push(
      `Distribution selection (moment-based scoring over Normal/Gaussian, Uniform, Exponential, Skewed, Bernoulli, Binomial, Poisson): ${summary}. ` +
        `These fits guide which parametric assumptions are reasonable for downstream modelling.`
    );
  }
  if (regs.length) {
    const best = [...regs].sort((a, b) => b.rSquared - a.rSquared)[0];
    parts.push(
      `Linear regression: best model is ${best.type} — ${best.equation} (R² = ${best.rSquared.toFixed(
        3
      )}). ${best.interpretation}`
    );
    if (regs.length > 1) {
      parts.push(
        `In total ${regs.length} regression specifications were estimated (simple + multiple). Higher R² indicates stronger linear association; low R² means residual clinical noise remains large.`
      );
    }
  } else {
    parts.push(
      `Linear regression was skipped (need at least two numeric columns). Upload a richer numeric dataset to obtain slope, intercept and R².`
    );
  }
  const yes = preds.filter((p) => p.hasDisease === "Yes").length;
  const no = preds.length - yes;
  const high = preds.filter((p) => p.riskLevel === "High").length;
  const med = preds.filter((p) => p.riskLevel === "Medium").length;
  parts.push(
    `Individual risk scoring: ${yes} of ${preds.length} persons flagged Yes (risk > 0%), ${no} flagged No. ` +
      `Risk bands — High: ${high}, Medium: ${med}, remainder Low/None. ` +
      `Rule: 0% → No disease; 1–30% Low; 31–60% Medium; 61–100% High.`
  );
  parts.push(
    `Critical values used: two-tailed α = 0.05 for t-tests; p-values are approximate (large-df normal or incomplete-beta for Student-t). ` +
      `This console output is educational only and is not a clinical diagnosis.`
  );
  return parts.join("\n\n");
}

// ─── chunked async runner to avoid freezing on large files ───────────────────
function runChunked<T>(
  items: T[],
  chunkSize: number,
  processor: (item: T, index: number) => void,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const total = items.length;
    function step() {
      const end = Math.min(i + chunkSize, total);
      for (; i < end; i++) processor(items[i], i);
      onProgress(Math.round((i / total) * 100));
      if (i < total) {
        setTimeout(step, 0);
      } else {
        resolve();
      }
    }
    step();
  });
}

export default function Console({
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
  const [code, setCode] = useState(DEFAULT_CODE);
  const [dataset, setDataset] = useState<DatasetState | null>(null);
  const [output, setOutput] = useState("");
  const [bundle, setBundle] = useState<AnalysisBundle | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [histCol, setHistCol] = useState("");
  const [regIdx, setRegIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [showDlModal, setShowDlModal] = useState(false);
  const [dlOptions, setDlOptions] = useState<DownloadOptions>({
    includeText: true,
    includeCharts: true,
    includeConclusion: true,
    includeTables: true,
    includeRegression: true,
    paperSize: "a4",
    orientation: "portrait"
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  // chart capture refs
  const histBellRef = useRef<HTMLDivElement>(null);
  const histBarRef = useRef<HTMLDivElement>(null);
  const riskBarRef = useRef<HTMLDivElement>(null);
  const riskAreaRef = useRef<HTMLDivElement>(null);
  const regScatterRef = useRef<HTMLDivElement>(null);
  const regLineRef = useRef<HTMLDivElement>(null);

  const levelCounts = useMemo(() => {
    if (!bundle) return [];
    const counts: Record<string, number> = { None: 0, Low: 0, Medium: 0, High: 0 };
    bundle.predictions.forEach((p) => {
      counts[p.riskLevel] = (counts[p.riskLevel] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [bundle]);

  const histData = useMemo(() => {
    if (!dataset || !histCol) return [];
    return histogramWithBell(dataset.rows, histCol, 14);
  }, [dataset, histCol]);

  const barHistData = useMemo(() => {
    if (!dataset || !histCol) return [];
    return histogram(dataset.rows, histCol, 12);
  }, [dataset, histCol]);

  const selectedReg = bundle?.regressions[regIdx] || null;

  function handleUpload(file: File) {
    setError("");
    setProgress(0);
    setProgressLabel("Parsing CSV…");
    setRunning(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      worker: false, // keep in main thread for compat; chunked logic handles perf
      complete: (res) => {
        const rows = (res.data as Record<string, unknown>[]).filter((r) =>
          Object.values(r).some((v) => v !== null && v !== "")
        );
        if (!rows.length) {
          setError("CSV appears empty or has no valid rows.");
          setRunning(false);
          setProgressLabel("");
          return;
        }
        const columns = Object.keys(rows[0]);
        const { numericColumns, categoricalColumns } = detectColumnTypes(rows, columns);
        const ds: DatasetState = {
          name: file.name,
          rows,
          columns,
          numericColumns,
          categoricalColumns,
          rowCount: rows.length,
          savedAt: new Date().toISOString()
        };
        setDataset(ds);
        setHistCol(numericColumns[0] || "");
        setBundle(null);
        setOutput(
          `✓ Loaded "${file.name}" — ${rows.length.toLocaleString()} rows, ${columns.length} columns\n  Numeric: ${
            numericColumns.join(", ") || "(none)"
          }\n  Categorical: ${
            categoricalColumns.join(", ") || "(none)"
          }\n\nReady. Click RUN to execute full analysis + graphs (works on both numeric and categorical columns).`
        );
        setProgress(100);
        setProgressLabel("");
        setRunning(false);
      },
      error: (err) => {
        setError(err.message);
        setRunning(false);
        setProgressLabel("");
      }
    });
  }

  const runAnalysis = useCallback(async () => {
    if (!dataset) {
      setError("Upload a CSV first.");
      return;
    }
    setRunning(true);
    setError("");
    setProgress(2);
    setProgressLabel("Starting pipeline…");
    setOutput("Running full analysis pipeline…\n");

    const t0 = performance.now();

    try {
      const { rows, columns, numericColumns, categoricalColumns, name, rowCount } = dataset;
      const lines: string[] = [];

      lines.push("=".repeat(70));
      lines.push("  HEART DISEASE ANALYSIS CONSOLE");
      lines.push("=".repeat(70));
      lines.push(`Dataset   : ${name}`);
      lines.push(`Rows      : ${rowCount.toLocaleString()}`);
      lines.push(`Columns   : ${columns.join(", ")}`);
      lines.push(`Numeric   : ${numericColumns.join(", ") || "—"}`);
      lines.push(`Categorical: ${categoricalColumns.join(", ") || "—"}`);
      lines.push("");

      // ── 1. Descriptive stats (numeric) ───────────────────────────────────
      setProgressLabel("Computing descriptive statistics…");
      setProgress(8);
      await new Promise((r) => setTimeout(r, 0)); // yield

      lines.push("─".repeat(70));
      lines.push("  1. DESCRIPTIVE STATISTICS (numeric columns)");
      lines.push("─".repeat(70));
      if (!numericColumns.length) {
        lines.push("  (no numeric columns detected)");
      }
      numericColumns.forEach((col) => {
        const vals = rows.map((r) => Number(r[col])).filter(Number.isFinite);
        if (!vals.length) return;
        const m = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sorted = [...vals].sort((a, b) => a - b);
        const med =
          sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];
        const variance =
          vals.length > 1
            ? vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1)
            : 0;
        const s = Math.sqrt(variance);
        lines.push(
          `  ${col.padEnd(16)} n=${String(vals.length).padStart(4)}  mean=${m
            .toFixed(2)
            .padStart(8)}  std=${s.toFixed(2).padStart(8)}  min=${Math.min(...vals)
            .toFixed(1)
            .padStart(7)}  max=${Math.max(...vals)
            .toFixed(1)
            .padStart(7)}  med=${med.toFixed(1).padStart(7)}`
        );
      });
      lines.push("");

      // ── 1b. Categorical frequency analysis ───────────────────────────────
      setProgressLabel("Analysing categorical columns…");
      setProgress(16);
      await new Promise((r) => setTimeout(r, 0));

      lines.push("─".repeat(70));
      lines.push("  1b. CATEGORICAL FREQUENCY ANALYSIS");
      lines.push("─".repeat(70));
      const cats = analyzeCategorical(rows, categoricalColumns);
      if (!cats.length) {
        lines.push("  (no categorical / low-cardinality columns detected)");
      }
      cats.forEach((c) => {
        lines.push(
          `  ${c.column.padEnd(16)} levels=${String(c.uniqueCount).padStart(3)}  mode="${c.mode}" (${c.modePct}%)  entropy=${c.entropy.toFixed(2)}`
        );
        lines.push(`    ${c.interpretation}`);
        const top = c.frequencies
          .slice(0, 6)
          .map((f) => `${f.value}:${f.count}`)
          .join(", ");
        if (top) lines.push(`    freq → ${top}`);
      });
      lines.push("");

      // ── 2. Distribution fitting ──────────────────────────────────────────
      setProgressLabel("Fitting distributions…");
      setProgress(28);
      await new Promise((r) => setTimeout(r, 0));

      lines.push("─".repeat(70));
      lines.push("  2. DISTRIBUTION FITTING (numeric)");
      lines.push("─".repeat(70));
      const dists = chooseDistribution(rows, numericColumns);
      if (!dists.length) {
        lines.push("  (skipped — no numeric columns)");
      }
      dists.forEach((d) => {
        lines.push(
          `  ${d.column.padEnd(16)} → ${d.distribution.padEnd(14)}  skew=${d.skewness
            .toFixed(2)
            .padStart(6)}  kurt=${d.kurtosis.toFixed(2).padStart(6)}  t=${d.tStatistic
            .toFixed(2)
            .padStart(7)}  p=${d.pValue < 0.001 ? "<0.001" : d.pValue.toFixed(4)}`
        );
        lines.push(`    ${d.reason.slice(0, 90)}`);
      });
      lines.push("");

      // ── 3. Hypothesis tests ──────────────────────────────────────────────
      setProgressLabel("Running hypothesis tests…");
      setProgress(42);
      await new Promise((r) => setTimeout(r, 0));

      lines.push("─".repeat(70));
      lines.push("  3. HYPOTHESIS TESTS (one-sample t, α = 0.05)");
      lines.push("─".repeat(70));
      const tests = runStatTests(rows, numericColumns);
      if (!tests.length) {
        lines.push("  (skipped — no numeric columns)");
      }
      tests.forEach((t) => {
        const sig = t.significant ? "★ REJECT H₀" : "  fail to reject";
        lines.push(
          `  ${t.column.padEnd(16)} mean=${String(t.mean).padStart(7)}  μ₀=${String(
            t.referenceMean
          ).padStart(6)}  t=${t.tStatistic.toFixed(3).padStart(8)}  p=${
            t.pValue < 0.001 ? "<0.001" : t.pValue.toFixed(4)
          }  ${sig}`
        );
        lines.push(`    ${t.interpretation}`);
      });
      lines.push("");

      // ── 4. Regression ────────────────────────────────────────────────────
      setProgressLabel("Building regression models…");
      setProgress(58);
      await new Promise((r) => setTimeout(r, 0));

      lines.push("─".repeat(70));
      lines.push("  4. LINEAR REGRESSION (numeric + label-encoded categorical)");
      lines.push("─".repeat(70));
      let regs: RegressionResult[] = [];
      const extraCatCount = categoricalColumns.filter(
        (c) => !numericColumns.map((n) => n.toLowerCase()).includes(c.toLowerCase())
      ).length;
      if (numericColumns.length + extraCatCount >= 2) {
        regs = buildRegressions(rows, numericColumns, categoricalColumns);
        if (!regs.length) {
          lines.push("  Could not fit regression (insufficient finite pairs).");
        }
        regs.slice(0, 8).forEach((r) => {
          lines.push(`  [${r.type}] ${r.equation}`);
          lines.push(`    R² = ${r.rSquared.toFixed(4)}  |  ${r.interpretation}`);
          lines.push("");
        });
      } else {
        lines.push(
          "  Need ≥2 numeric/categorical columns for regression (categoricals are label-encoded)."
        );
      }

      // ── 5. Row-wise predictions (numeric + categorical) ──────────────────
      setProgressLabel("Scoring individual rows (numeric + categorical)…");
      setProgress(72);
      await new Promise((r) => setTimeout(r, 0));

      lines.push("─".repeat(70));
      lines.push("  5. ROW-WISE PREDICTION (numeric + categorical features)");
      lines.push("─".repeat(70));
      const targetCol = findTargetColumn(columns);
      const predRows: PredRow[] = [];

      // Chunked prediction for large datasets
      const CHUNK = 500;
      await runChunked(
        rows,
        CHUNK,
        (row, i) => {
          let pct: number;
          if (targetCol != null) {
            const base = logisticStyleProb(row);
            const actual = Number(row[targetCol]);
            // also accept string targets like "Yes"/"disease"
            const actualStr = String(row[targetCol] ?? "").trim().toLowerCase();
            const positive =
              (Number.isFinite(actual) && actual > 0) ||
              actualStr === "yes" ||
              actualStr === "1" ||
              actualStr === "true" ||
              actualStr === "disease" ||
              actualStr === "positive";
            const negative =
              (Number.isFinite(actual) && actual === 0) ||
              actualStr === "no" ||
              actualStr === "0" ||
              actualStr === "false" ||
              actualStr === "healthy" ||
              actualStr === "negative";
            if (positive) {
              pct = Math.min(100, Math.max(base, 35 + base * 0.5));
            } else if (negative) {
              pct = Math.max(0, Math.min(base, base * 0.6));
            } else {
              pct = base;
            }
          } else {
            pct = heuristicRisk(row);
          }
          pct = Math.round(pct * 10) / 10;
          predRows.push({
            index: i + 1,
            riskPct: pct,
            hasDisease: pct > 0 ? "Yes" : "No",
            riskLevel: riskLevel(pct),
            ...row
          });
        },
        (pct) => setProgress(72 + Math.round(pct * 0.15))
      );

      lines.push(
        `  Method : ${
          targetCol
            ? `target-aware logistic-style (col="${targetCol}") + categorical boost`
            : "clinical heuristic (numeric + categorical)"
        }`
      );
      lines.push(
        `  Features: ${numericColumns.length} numeric + ${categoricalColumns.length} categorical`
      );
      lines.push("");
      lines.push(
        "  #".padEnd(5) +
          "Risk%".padStart(8) +
          "  Disease".padStart(10) +
          "  Level".padStart(10)
      );
      lines.push("  " + "-".repeat(40));
      predRows.slice(0, 30).forEach((p) => {
        lines.push(
          `  ${String(p.index).padEnd(4)}${String(p.riskPct).padStart(8)}  ${p.hasDisease.padStart(
            8
          )}  ${p.riskLevel.padStart(8)}`
        );
      });
      if (predRows.length > 30) {
        lines.push(`  … ${predRows.length - 30} more rows (see table below)`);
      }
      const yes = predRows.filter((p) => p.hasDisease === "Yes").length;
      lines.push("");
      lines.push(`  SUMMARY  →  Yes: ${yes}   No: ${predRows.length - yes}`);
      lines.push("");
      const engineered = engineerFeatures(rows, categoricalColumns);
      lines.push("─".repeat(70));
      lines.push("  6. FEATURE ENGINEERING (new columns appended at the end)");
      lines.push("─".repeat(70));
      lines.push("  " + engineered.newColumns.join(", "));
      lines.push("  Sample (first 5 rows, engineered columns only):");
      engineered.rows.slice(0, 5).forEach((r, i) => {
        const bits = engineered.newColumns.slice(0, 8).map((c) => `${c}=${r[c] ?? ""}`).join("  ");
        lines.push(`  row ${i + 1}: ${bits}`);
      });
      lines.push("");
      lines.push("=".repeat(70));
      lines.push("  Analysis complete — graphs & conclusion rendered below.");
      lines.push("  PDF download includes the engineered columns at the end.");
      lines.push("=".repeat(70));

      setProgressLabel("Building conclusion…");
      setProgress(90);
      await new Promise((r) => setTimeout(r, 0));

      const conclusion = buildFullConclusion(dists, tests, regs, predRows, name, rowCount, cats);
      const durationMs = Math.round(performance.now() - t0);

      setProgress(100);
      setProgressLabel("");
      setOutput(lines.join("\n"));
      setBundle({
        distributions: dists,
        tests,
        regressions: regs,
        categorical: cats,
        predictions: predRows,
        conclusion,
        engineeredRows: engineered.rows,
        newColumns: engineered.newColumns,
        selectedHistCol: numericColumns[0] || "",
        processedAt: new Date().toLocaleString(),
        durationMs
      });
      setHistCol(numericColumns[0] || "");
      setRegIdx(0);
      setTimeout(() => outputRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 40);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setOutput(
        (prev) => prev + "\nERROR: " + (e instanceof Error ? e.message : String(e))
      );
      setProgressLabel("");
      setProgress(0);
    } finally {
      setRunning(false);
    }
  }, [dataset]);

  function clearAll() {
    setDataset(null);
    setOutput("");
    setBundle(null);
    setError("");
    setCode(DEFAULT_CODE);
    setHistCol("");
    setRegIdx(0);
    setProgress(0);
    setProgressLabel("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── PDF generation ─────────────────────────────────────────────────────────
  async function downloadPdf() {
    if (!bundle || downloading) return;
    setDownloading(true);
    setShowDlModal(false);

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
      } catch {
        return null;
      }
    }

    try {
      const orient = dlOptions.orientation;
      const size = dlOptions.paperSize;
      const pdf = new jsPDF(orient, "mm", size);
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

      // ── Header ──
      pdf.setFillColor(14, 30, 20);
      pdf.rect(0, 0, pageW, 34, "F");
      pdf.setFillColor(46, 204, 113);
      pdf.rect(0, 32, pageW, 2.5, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("Heart Disease — Analysis Console Report", margin, 13);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(140, 200, 165);
      pdf.text(
        `Generated ${bundle.processedAt}  ·  User: ${user.name} (${user.email})  ·  Analysis time: ${bundle.durationMs}ms`,
        margin,
        23
      );
      y = 44;

      // ── Dataset Summary ──
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(20, 40, 70);
      pdf.text("1. Dataset Summary", margin, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      addWrapped(
        `File: ${dataset?.name || "N/A"}  ·  Rows: ${dataset?.rowCount?.toLocaleString() || "—"}  ·  Columns: ${dataset?.columns?.length || "—"}  ·  Numeric: ${dataset?.numericColumns?.length || "—"}  ·  Categorical: ${dataset?.categoricalColumns?.length || "—"}`,
        9, [40, 50, 70]
      );
      if (dataset?.columns) {
        addWrapped(`Columns: ${dataset.columns.join(", ")}`, 8, [80, 90, 110]);
      }
      y += 3;

      // ── Text output ──
      if (dlOptions.includeText && output) {
        ensureSpace(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("2. Raw Analysis Output", margin, y);
        y += 7;
        pdf.setFont("courier", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(30, 50, 40);
        const outputLines = output.split("\n");
        for (const line of outputLines) {
          ensureSpace(5);
          const wrapped = pdf.splitTextToSize(line || " ", contentW);
          pdf.text(wrapped, margin, y);
          y += wrapped.length * 3.8;
        }
        y += 4;
      }

      // ── Statistical Tables ──
      if (dlOptions.includeTables && bundle.tests.length > 0) {
        ensureSpace(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("3. Hypothesis Test Results", margin, y);
        y += 8;

        const colXs = [margin, margin + 30, margin + 55, margin + 78, margin + 102, margin + 128, margin + 155];
        const headers = ["Variable", "Mean", "Ref μ₀", "t-stat", "p-value", "Sig?", "Decision"];
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(80, 90, 110);
        headers.forEach((h, i) => pdf.text(h, colXs[i], y));
        y += 4;
        pdf.setDrawColor(180, 200, 220);
        pdf.line(margin, y, pageW - margin, y);
        y += 4;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);

        for (const t of bundle.tests) {
          ensureSpace(7);
          pdf.setTextColor(t.significant ? 180 : 30, t.significant ? 40 : 40, t.significant ? 40 : 60);
          const row = [
            t.column.slice(0, 14),
            String(t.mean),
            String(t.referenceMean),
            t.tStatistic.toFixed(3),
            t.pValue < 0.001 ? "<0.001" : t.pValue.toFixed(4),
            t.pValue < 0.05 ? "YES*" : "no",
            t.significant ? "Reject H₀" : "Fail to reject"
          ];
          row.forEach((cell, i) => {
            if (i < colXs.length) pdf.text(cell, colXs[i], y);
          });
          y += 5;
        }
        y += 2;
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 110, 130);
        addWrapped("* Significant at α = 0.05 (two-tailed one-sample t-test vs clinical reference). Exploratory only.", 7.5, [100, 110, 130]);
      }

      // ── Distribution Table ──
      if (dlOptions.includeTables && bundle.distributions.length > 0) {
        ensureSpace(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("4. Distribution Fitting Results", margin, y);
        y += 8;

        const colXs = [margin, margin + 32, margin + 60, margin + 82, margin + 104, margin + 126];
        const headers = ["Column", "Best Fit", "Skew", "Kurtosis", "t-stat", "p-value"];
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(80, 90, 110);
        headers.forEach((h, i) => pdf.text(h, colXs[i], y));
        y += 4;
        pdf.setDrawColor(180, 200, 220);
        pdf.line(margin, y, pageW - margin, y);
        y += 4;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(30, 40, 60);

        for (const d of bundle.distributions) {
          ensureSpace(12);
          const row = [
            d.column.slice(0, 14),
            d.distribution,
            d.skewness.toFixed(2),
            d.kurtosis.toFixed(2),
            d.tStatistic.toFixed(2),
            d.pValue < 0.001 ? "<0.001" : d.pValue.toFixed(4)
          ];
          row.forEach((cell, i) => pdf.text(cell, colXs[i], y));
          y += 4;
          pdf.setTextColor(80, 100, 80);
          addWrapped(`  Suited: ${d.reason}`, 7, [60, 90, 60]);
          pdf.setTextColor(30, 40, 60);
        }
        y += 3;
      }

      // ── Regression Section ──
      if (dlOptions.includeRegression && bundle.regressions.length > 0) {
        ensureSpace(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("5. Regression Analysis", margin, y);
        y += 7;

        for (const reg of bundle.regressions.slice(0, 8)) {
          ensureSpace(16);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          pdf.setTextColor(20, 60, 40);
          pdf.text(
            `[${reg.type === "multiple" ? "MULTIPLE" : "SIMPLE"}]  R² = ${reg.rSquared}  ·  ${reg.equation}`,
            margin, y
          );
          y += 5;
          pdf.setFont("helvetica", "normal");
          addWrapped(reg.interpretation, 8, [50, 60, 70]);
        }
        y += 3;

        // Capture regression chart
        if (dlOptions.includeCharts) {
          const regImg = await captureEl(regScatterRef.current);
          if (regImg) {
            ensureSpace(75);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(10);
            pdf.setTextColor(30, 50, 40);
            pdf.text("Regression: Actual vs Predicted", margin, y);
            y += 5;
            const imgH = Math.min(65, contentW * 0.45);
            pdf.addImage(regImg, "PNG", margin, y, contentW, imgH);
            y += imgH + 8;
          }
        }
      }

      // ── Charts ──
      if (dlOptions.includeCharts && dataset) {
        ensureSpace(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("6. Data Visualizations", margin, y);
        y += 7;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 110, 120);
        pdf.text(`Selected column: ${histCol || "—"}`, margin, y);
        y += 6;

        const chartPairs: [string, React.RefObject<HTMLDivElement | null>][] = [
          ["Histogram + Normal Bell Curve", histBellRef],
          ["Bar Histogram", histBarRef],
          ["Risk Level Distribution (Bar)", riskBarRef],
          ["Risk % Distribution (Area)", riskAreaRef],
        ];

        for (const [label, ref] of chartPairs) {
          const img = await captureEl(ref.current);
          if (img) {
            ensureSpace(80);
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(10);
            pdf.setTextColor(30, 50, 40);
            pdf.text(label, margin, y);
            y += 5;
            const imgH = Math.min(68, contentW * 0.46);
            pdf.addImage(img, "PNG", margin, y, contentW, imgH);
            y += imgH + 8;
          }
        }
      }

      // ── Risk Summary Table ──
      if (dlOptions.includeTables && bundle.predictions.length > 0) {
        ensureSpace(20);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("7. Risk Prediction Summary", margin, y);
        y += 7;

        const yes = bundle.predictions.filter((p) => p.hasDisease === "Yes").length;
        const high = bundle.predictions.filter((p) => p.riskLevel === "High").length;
        const med = bundle.predictions.filter((p) => p.riskLevel === "Medium").length;
        const low = bundle.predictions.filter((p) => p.riskLevel === "Low").length;
        const none = bundle.predictions.filter((p) => p.riskLevel === "None").length;

        pdf.setFont("helvetica", "normal");
        addWrapped(
          `Total patients: ${bundle.predictions.length}  ·  Disease (Yes): ${yes}  ·  No disease: ${bundle.predictions.length - yes}`,
          9, [30, 50, 40]
        );
        addWrapped(
          `Risk bands — High: ${high}  |  Medium: ${med}  |  Low: ${low}  |  None: ${none}`,
          9, [30, 50, 40]
        );
        y += 4;

        // Sample table (first 30 rows)
        const colXs2 = [margin, margin + 14, margin + 32, margin + 55, margin + 76];
        const headers2 = ["#", "Risk%", "Disease", "Level", "Method"];
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(80, 90, 110);
        headers2.forEach((h, i) => pdf.text(h, colXs2[i], y));
        y += 4;
        pdf.setDrawColor(180, 200, 220);
        pdf.line(margin, y, pageW - margin, y);
        y += 4;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);

        for (const p of bundle.predictions.slice(0, 40)) {
          ensureSpace(6);
          const riskColor: [number, number, number] =
            p.riskLevel === "High"
              ? [180, 30, 40]
              : p.riskLevel === "Medium"
              ? [160, 110, 0]
              : p.riskLevel === "Low"
              ? [30, 140, 80]
              : [80, 90, 110];
          pdf.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
          const tgt = findTargetColumn(dataset?.columns || []);
          const row = [
            String(p.index),
            `${p.riskPct}%`,
            p.hasDisease,
            p.riskLevel,
            tgt ? "Logistic" : "Heuristic"
          ];
          row.forEach((cell, i) => {
            if (i < colXs2.length) pdf.text(cell, colXs2[i], y);
          });
          y += 4.5;
        }
        if (bundle.predictions.length > 40) {
          pdf.setTextColor(120, 130, 150);
          pdf.setFontSize(7.5);
          pdf.text(`… ${bundle.predictions.length - 40} more rows omitted for brevity.`, margin, y);
          y += 5;
        }
        y += 3;
      }

      // ── Conclusion ──
      if (dlOptions.includeConclusion) {
        ensureSpace(25);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("8. Statistical Conclusion", margin, y);
        y += 8;
        pdf.setFont("helvetica", "normal");
        for (const para of bundle.conclusion.split("\n\n")) {
          addWrapped(para, 9, [30, 40, 60]);
          y += 2;
        }
      }

      // ── Bias & variance, then feature columns last ──
      if (dataset?.rows?.length) {
        const bv = analyzeBiasVariance(dataset.rows, dataset.columns);
        if (bv) {
          ensureSpace(22);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(13);
          pdf.setTextColor(20, 40, 70);
          pdf.text("Bias and variance", margin, y);
          y += 7;
          pdf.setFont("helvetica", "normal");
          addWrapped(
            `Train acc ${(bv.trainAcc * 100).toFixed(1)}% · Test acc ${(bv.testAcc * 100).toFixed(1)}% · Gap ${(bv.gap * 100).toFixed(1)}% · Result: ${bv.result}`,
            9,
            [40, 50, 70]
          );
          addWrapped(bv.explanation, 8, [80, 90, 110]);
          addWrapped(
            `5-fold CV accuracies (%): ${bv.foldAccuracies.join(", ")} · mean ${bv.meanCv}% ± ${bv.stdCv}%`,
            8,
            [80, 90, 110]
          );
        }
      }

      if (dataset?.rows?.length) {
        const bv = analyzeBiasVariance(dataset.rows, dataset.columns);
        if (bv) {
          ensureSpace(22);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(13);
          pdf.setTextColor(20, 40, 70);
          pdf.text("Bias and variance", margin, y);
          y += 7;
          pdf.setFont("helvetica", "normal");
          addWrapped(
            `Train acc ${(bv.trainAcc * 100).toFixed(1)}% · Test acc ${(bv.testAcc * 100).toFixed(1)}% · Gap ${(bv.gap * 100).toFixed(1)}% · Result: ${bv.result}`,
            9,
            [40, 50, 70]
          );
          addWrapped(bv.explanation, 8, [80, 90, 110]);
          addWrapped(
            `5-fold CV accuracies (%): ${bv.foldAccuracies.join(", ")} · mean ${bv.meanCv}% ± ${bv.stdCv}%`,
            8,
            [80, 90, 110]
          );
        }
      }

      // ── Feature engineering columns at the end (always, matching the console pipeline) ──
      if (dataset?.rows?.length) {
        const engineered = engineerFeatures(dataset.rows, dataset.categoricalColumns || []);
        const newColumns = engineered.newColumns;
        const engRows = engineered.rows;
        ensureSpace(28);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(20, 40, 70);
        pdf.text("Feature engineering — new columns at the end", margin, y);
        y += 7;
        pdf.setFont("helvetica", "normal");
        addWrapped(
          "Original columns stay as uploaded. These derived columns are appended at the end of every row, same idea as the console cell: bmi, high_bp, high_chol, elderly, age_band, chol_per_age, bp_x_age, hr_reserve, log_chol, st_depression_flag, z_age, z_chol, z_bp, Risk_pct, Has_Disease, Risk_Level, plus categorical one-hot flags.",
          9,
          [30, 40, 60]
        );
        addWrapped("New columns: " + newColumns.join(", "), 8, [40, 60, 80]);
        y += 2;

        const chunk = 4;
        for (let start = 0; start < newColumns.length; start += chunk) {
          const showCols = newColumns.slice(start, start + chunk);
          ensureSpace(18);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          pdf.setTextColor(20, 40, 70);
          pdf.text(`Columns ${start + 1}–${start + showCols.length} of ${newColumns.length}`, margin, y);
          y += 5;
          pdf.setTextColor(80, 90, 110);
          pdf.text("#", margin, y);
          showCols.forEach((c, i) => pdf.text(String(c).slice(0, 22), margin + 12 + i * 42, y));
          y += 3.5;
          pdf.setDrawColor(180, 200, 220);
          pdf.line(margin, y, pageW - margin, y);
          y += 4;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7);
          pdf.setTextColor(30, 40, 60);
          engRows.slice(0, 20).forEach((row, i) => {
            ensureSpace(6);
            pdf.text(String(i + 1), margin, y);
            showCols.forEach((c, ci) => pdf.text(String(row[c] ?? "").slice(0, 18), margin + 12 + ci * 42, y));
            y += 4.2;
          });
          if (engRows.length > 20) {
            pdf.setTextColor(120, 130, 150);
            pdf.setFontSize(7);
            pdf.text(`… ${engRows.length - 20} more rows omitted in this column group.`, margin, y);
            y += 5;
          }
          y += 3;
        }
      }

      // ── Footer ──
      pdf.setFontSize(7);
      pdf.setTextColor(130, 140, 155);
      pdf.text(
        "Educational/research use only. Not a clinical diagnosis. Consult a qualified healthcare professional.",
        margin,
        pageH - 8
      );

      const fname = `HeartAnalysis_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fname);
    } catch (err) {
      console.error("PDF generation error:", err);
      setError("PDF generation failed. Check browser console for details.");
    } finally {
      setDownloading(false);
    }
  }

  const tooltipStyle = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12
  };

  return (
    <div className="page console-page">
      <Navbar user={user} onLogout={onLogout} theme={theme} onToggleTheme={onToggleTheme} />

      <main className="console-main">
        {/* ── Header ── */}
        <div className="console-header">
          <div className="console-title">
            <Terminal size={22} />
            <div>
              <h1>Analysis Console</h1>
              <p>Upload a CSV, run the cell, then download the PDF. The last pages list every new feature column.</p>
            </div>
          </div>
          <div className="console-actions">
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Upload CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <button
              className="btn primary"
              onClick={runAnalysis}
              disabled={running || !dataset}
            >
              <Play size={16} /> {running ? "Running…" : "Run"}
            </button>
            {bundle && (
              <button
                className="btn download-btn"
                onClick={() => setShowDlModal(true)}
                disabled={downloading}
                title="Download PDF report"
              >
                <Download size={16} /> {downloading ? "Generating…" : "Download PDF"}
              </button>
            )}
            <button className="btn ghost" onClick={clearAll} title="Clear">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* ── Dataset chip ── */}
        {dataset && (
          <div className="console-dataset-chip">
            <Database size={14} />
            <span>
              {dataset.name} · {dataset.rowCount.toLocaleString()} rows · {dataset.numericColumns.length} numeric · {dataset.categoricalColumns?.length || 0} categorical
            </span>
            {bundle && (
              <span className="chip-done">
                <CheckCircle2 size={12} /> Done in {bundle.durationMs}ms
              </span>
            )}
            <button className="icon-btn" onClick={clearAll} aria-label="Remove dataset">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Progress bar ── */}
        {running && (
          <div className="console-progress-wrap">
            <div className="console-progress-bar">
              <div className="console-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="console-progress-label">
              <Zap size={13} /> {progressLabel || "Processing…"} {progress > 0 ? `${progress}%` : ""}
            </span>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="console-error">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {/* ── Code cell ── */}
        <div className="code-cell">
          <div className="code-cell-bar">
            <span className="cell-label">[ ] Code cell</span>
            <span className="cell-hint">Upload CSV → Run → full graphs + conclusion</span>
          </div>
          <textarea
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={10}
          />
          <div className="code-cell-footer">
            <button
              className="btn primary run-inline"
              onClick={runAnalysis}
              disabled={running || !dataset}
            >
              <Play size={15} /> Run cell
            </button>
            {!dataset && <span className="muted-hint">Upload a CSV to enable Run</span>}
            {bundle && (
              <button
                className="btn download-btn run-inline"
                onClick={() => setShowDlModal(true)}
                disabled={downloading}
              >
                <Download size={14} /> Download PDF
              </button>
            )}
          </div>
        </div>

        {/* ── Text output ── */}
        <div className="console-output-wrap">
          <div className="console-output-bar">
            <Terminal size={15} />
            <span>Text output</span>
            {bundle && (
              <span className="out-badge">
                <CheckCircle2 size={13} /> {bundle.predictions.length.toLocaleString()} predictions
              </span>
            )}
          </div>
          <div className="console-output" ref={outputRef}>
            {output ? (
              <pre>{output}</pre>
            ) : (
              <div className="console-placeholder">
                <BarChart3 size={32} strokeWidth={1.5} />
                <p>
                  Upload a CSV and click <strong>Run</strong>.
                  <br />
                  Stats, graphs, regression plots and a statistical conclusion will appear here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Charts & results ── */}
        {bundle && dataset && (
          <>
            {/* Distribution graphs (numeric only) */}
            {dataset.numericColumns.length > 0 && (
            <>
            <div className="console-section-title">
              <BarChart3 size={18} /> Distribution graphs
            </div>
            <div className="console-chart-card">
              <div className="chart-toolbar">
                <label>
                  Column{" "}
                  <select value={histCol} onChange={(e) => setHistCol(e.target.value)}>
                    {dataset.numericColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                        {bundle.distributions.find((d) => d.column === c)
                          ? ` (${bundle.distributions.find((d) => d.column === c)!.distribution})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="graph-grid-2">
                <div ref={histBellRef} style={{ background: "var(--card)", padding: 8 }}>
                  <h4>Histogram + Normal (bell) overlay</h4>
                  <div style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer>
                      <ComposedChart data={histData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis dataKey="name" stroke="var(--muted)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Bar
                          dataKey="value"
                          name="Frequency"
                          fill="var(--accent)"
                          opacity={0.75}
                          radius={[3, 3, 0, 0]}
                        />
                        <Line
                          type="monotone"
                          dataKey="theoretical"
                          name="Normal fit"
                          stroke="var(--danger)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div ref={histBarRef} style={{ background: "var(--card)", padding: 8 }}>
                  <h4>Bar histogram</h4>
                  <div style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart data={barHistData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                        <XAxis dataKey="name" stroke="var(--muted)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="value" name="Count" fill="#3498db" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {dataset.numericColumns.length > 1 && (
              <div className="console-chart-card">
                <h3>All numeric columns — quick distributions</h3>
                <div className="mini-hist-grid">
                  {dataset.numericColumns.slice(0, 8).map((col) => {
                    const data = histogram(dataset.rows, col, 10);
                    const dist = bundle.distributions.find((d) => d.column === col);
                    return (
                      <div key={col} className="mini-hist">
                        <div className="mini-hist-label">
                          {col}
                          {dist && <span className="mini-dist">{dist.distribution}</span>}
                        </div>
                        <div style={{ width: "100%", height: 120 }}>
                          <ResponsiveContainer>
                            <BarChart data={data}>
                              <Bar dataKey="value" fill="var(--accent)" opacity={0.8} />
                              <XAxis dataKey="name" hide />
                              <YAxis hide />
                              <Tooltip contentStyle={tooltipStyle} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            </>
            )}

            {/* Categorical frequency charts */}
            {bundle.categorical && bundle.categorical.length > 0 && (
              <>
                <div className="console-section-title">
                  <Layers size={18} /> Categorical columns
                </div>
                <div className="console-chart-card">
                  <h3>Frequency by category (mode highlighted)</h3>
                  <div className="mini-hist-grid">
                    {bundle.categorical.slice(0, 20).map((c) => (
                      <div key={c.column} className="mini-hist">
                        <div className="mini-hist-label">
                          {c.column}
                          <span className="mini-dist">
                            mode: {c.mode} ({c.modePct}%)
                          </span>
                        </div>
                        <div style={{ width: "100%", height: 140 }}>
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
                              <Tooltip contentStyle={tooltipStyle} />
                              <Bar dataKey="value" name="Count" fill="#e74c3c" radius={[3, 3, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                          {c.uniqueCount} levels · entropy {c.entropy}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Regression graphs */}
            {bundle.regressions.length > 0 && (
              <>
                <div className="console-section-title">
                  <Activity size={18} /> Regression graphs
                </div>
                <div className="console-chart-card">
                  <div className="chart-toolbar">
                    <label>
                      Model{" "}
                      <select value={regIdx} onChange={(e) => setRegIdx(Number(e.target.value))}>
                        {bundle.regressions.map((r, i) => (
                          <option key={i} value={i}>
                            [{r.type}] {r.yColumn} ~ {r.xColumns.join(", ")} (R²=
                            {r.rSquared.toFixed(3)})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {selectedReg && (
                    <>
                      <p className="reg-eq">
                        <strong>{selectedReg.equation}</strong>
                        <span className="muted"> · R² = {selectedReg.rSquared.toFixed(4)}</span>
                      </p>
                      <p className="reg-interp">{selectedReg.interpretation}</p>
                      <div className="graph-grid-2">
                        <div ref={regScatterRef} style={{ background: "var(--card)", padding: 8 }}>
                          <h4>Actual vs Predicted</h4>
                          <div style={{ width: "100%", height: 280 }}>
                            <ResponsiveContainer>
                              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                                <XAxis
                                  type="number"
                                  dataKey="actual"
                                  name="Actual"
                                  stroke="var(--muted)"
                                  tick={{ fontSize: 11 }}
                                />
                                <YAxis
                                  type="number"
                                  dataKey="predicted"
                                  name="Predicted"
                                  stroke="var(--muted)"
                                  tick={{ fontSize: 11 }}
                                />
                                <ZAxis range={[40, 40]} />
                                <Tooltip
                                  cursor={{ strokeDasharray: "3 3" }}
                                  contentStyle={tooltipStyle}
                                />
                                <Scatter
                                  name="Points"
                                  data={selectedReg.points}
                                  fill="var(--accent)"
                                />
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div ref={regLineRef} style={{ background: "var(--card)", padding: 8 }}>
                          <h4>Actual & Predicted (line)</h4>
                          <div style={{ width: "100%", height: 280 }}>
                            <ResponsiveContainer>
                              <ComposedChart data={selectedReg.points}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                                <XAxis
                                  dataKey="name"
                                  stroke="var(--muted)"
                                  tick={{ fontSize: 10 }}
                                />
                                <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Legend />
                                <Line
                                  type="monotone"
                                  dataKey="actual"
                                  name="Actual"
                                  stroke="#3498db"
                                  strokeWidth={2}
                                  dot={{ r: 2 }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="predicted"
                                  name="Predicted"
                                  stroke="var(--danger)"
                                  strokeWidth={2}
                                  strokeDasharray="5 4"
                                  dot={false}
                                />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Risk summary */}
            <div className="console-section-title">
              <CheckCircle2 size={18} /> Risk summary
            </div>
            <div className="graph-grid-2">
              <div className="console-chart-card" ref={riskBarRef}>
                <h3>Risk level counts</h3>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={levelCounts}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                      <XAxis dataKey="name" stroke="var(--muted)" />
                      <YAxis stroke="var(--muted)" allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {levelCounts.map((entry) => {
                          const colors: Record<string, string> = {
                            None: "#27ae60",
                            Low: "#f1c40f",
                            Medium: "#e67e22",
                            High: "#e74c3c"
                          };
                          return (
                            <Cell key={entry.name} fill={colors[entry.name] || "var(--accent)"} />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="console-chart-card" ref={riskAreaRef}>
                <h3>Risk % distribution</h3>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <AreaChart
                      data={(() => {
                        const bins = 10;
                        const counts = Array(bins).fill(0);
                        bundle.predictions.forEach((p) => {
                          const idx = Math.min(bins - 1, Math.floor(p.riskPct / 10));
                          counts[idx]++;
                        });
                        return counts.map((v, i) => ({
                          name: `${i * 10}–${i * 10 + 10}%`,
                          value: v
                        }));
                      })()}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" />
                      <XAxis dataKey="name" stroke="var(--muted)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="var(--muted)" allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="var(--danger)"
                        fill="color-mix(in srgb, var(--danger) 30%, transparent)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Statistical conclusion */}
            <div className="console-section-title">
              <FileText size={18} /> Statistical conclusion
            </div>
            <div className="console-conclusion-card">
              <div className="conclusion-meta">
                <span>α = 0.05 · two-tailed t-tests · distribution scoring · linear least squares</span>
              </div>
              {bundle.conclusion.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}

              {bundle.tests.length > 0 && (
                <div className="conclusion-table-wrap">
                  <h4>Hypothesis test details (H₀: μ = μ₀ clinical reference)</h4>
                  <table className="console-table">
                    <thead>
                      <tr>
                        <th>Variable</th>
                        <th>Mean</th>
                        <th>μ₀ (ref)</th>
                        <th>t</th>
                        <th>p-value</th>
                        <th>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.tests.map((t) => (
                        <tr key={t.column}>
                          <td>{t.column}</td>
                          <td>{t.mean}</td>
                          <td>{t.referenceMean}</td>
                          <td>{t.tStatistic}</td>
                          <td>{t.pValue < 0.001 ? "<0.001" : t.pValue.toFixed(4)}</td>
                          <td>
                            <span className={t.significant ? "tag danger" : "tag success"}>
                              {t.significant ? "Reject H₀" : "Fail to reject"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {bundle.distributions.length > 0 && (
                <div className="conclusion-table-wrap">
                  <h4>Chosen distributions</h4>
                  <table className="console-table">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Best fit</th>
                        <th>Skew</th>
                        <th>Kurtosis</th>
                        <th>t</th>
                        <th>p</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.distributions.map((d) => (
                        <tr key={d.column}>
                          <td>{d.column}</td>
                          <td>
                            <span className="tag level-low">{d.distribution}</span>
                          </td>
                          <td>{d.skewness.toFixed(2)}</td>
                          <td>{d.kurtosis.toFixed(2)}</td>
                          <td>{d.tStatistic.toFixed(2)}</td>
                          <td>{d.pValue < 0.001 ? "<0.001" : d.pValue.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {bundle.categorical && bundle.categorical.length > 0 && (
                <div className="conclusion-table-wrap">
                  <h4>Categorical columns (all detected)</h4>
                  <table className="console-table">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Levels</th>
                        <th>Mode</th>
                        <th>Mode %</th>
                        <th>Entropy</th>
                        <th>Top frequencies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bundle.categorical.map((c) => (
                        <tr key={c.column}>
                          <td>{c.column}</td>
                          <td>{c.uniqueCount}</td>
                          <td>{c.mode}</td>
                          <td>{c.modePct}%</td>
                          <td>{c.entropy}</td>
                          <td>
                            {c.frequencies
                              .slice(0, 5)
                              .map((f) => `${f.value}:${f.count}`)
                              .join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Per-person predictions table */}
            <div className="console-table-card">
              <div className="table-card-head">
                <h3>
                  Per-person predictions{" "}
                  <span className="muted">
                    (showing {Math.min(50, bundle.predictions.length)} of{" "}
                    {bundle.predictions.length.toLocaleString()})
                  </span>
                </h3>
                <div className="table-stats-row">
                  <span className="tstat-chip tstat-yes">
                    Yes: {bundle.predictions.filter((p) => p.hasDisease === "Yes").length.toLocaleString()}
                  </span>
                  <span className="tstat-chip tstat-no">
                    No: {bundle.predictions.filter((p) => p.hasDisease === "No").length.toLocaleString()}
                  </span>
                  <span className="tstat-chip tstat-high">
                    High: {bundle.predictions.filter((p) => p.riskLevel === "High").length.toLocaleString()}
                  </span>
                  <span className="tstat-chip tstat-med">
                    Medium: {bundle.predictions.filter((p) => p.riskLevel === "Medium").length.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="table-scroll">
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Risk %</th>
                      <th>Disease</th>
                      <th>Level</th>
                      {dataset.numericColumns.slice(0, 6).map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.predictions.slice(0, 50).map((p) => (
                      <tr key={p.index}>
                        <td>{p.index}</td>
                        <td>
                          <div className="risk-pct-cell">
                            <div
                              className="risk-pct-bar"
                              style={{
                                width: `${p.riskPct}%`,
                                background:
                                  p.riskLevel === "High"
                                    ? "var(--danger)"
                                    : p.riskLevel === "Medium"
                                    ? "#e67e22"
                                    : p.riskLevel === "Low"
                                    ? "var(--warning)"
                                    : "var(--success)"
                              }}
                            />
                            <span>{p.riskPct}%</span>
                          </div>
                        </td>
                        <td>
                          <span className={p.hasDisease === "Yes" ? "tag danger" : "tag success"}>
                            {p.hasDisease}
                          </span>
                        </td>
                        <td>
                          <span className={`tag level-${p.riskLevel.toLowerCase()}`}>
                            {p.riskLevel}
                          </span>
                        </td>
                        {dataset.numericColumns.slice(0, 6).map((c) => {
                          const v = Number(p[c]);
                          return (
                            <td key={c}>{Number.isFinite(v) ? v.toFixed(1) : "—"}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Download Modal ─────────────────────────────────────────────────── */}
      {showDlModal && (
        <div className="modal-backdrop" onClick={() => setShowDlModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">
                <Settings2 size={18} />
                <span>PDF Export Options</span>
              </div>
              <button className="modal-close" onClick={() => setShowDlModal(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-desc">
                Choose what to include in your PDF report. All charts and text output from the current analysis session will be captured.
              </p>

              <div className="modal-section-label">Content</div>
              <div className="modal-checks">
                {(
                  [
                    ["includeText", "Raw text output (analysis log)"],
                    ["includeCharts", "All graphs & charts (captured as images)"],
                    ["includeRegression", "Regression analysis & charts"],
                    ["includeTables", "Statistical tables (hypothesis tests, distributions, predictions)"],
                    ["includeConclusion", "Full statistical conclusion"]
                  ] as [keyof DownloadOptions, string][]
                ).map(([key, label]) => (
                  <label key={key} className="modal-check-row">
                    <input
                      type="checkbox"
                      checked={dlOptions[key] as boolean}
                      onChange={(e) =>
                        setDlOptions((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div className="modal-row-2">
                <div>
                  <div className="modal-section-label">Paper size</div>
                  <div className="modal-radio-row">
                    {(["a4", "letter"] as const).map((s) => (
                      <label key={s} className="modal-radio">
                        <input
                          type="radio"
                          name="paperSize"
                          value={s}
                          checked={dlOptions.paperSize === s}
                          onChange={() => setDlOptions((prev) => ({ ...prev, paperSize: s }))}
                        />
                        {s.toUpperCase()}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="modal-section-label">Orientation</div>
                  <div className="modal-radio-row">
                    {(["portrait", "landscape"] as const).map((o) => (
                      <label key={o} className="modal-radio">
                        <input
                          type="radio"
                          name="orientation"
                          value={o}
                          checked={dlOptions.orientation === o}
                          onChange={() => setDlOptions((prev) => ({ ...prev, orientation: o }))}
                        />
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-info">
                <Layers size={14} />
                <span>
                  Charts are captured as high-res PNG images from the live DOM.
                  For best results, ensure all charts are fully rendered before downloading.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn ghost" onClick={() => setShowDlModal(false)}>
                Cancel
              </button>
              <button
                className="btn download-btn"
                onClick={downloadPdf}
                disabled={downloading}
              >
                <Download size={15} /> {downloading ? "Generating PDF…" : "Generate & Download"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
