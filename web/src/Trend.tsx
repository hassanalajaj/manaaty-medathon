import { memo, useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { alertLog, baselineRange, fmtVital, RANK, type Patient, type Vital } from "./data";
import { useI18n, type Key } from "./i18n";

const AXIS = { fill: "var(--muted)", fontSize: 12 } as const;

function Tip({ active, payload, label, render }: { active?: boolean; payload?: { value?: number | null }[]; label?: number; render: (v: number) => string }) {
  const { t, nt } = useI18n();
  const v = payload?.[0]?.value;
  if (!active || v == null || label == null) return null;
  return (
    <div className="num rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-lift">
      <div className="text-muted">{t("after_n", { n: nt("hour", label) })}</div>
      <div className="font-semibold text-ink">{render(v)}</div>
    </div>
  );
}

function Trend({ patient, idx, vital }: { patient: Patient; idx: number; vital: Vital }) {
  const { t } = useI18n();
  const hs = patient.hours;
  const now = hs[idx].h;
  const onset = patient.sepsis_onset_hour;
  const xs = [hs[0].h, hs[hs.length - 1].h] as [number, number];
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(xs[0] + ((xs[1] - xs[0]) * i) / 4));
  const unit = t(`u_${vital}` as Key);
  const band = useMemo(() => baselineRange(patient, vital), [patient, vital]);
  const [lo, hi] = useMemo(() => {
    const all = hs.map((h) => h.vitals[vital]).filter((x): x is number => x != null);
    const pad = vital === "Temp" ? 0.4 : Math.max(2, (Math.max(...all) - Math.min(...all)) * 0.12);
    return [Math.floor((Math.min(...all) - pad) * 10) / 10, Math.ceil((Math.max(...all) + pad) * 10) / 10];
  }, [hs, vital]);
  const marks = useMemo(() => alertLog(patient, idx).filter((e) => RANK[e.level] > RANK[e.from]), [patient, idx]);
  const vitalData = hs.map((h, i) => ({ h: h.h, v: i <= idx ? h.vitals[vital] : null, base: i <= idx ? h.baseline[vital] : null }));
  const riskData = hs.map((h, i) => ({ h: h.h, s: i <= idx ? h.score : null }));
  const onsetLine = (label: boolean) => onset != null && (
    <ReferenceLine x={onset} stroke="var(--bad)" strokeWidth={2} strokeDasharray="5 4"
      label={label ? { value: t("c_onset"), position: "insideTopRight", fill: "var(--bad)", fontSize: 11, dx: -6 } : undefined} />
  );
  const nowLine = <ReferenceLine x={now} stroke="var(--muted)" strokeDasharray="2 3" />;
  const xAxis = <XAxis dataKey="h" type="number" domain={xs} tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--line)" }} ticks={ticks} allowDecimals={false} interval={0} />;

  return (
    <div dir="ltr" className="flex flex-col gap-1">
      <div className="h-[220px] w-full" role="img" aria-label={`${t("c_trend")}: ${t(`v_${vital}` as Key)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={vitalData} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            {xAxis}
            <YAxis domain={[lo, hi]} tick={AXIS} tickLine={false} axisLine={false} width={40} tickCount={5}
              tickFormatter={(x: number) => (vital === "Temp" ? x.toFixed(1) : String(Math.round(x)))} />
            {band && <ReferenceArea y1={band[0]} y2={band[1]} fill="var(--teal)" fillOpacity={0.14} ifOverflow="visible" />}
            {nowLine}
            {onsetLine(true)}
            <Line dataKey="base" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />
            <Line dataKey="v" stroke="var(--navy)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls />
            {marks.map((e) => (
              <ReferenceDot key={e.h} x={e.h} y={hs.find((h) => h.h === e.h)?.vitals[vital] ?? lo} r={6}
                fill={e.level === "high" ? "var(--bad)" : "var(--warn)"} stroke="var(--surface)" strokeWidth={2} ifOverflow="visible" />
            ))}
            <Tooltip content={<Tip render={(v) => `${fmtVital(vital, v)} ${unit}`} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="h-[130px] w-full" role="img" aria-label={t("c_risk_line")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={riskData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--teal)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            {xAxis}
            <YAxis domain={[0, 100]} ticks={[]} tick={false} tickLine={false} axisLine={false} width={40} />
            <ReferenceLine y={40} stroke="var(--warn)" strokeDasharray="4 3"
              label={{ value: t("c_thr_medium"), position: "insideBottomLeft", fill: "var(--warn)", fontSize: 11 }} />
            <ReferenceLine y={70} stroke="var(--bad)" strokeDasharray="4 3"
              label={{ value: t("c_thr_high"), position: "insideBottomLeft", fill: "var(--bad)", fontSize: 11 }} />
            {nowLine}
            {onsetLine(false)}
            <Area dataKey="s" stroke="var(--teal-ink)" strokeWidth={2} fill="url(#riskFill)" isAnimationActive={false} connectNulls />
            <Tooltip content={<Tip render={(v) => t(`level_${v >= 70 ? "high" : v >= 40 ? "medium" : "low"}`)} />} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted" dir={document.documentElement.dir}>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-navy" />{t(`v_${vital}` as Key)}</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-teal/20" />{t("c_band")}</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-warn" /><span className="size-2.5 rounded-full bg-bad" />{t("c_alert_marks")}</li>
        {onset != null && <li className="flex items-center gap-1.5"><span className="h-3 w-0 border-s-2 border-dashed border-bad" />{t("c_onset_def")}</li>}
      </ul>
    </div>
  );
}

export default memo(Trend);
