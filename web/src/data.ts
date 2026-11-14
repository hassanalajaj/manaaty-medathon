import patientsJson from "./data/patients.json";
import metricsJson from "./data/metrics.json";
import evidenceJson from "./data/evidence.json";

export type Lang = "ar" | "en";
export type Level = "low" | "medium" | "high";
export type Vital = "Temp" | "HR" | "O2Sat" | "Resp";
export const VITALS: Vital[] = ["Temp", "HR", "O2Sat", "Resp"];
export const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };

export interface Reason { feature: string; ar: string; en: string }
export interface Hour {
  h: number;
  vitals: Record<Vital | "SBP" | "MAP" | "DBP", number | null>;
  fresh: Vital[];
  baseline: Record<Vital, number | null>;
  score: number;
  level: Level;
  reasons: Reason[];
}
export interface Patient {
  id: number;
  role: "stable" | "fluctuating" | "deteriorating" | "missed" | "cohort";
  name?: { ar: string; en: string };
  age: number;
  gender: "M" | "F";
  sepsis_onset_hour: number | null;
  hours: Hour[];
}

const ALL = patientsJson as unknown as Patient[];
export const DEMO = ALL.filter((p) => p.id <= 3);
export const CASE4 = ALL.find((p) => p.id === 4);
export const BASE4 = ALL;

/** موضع المريض على الساعة المشتركة: آخر ساعة له ≤ H (ومن انتهت بياناته يبقى على آخر قراءة). */
export function atHour(p: Patient, H: number): number {
  let i = 0;
  while (i + 1 < p.hours.length && p.hours[i + 1].h <= H) i++;
  return i;
}
export const METRICS = metricsJson;

export interface ProblemItem { value: string; label_ar: string; label_en: string; source: string; url?: string }
export const PROBLEM_SIZE = (evidenceJson.items as ProblemItem[]).filter((i) => i.value && i.source);

export function reasonVital(r?: Reason): Vital | null {
  const v = r?.feature.split("_")[0] as Vital | undefined;
  return v && VITALS.includes(v) ? v : null;
}

export interface LogEntry { h: number; from: Level; level: Level; reason?: Reason }

export function alertLog(p: Patient, upTo: number): LogEntry[] {
  const out: LogEntry[] = [];
  let prev: Level = "low";
  for (let i = 0; i <= upTo; i++) {
    const hr = p.hours[i];
    if (hr.level !== prev) out.push({ h: hr.h, from: prev, level: hr.level, reason: hr.reasons[0] });
    prev = hr.level;
  }
  return out;
}

export function firstFullIndex(p: Patient): number {
  return Math.max(0, p.hours.findIndex((h) => VITALS.every((v) => h.vitals[v] != null)));
}

export function firstAlertIndex(p: Patient): number {
  const hi = p.hours.findIndex((h) => h.level === "high");
  return hi >= 0 ? hi : Math.max(0, p.hours.findIndex((h) => h.level === "medium"));
}

export function baselineRange(p: Patient, v: Vital): [number, number] | null {
  const xs = p.hours.slice(0, 12).map((h) => h.vitals[v]).filter((x): x is number => x != null);
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

export const fmtVital = (v: Vital, x: number | null) =>
  x == null ? "—" : v === "Temp" ? x.toFixed(1) : String(Math.round(x));
