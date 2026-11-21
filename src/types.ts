export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Patient {
  id?: number;
  name: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
  restingBp: number;
  cholesterol: number;
  heartRate: number;
  bloodSugar: number;
  smoking: string;
  alcohol: string;
  chestPain: string;
}

export interface Prediction {
  id?: number;
  patientId: number;
  riskScore: number;
  riskLevel: string;
  result: string;
  createdAt: string;
}

export interface DatasetState {
  name: string;
  rows: Record<string, unknown>[];
  columns: string[];
  numericColumns: string[];
  /** Non-numeric or low-cardinality columns suitable for frequency / mode analysis */
  categoricalColumns: string[];
  rowCount: number;
  savedAt?: string;
  savedLocally?: boolean;
}

export interface CategoricalResult {
  column: string;
  uniqueCount: number;
  mode: string;
  modeCount: number;
  modePct: number;
  total: number;
  frequencies: { value: string; count: number; pct: number }[];
  entropy: number;
  interpretation: string;
}

export type DistName =
  | "Normal"
  | "Gaussian"
  | "Uniform"
  | "Exponential"
  | "Skewed Right"
  | "Skewed Left"
  | "Binomial"
  | "Bernoulli"
  | "Poisson";

export interface DistributionResult {
  column: string;
  distribution: DistName;
  score: number;
  reason: string;
  mean: number;
  sd: number;
  skewness: number;
  kurtosis: number;
  min: number;
  max: number;
  tStatistic: number;
  pValue: number;
  median: number;
  count: number;
  /** Why other distributions were rejected for this column */
  altReasons: string[];
}

export interface RegressionResult {
  type: "simple" | "multiple";
  yColumn: string;
  xColumns: string[];
  /** Intercept */
  intercept: number;
  /** Coefficients matching xColumns */
  coefficients: number[];
  rSquared: number;
  /** Predicted points for plotting: { x, y, yHat } for simple; index-based for multiple */
  points: { name: string; actual: number; predicted: number; x?: number }[];
  equation: string;
  interpretation: string;
}

export interface StatTestResult {
  column: string;
  tStatistic: number;
  pValue: number;
  df: number;
  mean: number;
  referenceMean: number;
  significant: boolean;
  interpretation: string;
}

export interface ChartPoint {
  name: string;
  value: number;
  density?: number;
  theoretical?: number;
}

export interface ImageFeatures {
  brightness: number;
  contrast: number;
  entropy: number;
  edgeDensity: number;
  redDominance: number;
  greenDominance: number;
  blueDominance: number;
  aspectRatio: number;
  width: number;
  height: number;
  fingerprint: string;
  docType: "ECG" | "Lab Report" | "Discharge Summary" | "Imaging" | "Photo of Paper" | "Unknown";
}

export interface ReportAnalysis {
  id: string;
  fileName: string;
  previewUrl: string;
  status: "analyzing" | "done" | "error";
  findings: string[];
  suggestedCondition: string;
  confidence: number;
  recommendations: string[];
  analyzedAt: string;
  imageFeatures?: ImageFeatures;
  extractedSignals?: string[];
}

export type ChartType = "bar" | "line" | "area" | "bell" | "regression";
export type ThemeMode = "green" | "dark";
