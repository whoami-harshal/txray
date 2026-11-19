export type Tone = "good" | "warn" | "bad" | "neutral";

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-foreground",
};

/** CSS variables, so charts follow the light/dark theme. */
export const CHART_COLORS = {
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  muted: "var(--muted-foreground)",
};

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return `${n.toFixed(digits)}%`;
}

export function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export function ms(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`;
}

export function sol(lamports: number | null | undefined, digits = 4): string {
  if (lamports === null || lamports === undefined) return "–";
  return `${(lamports / 1e9).toFixed(digits)} SOL`;
}

export function int(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return Math.round(n).toLocaleString("en-US");
}

export function shortSig(sig: string): string {
  return `${sig.slice(0, 6)}…${sig.slice(-4)}`;
}

/** Landing rate: ≥95 good, ≥85 warning, else bad. */
export function landingTone(rate: number | null): Tone {
  if (rate === null) return "neutral";
  return rate >= 95 ? "good" : rate >= 85 ? "warn" : "bad";
}

/** Failure-type shares: ≤2 good, ≤8 warning, else bad. */
export function failureTone(rate: number | null): Tone {
  if (rate === null) return "neutral";
  return rate <= 2 ? "good" : rate <= 8 ? "warn" : "bad";
}

/** Round a suggested CU limit up to the next 1,000. */
export function suggestCuLimit(p95Consumed: number | null): number | null {
  if (!p95Consumed) return null;
  // Round first: 100000 * 1.1 is 110000.00000000001 in floating point.
  return Math.min(1_400_000, Math.ceil(Math.round(p95Consumed * 1.1) / 1000) * 1000);
}
