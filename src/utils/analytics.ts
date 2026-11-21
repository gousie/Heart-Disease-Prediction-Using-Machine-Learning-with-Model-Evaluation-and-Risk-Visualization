import type {
  CategoricalResult,
  ChartPoint,
  DistName,
  DistributionResult,
  RegressionResult,
  StatTestResult
} from "../types";

function valuesFor(rows: Record<string, unknown>[], column: string): number[] {
  return rows
    .map((r) => Number(r[column]))
    .filter((v) => Number.isFinite(v));
}

function mean(a: number[]): number {
  if (!a.length) return 0;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

function sd(a: number[], m: number): number {
  if (a.length < 2) return 0;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

function skewness(a: number[], m: number, s: number): number {
  if (!s || a.length < 3) return 0;
  const n = a.length;
  return a.reduce((sum, v) => sum + ((v - m) / s) ** 3, 0) / n;
}

function kurtosis(a: number[], m: number, s: number): number {
  if (!s || a.length < 4) return 0;
  const n = a.length;
  return a.reduce((sum, v) => sum + ((v - m) / s) ** 4, 0) / n - 3;
}

function cv(a: number[], m: number, s: number): number {
  return Math.abs(m) > 1e-9 ? s / Math.abs(m) : 999;
}

function isBinary01(a: number[]): boolean {
  if (!a.length) return false;
  const set = new Set(a.map((v) => Math.round(v * 1e9) / 1e9));
  return set.size <= 2 && [...set].every((v) => v === 0 || v === 1);
}

function isNonNegInteger(a: number[]): boolean {
  return a.length > 0 && a.every((v) => v >= 0 && Math.abs(v - Math.round(v)) < 1e-6);
}

function isBoundedInteger(a: number[], maxN = 30): boolean {
  if (!isNonNegInteger(a)) return false;
  const mx = Math.max(...a);
  return mx <= maxN && mx >= 1;
}

/** Approximate two-tailed p-value from t-statistic. */
export function tToPValue(t: number, df: number): number {
  if (!Number.isFinite(t) || df < 1) return 1;
  const x = Math.abs(t);
  if (df > 30) {
    const z = x;
    const a1 = 0.254829592,
      a2 = -0.284496736,
      a3 = 1.421413741,
      a4 = -1.453152027,
      a5 = 1.061405429,
      p = 0.3275911;
    const tAbs = 1 / (1 + p * z);
    const y =
      1 -
      (((((a5 * tAbs + a4) * tAbs + a3) * tAbs + a2) * tAbs + a1) * tAbs) *
        Math.exp((-z * z) / 2);
    return Math.max(1e-12, Math.min(1, 2 * (1 - y)));
  }
  const xx = df / (df + x * x);
  const a = df / 2;
  const b = 0.5;
  const bt = Math.exp(
    lgamma(a + b) -
      lgamma(a) -
      lgamma(b) +
      a * Math.log(Math.max(xx, 1e-12)) +
      b * Math.log(Math.max(1 - xx, 1e-12))
  );
  let betainc = 0;
  if (xx < (a + 1) / (a + b + 2)) {
    betainc = (bt * betacf(xx, a, b)) / a;
  } else {
    betainc = 1 - (bt * betacf(1 - xx, b, a)) / b;
  }
  return Math.max(1e-12, Math.min(1, betainc));
}

function lgamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.984369654078691e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(x: number, a: number, b: number): number {
  const maxIt = 100;
  const eps = 3e-7;
  const fpmin = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIt; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

const CLINICAL_REFS: Record<string, { mean: number; label: string }> = {
  age: { mean: 55, label: "typical cohort age" },
  trestbps: { mean: 120, label: "normal resting BP" },
  restingbp: { mean: 120, label: "normal resting BP" },
  chol: { mean: 200, label: "desirable cholesterol" },
  cholesterol: { mean: 200, label: "desirable cholesterol" },
  thalach: { mean: 150, label: "typical max heart rate" },
  heartrate: { mean: 75, label: "resting heart rate" },
  fbs: { mean: 100, label: "normal fasting glucose" },
  bloodsugar: { mean: 100, label: "normal fasting glucose" },
  oldpeak: { mean: 1.0, label: "typical ST depression" }
};

function findRef(column: string): { mean: number; label: string } | null {
  const key = column.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(CLINICAL_REFS)) {
    const kk = k.replace(/_/g, "");
    if (key.includes(kk) || kk.includes(key)) return v;
  }
  return null;
}

export function oneSampleTTest(
  rows: Record<string, unknown>[],
  column: string,
  mu0?: number
): StatTestResult {
  const a = valuesFor(rows, column);
  const n = a.length;
  if (n < 2) {
    return {
      column,
      tStatistic: 0,
      pValue: 1,
      df: 0,
      mean: 0,
      referenceMean: mu0 ?? 0,
      significant: false,
      interpretation: "Insufficient observations for a t-test."
    };
  }
  const m = mean(a);
  const s = sd(a, m) || 1e-9;
  const ref = findRef(column);
  const referenceMean = mu0 ?? ref?.mean ?? m;
  const se = s / Math.sqrt(n);
  const tStat = (m - referenceMean) / se;
  const df = n - 1;
  const p = tToPValue(tStat, df);
  const significant = p < 0.05;
  const direction = m > referenceMean ? "higher" : "lower";
  const interp = significant
    ? `Mean (${m.toFixed(2)}) is significantly ${direction} than reference ${referenceMean} (t=${tStat.toFixed(3)}, p=${p < 0.001 ? "<0.001" : p.toFixed(4)}). ${ref ? `Ref: ${ref.label}.` : ""}`
    : `No significant difference from reference ${referenceMean} (t=${tStat.toFixed(3)}, p=${p.toFixed(4)}). ${ref ? `Ref: ${ref.label}.` : ""}`;

  return {
    column,
    tStatistic: Number(tStat.toFixed(4)),
    pValue: Number(p.toFixed(6)),
    df,
    mean: Number(m.toFixed(3)),
    referenceMean,
    significant,
    interpretation: interp
  };
}

export function runStatTests(
  rows: Record<string, unknown>[],
  columns: string[]
): StatTestResult[] {
  return columns.slice(0, 12).map((c) => oneSampleTTest(rows, c));
}

/**
 * Full distribution selector: Normal/Gaussian, Uniform, Exponential,
 * Skewed L/R, Binomial, Bernoulli, Poisson.
 */
export function chooseDistribution(
  rows: Record<string, unknown>[],
  columns: string[]
): DistributionResult[] {
  return columns.map((column) => {
    const a = valuesFor(rows, column);
    if (!a.length) {
      return {
        column,
        distribution: "Normal",
        score: 0,
        reason: "Not enough numeric observations.",
        mean: 0,
        sd: 0,
        skewness: 0,
        kurtosis: 0,
        min: 0,
        max: 0,
        tStatistic: 0,
        pValue: 1,
        median: 0,
        count: 0,
        altReasons: []
      };
    }

    const m = mean(a);
    const s = sd(a, m);
    const sk = skewness(a, m, s);
    const kurt = kurtosis(a, m, s);
    const variation = cv(a, m, s);
    const minV = Math.min(...a);
    const maxV = Math.max(...a);
    const positive = a.every((v) => v >= 0);
    const sorted = [...a].sort((x, y) => x - y);
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    const test = oneSampleTTest(rows, column);
    const binary = isBinary01(a);
    const nonNegInt = isNonNegInteger(a);
    const boundedInt = isBoundedInteger(a);

    // Score candidates (lower = better fit)
    const normalScore =
      Math.min(1.5, Math.abs(sk) * 0.7) + Math.min(1, Math.abs(kurt) * 0.25);
    const uniformScore =
      Math.min(1.2, Math.abs(variation - 0.577)) + Math.min(0.8, Math.abs(kurt + 1.2) * 0.3);
    const expScore = positive
      ? Math.min(1.2, Math.abs(variation - 1)) + Math.min(0.8, Math.abs(sk - 2) * 0.2)
      : 3;
    const skewRightScore = sk > 0.85 ? Math.min(1, Math.abs(sk) - 0.5) : 2.5;
    const skewLeftScore = sk < -0.85 ? Math.min(1, Math.abs(sk) - 0.5) : 2.5;

    // Bernoulli: only 0/1 values
    const bernoulliScore = binary ? 0.05 : 3;
    // Binomial: non-neg integers with small range (like trial counts)
    const binomScore =
      boundedInt && !binary
        ? Math.min(1.2, Math.abs(variation - Math.sqrt(Math.max(m * (1 - m / Math.max(maxV, 1)), 0.01)) / Math.max(m, 0.01)))
        : 3;
    // Poisson: non-neg integers, variance ≈ mean
    const variance = s * s;
    const poissonScore =
      nonNegInt && !binary
        ? Math.min(1.5, Math.abs(variance - m) / Math.max(m, 1)) + Math.min(0.8, Math.abs(sk - 1 / Math.sqrt(Math.max(m, 0.5))) * 0.5)
        : 3;

    type Cand = { d: DistName; score: number; why: string; whyNot: string };
    const allScores: Cand[] = [
      {
        d: "Normal",
        score: normalScore,
        why: `Low |skew| (${sk.toFixed(2)}) and excess kurtosis (${kurt.toFixed(2)}) support a symmetric Gaussian/Normal shape.`,
        whyNot: `Rejected: |skew|=${Math.abs(sk).toFixed(2)} or kurtosis=${kurt.toFixed(2)} deviate from Normal targets.`
      },
      {
        d: "Gaussian",
        score: normalScore + 0.001, // alias of Normal, slightly behind so Normal wins ties
        why: `Same as Normal — Gaussian is the continuous bell-curve model (mean ${m.toFixed(2)}, SD ${s.toFixed(2)}).`,
        whyNot: `Rejected in favor of a better-fitting discrete or skewed model for this column.`
      },
      {
        d: "Uniform",
        score: uniformScore,
        why: `CV (${variation.toFixed(2)}) near ~0.58 and flat kurtosis suggest relatively even spread across [${minV.toFixed(1)}, ${maxV.toFixed(1)}].`,
        whyNot: `Rejected: CV=${variation.toFixed(2)} (Uniform prefers ~0.58) or kurtosis=${kurt.toFixed(2)}.`
      },
      {
        d: "Exponential",
        score: expScore,
        why: `Non-negative values with CV≈${variation.toFixed(2)} (near 1) and positive skew match Exponential waiting-time shape.`,
        whyNot: positive
          ? `Rejected: CV=${variation.toFixed(2)} or skew=${sk.toFixed(2)} not close to Exponential (CV≈1, skew≈2).`
          : `Rejected: negative values present — Exponential needs non-negative support.`
      },
      {
        d: "Skewed Right",
        score: skewRightScore,
        why: `Positive skewness (${sk.toFixed(2)}) → longer right tail (common for BP, cholesterol, glucose).`,
        whyNot: `Rejected: skewness=${sk.toFixed(2)} is not strongly positive (>0.85).`
      },
      {
        d: "Skewed Left",
        score: skewLeftScore,
        why: `Negative skewness (${sk.toFixed(2)}) → longer left tail.`,
        whyNot: `Rejected: skewness=${sk.toFixed(2)} is not strongly negative (<-0.85).`
      },
      {
        d: "Bernoulli",
        score: bernoulliScore,
        why: `Values are binary {0,1} only — classic Bernoulli trial (success/failure) distribution.`,
        whyNot: binary
          ? `Viable, but another model scored slightly better.`
          : `Rejected: not strictly binary 0/1 data.`
      },
      {
        d: "Binomial",
        score: binomScore,
        why: `Non-negative integers with bounded range (max ${maxV}) resemble binomial trial counts.`,
        whyNot: boundedInt && !binary
          ? `Viable, but variance/mean pattern favored another discrete model.`
          : `Rejected: not integer counts in a small trial range (or is pure binary → Bernoulli).`
      },
      {
        d: "Poisson",
        score: poissonScore,
        why: `Non-negative integers with variance (${variance.toFixed(2)}) ≈ mean (${m.toFixed(2)}) — Poisson count process.`,
        whyNot: nonNegInt && !binary
          ? `Rejected: |variance − mean| is large relative to mean (Poisson needs Var ≈ μ).`
          : `Rejected: not non-negative integer counts (or binary → Bernoulli).`
      }
    ];

    // Prefer discrete models strongly when data is clearly discrete
    let ranked = [...allScores].sort((x, y) => x.score - y.score);
    if (binary) {
      ranked = ranked.filter((x) => x.d === "Bernoulli" || x.d === "Binomial" || x.d === "Normal");
    } else if (Math.abs(sk) > 0.85) {
      // Keep skew labels competitive
      ranked = ranked;
    }

    const best = ranked[0];
    const distribution = best.d;
    const score = best.score;
    const reason = best.why;

    const altReasons = allScores
      .filter((x) => x.d !== distribution)
      .sort((x, y) => x.score - y.score)
      .map((x) => `${x.d}: ${x.whyNot}`);

    return {
      column,
      distribution,
      score: Number(score.toFixed(3)),
      reason,
      mean: Number(m.toFixed(3)),
      sd: Number(s.toFixed(3)),
      skewness: Number(sk.toFixed(3)),
      kurtosis: Number(kurt.toFixed(3)),
      min: Number(minV.toFixed(3)),
      max: Number(maxV.toFixed(3)),
      tStatistic: test.tStatistic,
      pValue: test.pValue,
      median: Number(median.toFixed(3)),
      count: a.length,
      altReasons
    };
  });
}

export function numericSummary(
  rows: Record<string, unknown>[],
  column: string
): { min: number; max: number; mean: number; sd: number; count: number; median: number } {
  const a = valuesFor(rows, column).sort((x, y) => x - y);
  if (!a.length) return { min: 0, max: 0, mean: 0, sd: 0, count: 0, median: 0 };
  const m = mean(a);
  const median =
    a.length % 2 === 0
      ? (a[a.length / 2 - 1] + a[a.length / 2]) / 2
      : a[Math.floor(a.length / 2)];
  return {
    min: Math.min(...a),
    max: Math.max(...a),
    mean: m,
    sd: sd(a, m),
    count: a.length,
    median
  };
}

export function histogram(
  rows: Record<string, unknown>[],
  column: string,
  bins = 12
): ChartPoint[] {
  const a = valuesFor(rows, column);
  if (!a.length) return [];
  const min = Math.min(...a);
  const max = Math.max(...a);
  const width = (max - min || 1) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  a.forEach((v) => {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[idx]++;
  });
  return counts.map((count, i) => {
    const left = min + i * width;
    const mid = left + width / 2;
    return { name: mid.toFixed(1), value: count, density: count / (a.length * width) };
  });
}

export function normalDensityCurve(
  rows: Record<string, unknown>[],
  column: string,
  points = 40
): ChartPoint[] {
  const a = valuesFor(rows, column);
  if (a.length < 2) return [];
  const m = mean(a);
  const s = sd(a, m) || 1;
  const min = Math.min(...a);
  const max = Math.max(...a);
  const pad = (max - min) * 0.15 || s;
  const from = min - pad;
  const to = max + pad;
  const step = (to - from) / (points - 1);
  const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI);
  return Array.from({ length: points }, (_, i) => {
    const x = from + i * step;
    const z = (x - m) / s;
    const density = (invSqrt2Pi / s) * Math.exp(-0.5 * z * z);
    return { name: x.toFixed(1), value: density, theoretical: density, density };
  });
}

export function histogramWithBell(
  rows: Record<string, unknown>[],
  column: string,
  bins = 14
): ChartPoint[] {
  const hist = histogram(rows, column, bins);
  if (!hist.length) return [];
  const a = valuesFor(rows, column);
  const m = mean(a);
  const s = sd(a, m) || 1;
  const min = Math.min(...a);
  const max = Math.max(...a);
  const width = (max - min || 1) / bins;
  const n = a.length;
  const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI);
  return hist.map((h) => {
    const x = Number(h.name);
    const z = (x - m) / s;
    const density = (invSqrt2Pi / s) * Math.exp(-0.5 * z * z);
    return {
      ...h,
      theoretical: Number((density * n * width).toFixed(2)),
      density: Number(density.toFixed(5))
    };
  });
}

export function sortedSeries(
  rows: Record<string, unknown>[],
  column: string,
  maxPoints = 60
): ChartPoint[] {
  const a = valuesFor(rows, column).sort((x, y) => x - y);
  if (!a.length) return [];
  if (a.length <= maxPoints) {
    return a.map((v, i) => ({ name: String(i + 1), value: Number(v.toFixed(2)) }));
  }
  const step = Math.ceil(a.length / maxPoints);
  const out: ChartPoint[] = [];
  for (let i = 0; i < a.length; i += step) {
    out.push({ name: String(i + 1), value: Number(a[i].toFixed(2)) });
  }
  return out;
}

/** Simple linear regression: y ~ x  (least squares). */
export function simpleLinearRegression(
  rows: Record<string, unknown>[],
  xCol: string,
  yCol: string,
  maxPoints = 80
): RegressionResult | null {
  const pairs: { x: number; y: number }[] = [];
  for (const r of rows) {
    const x = Number(r[xCol]);
    const y = Number(r[yCol]);
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push({ x, y });
  }
  if (pairs.length < 3) return null;

  const n = pairs.length;
  const mx = mean(pairs.map((p) => p.x));
  const my = mean(pairs.map((p) => p.y));
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (const p of pairs) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  if (sxx < 1e-12) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssRes = pairs.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const rSquared = syy > 0 ? Math.max(0, 1 - ssRes / syy) : 0;

  const sorted = [...pairs].sort((a, b) => a.x - b.x);
  const step = Math.max(1, Math.ceil(sorted.length / maxPoints));
  const points = [];
  for (let i = 0; i < sorted.length; i += step) {
    const p = sorted[i];
    points.push({
      name: p.x.toFixed(1),
      x: p.x,
      actual: Number(p.y.toFixed(3)),
      predicted: Number((intercept + slope * p.x).toFixed(3))
    });
  }

  const sign = slope >= 0 ? "+" : "−";
  const equation = `${yCol} = ${intercept.toFixed(3)} ${sign} ${Math.abs(slope).toFixed(3)}·${xCol}`;
  const interpretation =
    rSquared >= 0.5
      ? `Strong linear association (R²=${rSquared.toFixed(3)}). Slope ${slope.toFixed(3)} means a 1-unit rise in ${xCol} predicts a ${slope.toFixed(3)} change in ${yCol}.`
      : rSquared >= 0.2
        ? `Moderate linear association (R²=${rSquared.toFixed(3)}). Residual scatter remains large — clinical interpretation needs caution.`
        : `Weak linear association (R²=${rSquared.toFixed(3)}). ${xCol} alone explains little of ${yCol} variance.`;

  return {
    type: "simple",
    yColumn: yCol,
    xColumns: [xCol],
    intercept: Number(intercept.toFixed(4)),
    coefficients: [Number(slope.toFixed(4))],
    rSquared: Number(rSquared.toFixed(4)),
    points,
    equation,
    interpretation
  };
}

/** Multiple linear regression via normal equations (Gaussian elimination). */
export function multipleLinearRegression(
  rows: Record<string, unknown>[],
  yCol: string,
  xCols: string[],
  maxPoints = 60
): RegressionResult | null {
  if (xCols.length < 2) return null;
  const data: number[][] = [];
  const ys: number[] = [];
  for (const r of rows) {
    const y = Number(r[yCol]);
    if (!Number.isFinite(y)) continue;
    const xs: number[] = [];
    let ok = true;
    for (const c of xCols) {
      const v = Number(r[c]);
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      xs.push(v);
    }
    if (ok) {
      data.push(xs);
      ys.push(y);
    }
  }
  const n = data.length;
  const k = xCols.length;
  if (n < k + 2) return null;

  // Design matrix X: n × (k+1) with leading 1s
  const X: number[][] = data.map((row) => [1, ...row]);
  // Solve (X'X) β = X'y
  const p = k + 1;
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * ys[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }

  // Gaussian elimination with partial pivoting
  const A = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];
    const div = A[col][col];
    if (Math.abs(div) < 1e-12) return null;
    for (let j = col; j <= p; j++) A[col][j] /= div;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let j = col; j <= p; j++) A[r][j] -= f * A[col][j];
    }
  }
  const beta = A.map((row) => row[p]);
  const intercept = beta[0];
  const coefficients = beta.slice(1);

  const yMean = mean(ys);
  let ssTot = 0,
    ssRes = 0;
  const preds: number[] = [];
  for (let i = 0; i < n; i++) {
    let yhat = intercept;
    for (let j = 0; j < k; j++) yhat += coefficients[j] * data[i][j];
    preds.push(yhat);
    ssTot += (ys[i] - yMean) ** 2;
    ssRes += (ys[i] - yhat) ** 2;
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  const step = Math.max(1, Math.ceil(n / maxPoints));
  const points = [];
  for (let i = 0; i < n; i += step) {
    points.push({
      name: String(i + 1),
      actual: Number(ys[i].toFixed(3)),
      predicted: Number(preds[i].toFixed(3))
    });
  }

  const terms = coefficients
    .map((c, i) => `${c >= 0 ? "+" : "−"} ${Math.abs(c).toFixed(3)}·${xCols[i]}`)
    .join(" ");
  const equation = `${yCol} = ${intercept.toFixed(3)} ${terms}`;
  const interpretation =
    rSquared >= 0.5
      ? `Multiple regression explains ${(rSquared * 100).toFixed(1)}% of ${yCol} variance (R²=${rSquared.toFixed(3)}) using ${xCols.join(", ")}.`
      : `Multiple regression R²=${rSquared.toFixed(3)} — predictors jointly explain limited variance in ${yCol}.`;

  return {
    type: "multiple",
    yColumn: yCol,
    xColumns: xCols,
    intercept: Number(intercept.toFixed(4)),
    coefficients: coefficients.map((c) => Number(c.toFixed(4))),
    rSquared: Number(rSquared.toFixed(4)),
    points,
    equation,
    interpretation
  };
}

/**
 * Label-encode categorical columns into numeric features so they can enter
 * linear regression. Binary cats → 0/1; multi-level → rank by frequency (0..k-1).
 * Skips columns already present in numericColumns under the same name.
 */
export function encodeCategoricalsAsNumeric(
  rows: Record<string, unknown>[],
  categoricalColumns: string[],
  existingNumeric: string[] = []
): { rows: Record<string, unknown>[]; encodedColumns: string[] } {
  const existing = new Set(existingNumeric.map((c) => c.toLowerCase()));
  const encodedColumns: string[] = [];
  const levelMaps: Record<string, Map<string, number>> = {};

  for (const col of categoricalColumns) {
    if (existing.has(col.toLowerCase())) continue; // already usable as numeric
    const vals = rows
      .map((r) => r[col])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
      .map((v) => String(v).trim());
    if (!vals.length) continue;

    const freq = new Map<string, number>();
    for (const v of vals) freq.set(v, (freq.get(v) || 0) + 1);
    // Most frequent → 0, next → 1, … (stable ordering by count then alpha)
    const ordered = [...freq.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    // Cap levels to avoid explosion
    if (ordered.length > 20) continue;
    const map = new Map<string, number>();
    ordered.forEach(([v], i) => map.set(v, i));
    levelMaps[col] = map;
    encodedColumns.push(col);
  }

  if (!encodedColumns.length) {
    return { rows, encodedColumns: [] };
  }

  const outRows = rows.map((r) => {
    const copy: Record<string, unknown> = { ...r };
    for (const col of encodedColumns) {
      const map = levelMaps[col];
      const raw = r[col];
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        copy[col] = 0;
      } else {
        const key = String(raw).trim();
        copy[col] = map.has(key) ? map.get(key)! : 0;
      }
    }
    return copy;
  });

  return { rows: outRows, encodedColumns };
}

/** Build simple regressions for each pair (first numeric as X vs others as Y) and one multi model.
 *  Optional categoricalColumns are label-encoded and included as predictors.
 */
export function buildRegressions(
  rows: Record<string, unknown>[],
  columns: string[],
  categoricalColumns: string[] = []
): RegressionResult[] {
  // Merge encoded categoricals into the numeric working set
  const { rows: workRows, encodedColumns } = encodeCategoricalsAsNumeric(
    rows,
    categoricalColumns,
    columns
  );
  const allCols = [...columns];
  for (const c of encodedColumns) {
    if (!allCols.includes(c)) allCols.push(c);
  }

  if (allCols.length < 2) return [];
  const out: RegressionResult[] = [];
  // Prefer age / common clinical as predictors when present
  const preferredX = ["age", "trestbps", "chol", "thalach", "oldpeak", "restingbp", "cholesterol"];
  let x0 = allCols[0];
  for (const p of preferredX) {
    const hit = allCols.find((c) => c.toLowerCase().includes(p));
    if (hit) {
      x0 = hit;
      break;
    }
  }
  // Simple: x0 vs each other column (up to 6)
  let simpleCount = 0;
  for (const y of allCols) {
    if (y === x0) continue;
    const reg = simpleLinearRegression(workRows, x0, y);
    if (reg) {
      // Tag equation when y or x was encoded categorical
      if (encodedColumns.includes(y) || encodedColumns.includes(x0)) {
        reg.interpretation =
          (reg.interpretation || "") +
          ` (includes label-encoded categorical: ${[x0, y].filter((c) => encodedColumns.includes(c)).join(", ")}).`;
      }
      out.push(reg);
      simpleCount++;
    }
    if (simpleCount >= 6) break;
  }
  // Also a few more pairs among top columns
  for (let i = 0; i < Math.min(4, allCols.length); i++) {
    for (let j = i + 1; j < Math.min(5, allCols.length); j++) {
      if (out.length >= 10) break;
      const reg = simpleLinearRegression(workRows, allCols[i], allCols[j]);
      if (reg && !out.some((r) => r.equation === reg.equation)) {
        if (encodedColumns.includes(allCols[i]) || encodedColumns.includes(allCols[j])) {
          reg.interpretation =
            (reg.interpretation || "") +
            ` (includes label-encoded categorical).`;
        }
        out.push(reg);
      }
    }
  }
  // Multiple: first 3–4 predictors → last or preferred y
  const yMulti =
    allCols.find((c) => /target|disease|output|num|heart/i.test(c)) ||
    allCols[allCols.length - 1];
  // Prefer mixing numeric + categorical predictors
  const xMulti = allCols.filter((c) => c !== yMulti).slice(0, 5);
  if (xMulti.length >= 2) {
    const multi = multipleLinearRegression(workRows, yMulti, xMulti);
    if (multi) {
      const usedCats = xMulti.filter((c) => encodedColumns.includes(c));
      if (usedCats.length) {
        multi.interpretation =
          (multi.interpretation || "") +
          ` Categorical predictors (label-encoded): ${usedCats.join(", ")}.`;
      }
      out.push(multi);
    }
  }
  return out;
}

export function buildConclusion(opts: {
  prediction: { riskLevel: string; riskScore: number; result: string } | null;
  distributions: DistributionResult[];
  form: {
    age: number;
    restingBp: number;
    cholesterol: number;
    bloodSugar: number;
    smoking: string;
    chestPain: string;
  };
  aiFindings: string[];
}): string {
  const parts: string[] = [];
  if (opts.prediction) {
    parts.push(
      `Overall estimated cardiovascular risk is ${opts.prediction.riskLevel} (${opts.prediction.riskScore}/100). ${opts.prediction.result}`
    );
  } else {
    parts.push(
      "No formal risk prediction has been run yet; complete the health form to generate a score."
    );
  }

  const significant = opts.distributions.filter((d) => d.pValue < 0.05);
  if (significant.length) {
    parts.push(
      `Statistical tests flag ${significant.length} variable(s) with mean significantly different from clinical reference (p<0.05): ${significant
        .slice(0, 4)
        .map(
          (d) =>
            `${d.column} (t=${d.tStatistic}, p=${d.pValue < 0.001 ? "<0.001" : d.pValue.toFixed(3)})`
        )
        .join("; ")}.`
    );
  }

  const distSummary = opts.distributions
    .slice(0, 5)
    .map((d) => `${d.column}→${d.distribution}`)
    .join(", ");
  if (distSummary) {
    parts.push(`Distribution fits (sample): ${distSummary}.`);
  }

  const factors: string[] = [];
  if (opts.form.age >= 55) factors.push("age ≥55");
  if (opts.form.restingBp >= 140) factors.push("elevated BP");
  if (opts.form.cholesterol >= 240) factors.push("high cholesterol");
  if (opts.form.bloodSugar >= 126) factors.push("elevated glucose");
  if (opts.form.smoking === "Yes") factors.push("smoking");
  if (opts.form.chestPain === "Yes") factors.push("chest pain");
  if (factors.length) {
    parts.push(`Form-based risk contributors noted: ${factors.join(", ")}.`);
  }

  if (opts.aiFindings.length) {
    parts.push(`AI report scan highlights: ${opts.aiFindings.slice(0, 2).join(" ")}`);
  }

  parts.push(
    "This summary is educational only and does not constitute a medical diagnosis. Please consult a qualified clinician for interpretation and care decisions."
  );
  return parts.join(" ");
}

// ── Column type detection (numeric vs categorical) ──────────────────────────

/** Max unique values for a numeric-coded column to also be treated as categorical. */
const CATEGORICAL_CARDINALITY = 12;

/**
 * Classify columns into numeric (continuous / high-cardinality) and categorical
 * (strings, booleans, or low-cardinality numeric codes such as sex 0/1, cp 0–3).
 * Both kinds are returned so downstream analysis and prediction can use them.
 */
export function detectColumnTypes(
  rows: Record<string, unknown>[],
  columns: string[]
): { numericColumns: string[]; categoricalColumns: string[] } {
  const numericColumns: string[] = [];
  const categoricalColumns: string[] = [];

  for (const col of columns) {
    const raw = rows
      .map((r) => r[col])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
    if (!raw.length) continue;

    const asNum = raw.map((v) => Number(v)).filter(Number.isFinite);
    const numericRatio = asNum.length / raw.length;
    const unique = new Set(raw.map((v) => String(v).trim().toLowerCase()));
    const uniqueCount = unique.size;
    const allIntegers =
      asNum.length > 0 &&
      asNum.every((v) => Math.abs(v - Math.round(v)) < 1e-9);
    // Many unique values relative to sample size → continuous, not a code
    const highRelativeCardinality = uniqueCount / raw.length > 0.45 && uniqueCount > 4;
    // Codes like sex/cp/fbs typically have ≤12 distinct integer levels
    const looksLikeCode =
      uniqueCount <= CATEGORICAL_CARDINALITY &&
      !highRelativeCardinality &&
      (allIntegers || uniqueCount <= 6);

    const isMostlyNumeric = numericRatio >= 0.5;

    if (isMostlyNumeric && !looksLikeCode) {
      numericColumns.push(col);
    } else if (isMostlyNumeric && looksLikeCode) {
      // Numeric-coded categorical (sex, cp, fbs, exang, target…) — both pipelines
      numericColumns.push(col);
      categoricalColumns.push(col);
    } else {
      // Pure string / mixed categorical
      categoricalColumns.push(col);
    }
  }

  return { numericColumns, categoricalColumns };
}

function shannonEntropy(counts: number[], total: number): number {
  if (total <= 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Frequency / mode analysis for categorical (or low-cardinality) columns.
 */
export function analyzeCategorical(
  rows: Record<string, unknown>[],
  columns: string[]
): CategoricalResult[] {
  return columns.map((column) => {
    const vals = rows
      .map((r) => r[column])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
      .map((v) => String(v).trim());
    const total = vals.length;
    if (!total) {
      return {
        column,
        uniqueCount: 0,
        mode: "—",
        modeCount: 0,
        modePct: 0,
        total: 0,
        frequencies: [],
        entropy: 0,
        interpretation: "No non-empty values."
      };
    }

    const map = new Map<string, number>();
    for (const v of vals) map.set(v, (map.get(v) || 0) + 1);
    const frequencies = [...map.entries()]
      .map(([value, count]) => ({
        value,
        count,
        pct: Math.round((count / total) * 1000) / 10
      }))
      .sort((a, b) => b.count - a.count);

    const mode = frequencies[0];
    const entropy = shannonEntropy(
      frequencies.map((f) => f.count),
      total
    );
    const uniqueCount = frequencies.length;
    const interpretation =
      uniqueCount === 1
        ? `Constant column — all ${total} values are "${mode.value}".`
        : uniqueCount === 2
          ? `Binary categorical. Mode "${mode.value}" (${mode.pct}%). Entropy ${entropy.toFixed(2)} bits.`
          : `${uniqueCount} levels. Mode "${mode.value}" (${mode.pct}%). Entropy ${entropy.toFixed(2)} bits (higher = more uniform).`;

    return {
      column,
      uniqueCount,
      mode: mode.value,
      modeCount: mode.count,
      modePct: mode.pct,
      total,
      frequencies: frequencies.slice(0, 20),
      entropy: Number(entropy.toFixed(4)),
      interpretation
    };
  });
}

/**
 * Read a categorical / coded value from a row by trying several key aliases.
 * Returns a normalised lowercase string, or null if missing.
 */
export function catValue(
  row: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const k of keys) {
    // exact key
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return String(row[k]).trim().toLowerCase();
    }
    // case-insensitive key match
    const found = Object.keys(row).find(
      (rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, "")
    );
    if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== "") {
      return String(row[found]).trim().toLowerCase();
    }
  }
  return null;
}

/**
 * Contribute risk points from common heart-disease categorical fields
 * (works for both string labels and numeric codes).
 */
export function categoricalRiskBoost(row: Record<string, unknown>): number {
  let boost = 0;

  const sex = catValue(row, ["sex", "gender", "Sex", "Gender"]);
  if (sex === "1" || sex === "m" || sex === "male") boost += 5;

  const smoking = catValue(row, [
    "smoking", "smoker", "smoke", "current_smoker", "Smoking"
  ]);
  if (
    smoking === "yes" ||
    smoking === "1" ||
    smoking === "true" ||
    smoking === "y" ||
    smoking === "current"
  )
    boost += 12;

  const alcohol = catValue(row, ["alcohol", "drinking", "Alcohol"]);
  if (alcohol === "yes" || alcohol === "1" || alcohol === "true" || alcohol === "y")
    boost += 5;

  // Chest pain type: UCI/Statlog often 1–4 (4 = asymptomatic = highest risk)
  const cp = catValue(row, [
    "cp", "chestpain", "chest_pain", "chestpaintype", "ChestPainType", "chestPain", "chest pain type"
  ]);
  if (cp != null) {
    if (cp === "4" || /asymptomatic|asy/i.test(cp)) boost += 12;
    else if (cp === "3" || /non.?anginal/i.test(cp)) boost += 8;
    else if (cp === "2" || /atypical/i.test(cp)) boost += 6;
    else if (cp === "1" || cp === "yes" || /typical/i.test(cp)) boost += 4;
  }

  const exang = catValue(row, [
    "exang", "exerciseangina", "ExerciseAngina", "exercise angina", "exercise_angina"
  ]);
  if (exang === "1" || exang === "yes" || exang === "y" || exang === "true")
    boost += 12;

  // Fasting blood sugar (fbs, fasting blood sugar, ...)
  const fbs = catValue(row, [
    "fbs", "fastingbs", "FastingBS", "fastingbloodsugar", "bloodsugar", "fasting blood sugar"
  ]);
  if (fbs === "1" || fbs === "yes" || fbs === "true") boost += 10;

  const thal = catValue(row, ["thal", "thalassemia", "Thal"]);
  if (thal === "1" || thal === "3" || thal === "6" || thal === "7" ||
      (thal != null && /defect|reversible|fixed/i.test(thal)))
    boost += 8;

  // ST slope (ST slope, slope, stslope) — 2/3 or flat/down = higher risk
  const slope = catValue(row, ["slope", "ST_Slope", "stslope", "st slope", "ST slope"]);
  if (slope === "2" || slope === "3" || (slope != null && /flat|down/i.test(slope)))
    boost += 10;
  else if (slope === "1" || (slope != null && /up/i.test(slope)))
    boost += 2;

  const ca = catValue(row, ["ca", "vessels", "numvessels"]);
  if (ca != null) {
    const n = Number(ca);
    if (Number.isFinite(n) && n >= 1) boost += Math.min(15, n * 5);
  }

  return boost;
}

// ─── Data cleaning ───────────────────────────────────────────────────────────

export interface CleanReport {
  originalRows: number;
  cleanedRows: number;
  removedRows: number;
  columnsTouched: string[];
  steps: string[];
  rows: Record<string, unknown>[];
  columns: string[];
  numericColumns: string[];
  categoricalColumns: string[];
}

/**
 * Clean a tabular dataset: trim strings, coerce numerics, drop empty rows,
 * impute numeric medians / categorical mode, drop duplicate rows.
 */
export function cleanDataset(
  rows: Record<string, unknown>[],
  columns: string[]
): CleanReport {
  const steps: string[] = [];
  const columnsTouched = new Set<string>();
  const originalRows = rows.length;

  // 1. Normalize cell values
  let working = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of columns) {
      let v = r[c];
      if (typeof v === "string") {
        const t = v.trim();
        if (t === "" || t.toLowerCase() === "nan" || t.toLowerCase() === "null" || t === "?") {
          v = null;
          columnsTouched.add(c);
        } else {
          v = t;
        }
      }
      out[c] = v;
    }
    return out;
  });
  steps.push("Trimmed strings and replaced empty / NA / ? tokens with null.");

  // 2. Coerce mostly-numeric columns
  for (const c of columns) {
    const nonNull = working.map((r) => r[c]).filter((v) => v != null && v !== "");
    if (!nonNull.length) continue;
    const numericCount = nonNull.filter((v) => {
      const n = Number(v);
      return Number.isFinite(n);
    }).length;
    if (numericCount / nonNull.length >= 0.85) {
      working = working.map((r) => {
        if (r[c] == null || r[c] === "") return r;
        const n = Number(r[c]);
        if (Number.isFinite(n)) {
          columnsTouched.add(c);
          return { ...r, [c]: n };
        }
        return { ...r, [c]: null };
      });
    }
  }
  steps.push("Coerced columns that are ≥85% numeric to numbers.");

  // 3. Drop fully-empty rows
  const beforeEmpty = working.length;
  working = working.filter((r) =>
    columns.some((c) => r[c] != null && String(r[c]).trim() !== "")
  );
  if (beforeEmpty !== working.length) {
    steps.push(`Removed ${beforeEmpty - working.length} fully empty rows.`);
  }

  // 4. Detect types after coercion
  const { numericColumns, categoricalColumns } = detectColumnTypes(working, columns);

  // 5. Impute numeric medians
  for (const c of numericColumns) {
    const vals = working.map((r) => Number(r[c])).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!vals.length) continue;
    const med = vals[Math.floor(vals.length / 2)];
    let filled = 0;
    working = working.map((r) => {
      if (r[c] == null || !Number.isFinite(Number(r[c]))) {
        filled++;
        columnsTouched.add(c);
        return { ...r, [c]: med };
      }
      return r;
    });
    if (filled) steps.push(`Imputed ${filled} missing values in “${c}” with median ${med}.`);
  }

  // 6. Impute categorical mode
  for (const c of categoricalColumns) {
    const counts = new Map<string, number>();
    for (const r of working) {
      const v = r[c];
      if (v == null || String(v).trim() === "") continue;
      const s = String(v);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    if (!counts.size) continue;
    let mode = "";
    let best = -1;
    counts.forEach((n, k) => {
      if (n > best) {
        best = n;
        mode = k;
      }
    });
    let filled = 0;
    working = working.map((r) => {
      if (r[c] == null || String(r[c]).trim() === "") {
        filled++;
        columnsTouched.add(c);
        return { ...r, [c]: mode };
      }
      return r;
    });
    if (filled) steps.push(`Imputed ${filled} missing values in “${c}” with mode “${mode}”.`);
  }

  // 7. Drop duplicate rows
  const beforeDup = working.length;
  const seen = new Set<string>();
  working = working.filter((r) => {
    const key = columns.map((c) => String(r[c] ?? "")).join("\u0001");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (beforeDup !== working.length) {
    steps.push(`Removed ${beforeDup - working.length} duplicate rows.`);
  }

  if (!steps.length) steps.push("Dataset already clean — no changes required.");

  return {
    originalRows,
    cleanedRows: working.length,
    removedRows: originalRows - working.length,
    columnsTouched: Array.from(columnsTouched),
    steps,
    rows: working,
    columns,
    numericColumns,
    categoricalColumns
  };
}

// ─── Bias / Variance (advanced hold-out + learning curve + complexity) ───────

export interface BiasVarianceResult {
  trainAcc: number;
  testAcc: number;
  trainLoss: number;
  testLoss: number;
  gap: number;
  result: "HIGH BIAS" | "HIGH VARIANCE" | "MODERATE VARIANCE" | "BALANCED";
  explanation: string;
  recommendation: string;
  chart: { name: string; accuracy: number; loss: number }[];
  foldAccuracies: number[];
  meanCv: number;
  stdCv: number;
  /** Learning curve: accuracy vs training size fraction */
  learningCurve: { frac: number; trainAcc: number; testAcc: number; gap: number }[];
  /** Model complexity curve: cutoff sensitivity / regularization proxy */
  complexityCurve: { complexity: number; trainAcc: number; testAcc: number; label: string }[];
  estimatedBias: number;
  estimatedVariance: number;
  irreducibleNoise: number;
  optimalCutoff: number;
  targetUsed: boolean;
  sampleSize: number;
}

function rowRiskProxy(row: Record<string, unknown>): number {
  let score = 0;
  // Flexible numeric lookup: matches "resting bp s" → restingbps, "max heart rate" → maxheartrate, etc.
  const num = (keys: string[]) => {
    const normalized = keys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
    for (const rk of Object.keys(row)) {
      const key = rk.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalized.includes(key) || normalized.some((n) => n.length >= 3 && (key.includes(n) || n.includes(key)))) {
        const v = Number(row[rk]);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  };

  // Age
  const age = num(["age"]);
  if (age != null) {
    if (age >= 65) score += 25;
    else if (age >= 55) score += 15;
    else if (age >= 45) score += 8;
  }

  // Resting blood pressure (trestbps, resting bp s, restingbp, bp, ...)
  const bp = num(["trestbps", "restingbps", "restingbp", "restingbloodpressure", "bp"]);
  if (bp != null && bp > 0) {
    if (bp >= 140) score += 20;
    else if (bp >= 130) score += 12;
    else if (bp >= 120) score += 5;
  }

  // Cholesterol
  const chol = num(["chol", "cholesterol"]);
  if (chol != null && chol > 0) {
    if (chol >= 240) score += 20;
    else if (chol >= 200) score += 10;
  }

  // Max heart rate (thalach, max heart rate, maxhr, ...)
  const hr = num(["thalach", "maxheartrate", "maxhr", "heartrate", "maxheart"]);
  if (hr != null) {
    if (hr < 120) score += 15;
    else if (hr < 140) score += 8;
  }

  // Oldpeak (ST depression) — strong clinical signal
  const op = num(["oldpeak", "stdepression"]);
  if (op != null) {
    if (op >= 2) score += 15;
    else if (op >= 1) score += 8;
  }

  score += categoricalRiskBoost(row);
  return Math.min(100, score);
}

function detectTargetColumn(columns: string[]): string | null {
  const names = new Set([
    "target", "num", "disease", "heartdisease", "outcome", "class", "hd", "heart", "label", "diagnosis"
  ]);
  for (const c of columns) {
    const key = c.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (names.has(key)) return c;
  }
  return null;
}

function toBinary(val: unknown): 0 | 1 | null {
  if (val == null) return null;
  if (typeof val === "number") return val > 0 ? 1 : 0;
  const s = String(val).trim().toLowerCase();
  if (["1", "yes", "y", "true", "present", "presence", "positive", "disease", "heart disease", "sick", "abnormal"].includes(s))
    return 1;
  if (["0", "no", "n", "false", "absent", "absence", "negative", "none", "no disease", "healthy", "normal"].includes(s))
    return 0;
  const n = Number(s);
  if (Number.isFinite(n)) return n > 0 ? 1 : 0;
  return null;
}

function makeRng(seed0: number) {
  let seed = seed0 >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

function shuffleIdx(n: number, rnd: () => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function accuracyAt(
  risks: number[],
  labels: number[],
  ids: number[],
  cut: number
): number {
  if (!ids.length) return 0;
  let c = 0;
  for (const i of ids) {
    const p = risks[i] >= cut ? 1 : 0;
    if (p === labels[i]) c++;
  }
  return c / ids.length;
}

function brierLoss(
  risks: number[],
  labels: number[],
  ids: number[]
): number {
  if (!ids.length) return 1;
  let s = 0;
  for (const i of ids) {
    const prob = Math.min(1, Math.max(0, risks[i] / 100));
    s += (prob - labels[i]) ** 2;
  }
  return s / ids.length;
}

function bestCutoff(
  risks: number[],
  labels: number[],
  ids: number[]
): { cut: number; acc: number } {
  let bestCut = 50;
  let bestAcc = 0;
  for (let cut = 15; cut <= 85; cut += 2.5) {
    const a = accuracyAt(risks, labels, ids, cut);
    if (a > bestAcc) {
      bestAcc = a;
      bestCut = cut;
    }
  }
  return { cut: bestCut, acc: bestAcc };
}

/**
 * Advanced bias/variance analysis:
 * - train/test accuracy + Brier loss
 * - 5-fold CV
 * - learning curve (train size 20%→100%)
 * - complexity curve (cutoff sensitivity as capacity proxy)
 * - bias² / variance / noise decomposition estimate
 */
export function analyzeBiasVariance(
  rows: Record<string, unknown>[],
  columns: string[]
): BiasVarianceResult | null {
  if (rows.length < 20) return null;

  const targetCol = detectTargetColumn(columns);
  const risks: number[] = [];
  const labels: number[] = [];
  let targetUsed = false;

  for (const r of rows) {
    const risk = rowRiskProxy(r);
    risks.push(risk);
    let y: number | null = null;
    if (targetCol) {
      y = toBinary(r[targetCol]);
      if (y != null) targetUsed = true;
    }
    if (y == null) y = risk >= 50 ? 1 : 0;
    labels.push(y);
  }

  const rnd = makeRng(rows.length * 17 + 42);
  const idx = shuffleIdx(rows.length, rnd);
  const split = Math.floor(idx.length * 0.8);
  const trainIdx = idx.slice(0, split);
  const testIdx = idx.slice(split);

  const { cut: optimalCutoff, acc: trainAcc } = bestCutoff(risks, labels, trainIdx);
  const testAcc = accuracyAt(risks, labels, testIdx, optimalCutoff);
  const trainLoss = brierLoss(risks, labels, trainIdx);
  const testLoss = brierLoss(risks, labels, testIdx);
  const gap = trainAcc - testAcc;

  // 5-fold CV
  const foldAccuracies: number[] = [];
  const foldSize = Math.floor(idx.length / 5) || 1;
  for (let f = 0; f < 5; f++) {
    const start = f * foldSize;
    const end = f === 4 ? idx.length : start + foldSize;
    const testF = idx.slice(start, end);
    const trainF = idx.slice(0, start).concat(idx.slice(end));
    const { cut } = bestCutoff(risks, labels, trainF);
    foldAccuracies.push(+(accuracyAt(risks, labels, testF, cut) * 100).toFixed(2));
  }
  const meanCv = mean(foldAccuracies);
  const stdCv = sd(foldAccuracies, meanCv);

  // Learning curve
  const learningCurve: BiasVarianceResult["learningCurve"] = [];
  for (const frac of [0.2, 0.35, 0.5, 0.65, 0.8, 1]) {
    const nTrain = Math.max(8, Math.floor(trainIdx.length * frac));
    const sub = trainIdx.slice(0, nTrain);
    const { cut, acc: tr } = bestCutoff(risks, labels, sub);
    const te = accuracyAt(risks, labels, testIdx, cut);
    learningCurve.push({
      frac: Math.round(frac * 100),
      trainAcc: +(tr * 100).toFixed(2),
      testAcc: +(te * 100).toFixed(2),
      gap: +((tr - te) * 100).toFixed(2)
    });
  }

  // Complexity curve: lower cut = more aggressive positive predictions (higher capacity-ish)
  const complexityCurve: BiasVarianceResult["complexityCurve"] = [];
  const cuts = [25, 35, 45, 50, 55, 65, 75];
  cuts.forEach((cut, i) => {
    complexityCurve.push({
      complexity: i + 1,
      trainAcc: +(accuracyAt(risks, labels, trainIdx, cut) * 100).toFixed(2),
      testAcc: +(accuracyAt(risks, labels, testIdx, cut) * 100).toFixed(2),
      label: `cut ${cut}`
    });
  });

  // Bias-variance-noise style decomposition using CV fold spread + train/test gap
  // estimatedBias ≈ how far mean CV is from ideal 1.0 (underfitting)
  // estimatedVariance ≈ fold std + max(0, gap)
  // irreducibleNoise ≈ residual test loss floor
  const estimatedBias = +Math.max(0, 1 - meanCv / 100).toFixed(4);
  const estimatedVariance = +Math.max(0, stdCv / 100 + Math.max(0, gap)).toFixed(4);
  const irreducibleNoise = +Math.min(0.5, testLoss * 0.5).toFixed(4);

  // Decision rule aligned with the Python analysis notebook so results stay consistent
  // across datasets and between notebook ↔ dashboard:
  //   HIGH BIAS        → both train & test accuracy < 75% (underfitting)
  //   HIGH VARIANCE    → train−test gap > 10% (overfitting)
  //   MODERATE VARIANCE→ gap > 5%
  //   BALANCED         → otherwise (close train/test, reasonable accuracy)
  let result: BiasVarianceResult["result"];
  let explanation: string;
  let recommendation: string;
  if (trainAcc < 0.75 && testAcc < 0.75) {
    result = "HIGH BIAS";
    explanation =
      "Both training and testing accuracy stay below 75% — the model is underfitting (high bias).";
    recommendation =
      "Add stronger predictive features, check column name mapping, or enrich the clinical risk score.";
  } else if (gap > 0.10) {
    result = "HIGH VARIANCE";
    explanation =
      "Train–test gap exceeds 10% — the model may be overfitting training patterns.";
    recommendation =
      "Use more training data, simpler decision rule, or stronger regularization.";
  } else if (gap > 0.05) {
    result = "MODERATE VARIANCE";
    explanation =
      "A moderate gap appears between training and hold-out performance; generalization is acceptable but not tight.";
    recommendation =
      "Prefer the CV-mean cutoff and re-evaluate after collecting more data.";
  } else {
    result = "BALANCED";
    explanation =
      "Training and testing performance are close and CV folds are stable — bias and variance are well traded off.";
    recommendation =
      "Keep the current feature set and decision rule; re-check after new data arrives.";
  }

  return {
    trainAcc,
    testAcc,
    trainLoss: +trainLoss.toFixed(4),
    testLoss: +testLoss.toFixed(4),
    gap,
    result,
    explanation,
    recommendation,
    chart: [
      { name: "Training", accuracy: +(trainAcc * 100).toFixed(2), loss: +(trainLoss * 100).toFixed(2) },
      { name: "Testing", accuracy: +(testAcc * 100).toFixed(2), loss: +(testLoss * 100).toFixed(2) }
    ],
    foldAccuracies,
    meanCv: +meanCv.toFixed(2),
    stdCv: +stdCv.toFixed(2),
    learningCurve,
    complexityCurve,
    estimatedBias,
    estimatedVariance,
    irreducibleNoise,
    optimalCutoff: +optimalCutoff.toFixed(1),
    targetUsed,
    sampleSize: rows.length
  };
}

// ─── Feature engineering (mirrors Python pipeline extras) ────────────────────

export interface EngineeredRow extends Record<string, unknown> {
  Risk_pct: number;
  Has_Disease: "Yes" | "No";
  Risk_Level: "None" | "Low" | "Medium" | "High";
}

export function engineerFeatures(
  rows: Record<string, unknown>[],
  categoricalColumns: string[]
): { rows: EngineeredRow[]; newColumns: string[] } {
  // One-hot style flags for top categorical levels (drop_first-ish: skip mode)
  const dummyCols: string[] = [];
  const levelMaps: { col: string; levels: string[] }[] = [];

  for (const c of categoricalColumns.slice(0, 8)) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = r[c];
      if (v == null) continue;
      const s = String(v);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    // skip most frequent (drop_first)
    const levels = sorted.slice(1, 4).map(([k]) => k);
    if (!levels.length) continue;
    levelMaps.push({ col: c, levels });
    for (const lv of levels) {
      dummyCols.push(`${c}__${lv}`.replace(/\s+/g, "_"));
    }
  }

  const numOf = (row: Record<string, unknown>, aliases: string[]): number | null => {
    for (const k of aliases) {
      const found = Object.keys(row).find(
        (rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase().replace(/[^a-z0-9]/g, "")
      );
      if (found != null) {
        const v = Number(row[found]);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  };

  const ageVals = rows.map((r) => numOf(r, ["age"])).filter((v): v is number => v != null);
  const cholVals = rows.map((r) => numOf(r, ["chol", "cholesterol"])).filter((v): v is number => v != null);
  const bpVals = rows.map((r) => numOf(r, ["trestbps", "restingbp", "bp"])).filter((v): v is number => v != null);
  const meanSd = (a: number[]) => {
    if (!a.length) return { m: 0, s: 0 };
    const m = a.reduce((s, v) => s + v, 0) / a.length;
    const s = Math.sqrt(a.reduce((acc, v) => acc + (v - m) ** 2, 0) / a.length);
    return { m, s };
  };
  const ageStat = meanSd(ageVals);
  const cholStat = meanSd(cholVals);
  const bpStat = meanSd(bpVals);

  const out: EngineeredRow[] = rows.map((r) => {
    const risk = Math.round(rowRiskProxy(r) * 10) / 10;
    const level: EngineeredRow["Risk_Level"] =
      risk <= 0 ? "None" : risk <= 30 ? "Low" : risk <= 60 ? "Medium" : "High";
    const age = numOf(r, ["age"]);
    const chol = numOf(r, ["chol", "cholesterol"]);
    const bp = numOf(r, ["trestbps", "restingbp", "bp"]);
    const hr = numOf(r, ["thalach", "maxhr", "heartrate"]);
    const wt = numOf(r, ["weight", "wt"]);
    const ht = numOf(r, ["height", "ht"]);
    const oldpeak = numOf(r, ["oldpeak"]);
    let bmi: number | "" = "";
    if (wt != null && ht != null && ht > 0) {
      const meters = ht > 3 ? ht / 100 : ht;
      bmi = Math.round((wt / (meters * meters)) * 100) / 100;
    }
    const base: EngineeredRow = {
      ...r,
      Risk_pct: risk,
      Has_Disease: risk >= 50 ? "Yes" : "No",
      Risk_Level: level,
      bmi,
      high_bp: bp == null ? "" : bp >= 140 ? 1 : 0,
      high_chol: chol == null ? "" : chol >= 240 ? 1 : 0,
      elderly: age == null ? "" : age >= 60 ? 1 : 0,
      age_band: age == null ? "" : age <= 40 ? "<=40" : age <= 55 ? "41-55" : age <= 70 ? "56-70" : "70+",
      chol_per_age: chol != null && age ? Math.round((chol / age) * 1000) / 1000 : "",
      bp_x_age: bp != null && age != null ? Math.round((bp * age) / 100 * 100) / 100 : "",
      hr_reserve: hr != null && age != null && 220 - age > 0 ? Math.round((hr / (220 - age)) * 1000) / 1000 : "",
      log_chol: chol != null && chol >= 0 ? Math.round(Math.log1p(chol) * 1000) / 1000 : "",
      st_depression_flag: oldpeak == null ? "" : oldpeak >= 1 ? 1 : 0,
      z_age: age != null && ageStat.s ? Math.round(((age - ageStat.m) / ageStat.s) * 1000) / 1000 : "",
      z_chol: chol != null && cholStat.s ? Math.round(((chol - cholStat.m) / cholStat.s) * 1000) / 1000 : "",
      z_bp: bp != null && bpStat.s ? Math.round(((bp - bpStat.m) / bpStat.s) * 1000) / 1000 : ""
    };
    for (const { col, levels } of levelMaps) {
      const val = r[col] == null ? "" : String(r[col]);
      for (const lv of levels) {
        const key = `${col}__${lv}`.replace(/\s+/g, "_");
        (base as Record<string, unknown>)[key] = val === lv ? 1 : 0;
      }
    }
    return base;
  });

  const derived = [
    "bmi", "high_bp", "high_chol", "elderly", "age_band", "chol_per_age", "bp_x_age",
    "hr_reserve", "log_chol", "st_depression_flag", "z_age", "z_chol", "z_bp"
  ];
  const newColumns = ["Risk_pct", "Has_Disease", "Risk_Level", ...derived, ...dummyCols];
  return { rows: out, newColumns };
}
