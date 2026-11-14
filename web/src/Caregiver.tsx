import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ArrowDown, ArrowUp, BellOff, Droplets, HeartPulse, Minus, Search, Stethoscope, Thermometer, TrendingUp, UserRound, Users, Wind } from "lucide-react";
import { alertLog, atHour, BASE4, fmtVital, RANK, reasonVital, VITALS, type Patient, type Vital } from "./data";
import cohortJson from "./data/cohort.json";
import { useI18n, type Key } from "./i18n";
import Trend from "./Trend";
import { Badge, Button, Card, EmptyState, Gauge, RiskChip, spring } from "./ui";

const ICON = { Temp: Thermometer, HR: HeartPulse, O2Sat: Droplets, Resp: Wind } as const;

function VitalCard({ patient, idx, v }: { patient: Patient; idx: number; v: Vital }) {
  const { t } = useI18n();
  const hr = patient.hours[idx];
  const x = hr.vitals[v], base = hr.baseline[v];
  const Icon = ICON[v];
  const diff = x != null && base != null ? x - base : null;
  const small = v === "Temp" ? 0.15 : 1; // أصغر فرق نعدّه «قريباً من المعتاد»
  const dir = diff == null || Math.abs(diff) < small ? 0 : diff > 0 ? 1 : -1;
  const Dir = dir > 0 ? ArrowUp : dir < 0 ? ArrowDown : Minus;
  const contributes = hr.reasons.some((r) => reasonVital(r) === v);
  return (
    <Card as="article" className={`relative p-4 ${contributes ? "ring-2 ring-risk/60" : ""}`} data-level={hr.level}>
      <div className="flex items-center gap-2 text-[14px] font-medium text-ink-2">
        <Icon className="size-[18px] text-teal-ink" aria-hidden />{t(`v_${v}` as Key)}
      </div>
      <div className="num mt-2 flex items-baseline gap-1.5">
        <span className="text-[34px] font-bold leading-none">{fmtVital(v, x)}</span>
        <span className="text-[13px] text-muted">{t(`u_${v}` as Key)}</span>
      </div>
      <div className="num mt-3 flex items-center gap-2 text-[13px] text-ink-2">
        <Dir className={`size-4 ${dir ? "text-risk" : "text-muted"}`} aria-hidden />
        {dir === 0 ? t("c_same") : t(dir > 0 ? "c_above" : "c_below", { d: fmtVital(v, Math.abs(diff!)) })}
      </div>
      <div className="num mt-1 text-[12.5px] text-muted">{t("c_usual")}: {fmtVital(v, base)}</div>
      {!hr.fresh.includes(v) && x != null && <div className="mt-1 text-[12px] text-muted">{t("c_last_value")}</div>}
      {contributes && <div className="mt-2"><Badge tone="warn">{t("c_contrib")}</Badge></div>}
    </Card>
  );
}

function useAgeSex() {
  const { t } = useI18n();
  return (p: Patient) => `${p.age >= 90 ? t("c_age90") : t("c_age", { n: p.age })} · ${t(p.gender === "M" ? "c_male" : "c_female")}`;
}

const LIST: Patient[] = [...BASE4, ...(cohortJson as unknown as Patient[])];

function useName() {
  const { t, lang } = useI18n();
  return (p: Patient) => p.name?.[lang] ?? t(`name_${p.id}` as Key);
}

function PatientList({ selected, H, onSelect }: { selected: number; H: number; onSelect: (id: number) => void }) {
  const { t, nt, lang } = useI18n();
  const ageSex = useAgeSex();
  const name = useName();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const rows = LIST
    .map((p) => ({ p, hr: p.hours[atHour(p, H)], stale: H > p.hours[p.hours.length - 1].h }))
    .sort((a, b) => RANK[b.hr.level] - RANK[a.hr.level] || a.p.id - b.p.id)
    .filter(({ p }) => !query || name(p).toLowerCase().includes(query));
  return (
    <Card className="p-3 sm:p-4 lg:col-span-2" aria-label={t("c_list")}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-2">
          <Users className="size-[18px] text-teal-ink" aria-hidden />{t("c_list")}
          <span className="num text-[13px] font-medium text-muted">· {nt("patient", LIST.length)}</span>
        </h2>
        <label className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("c_search")} aria-label={t("c_search")} lang={lang}
            className="h-11 w-full rounded-full bg-surface-2 pe-4 ps-9 text-[14.5px] text-ink outline-none ring-1 ring-line placeholder:text-muted focus-visible:ring-2 focus-visible:ring-teal" />
        </label>
      </div>
      <motion.ul layoutScroll className="grid max-h-[440px] gap-1.5 overflow-y-auto overscroll-contain p-0.5 lg:max-h-[300px] lg:grid-cols-3 lg:gap-3">
        {rows.length === 0 && <li className="px-2 py-4 text-[14px] text-muted lg:col-span-3">{t("c_search_empty")}</li>}
        {rows.map(({ p, hr, stale }) => {
          const on = p.id === selected;
          return (
            <motion.li layout="position" key={p.id} transition={spring}>
              <button
                type="button" onClick={() => onSelect(p.id)} aria-current={on ? "true" : undefined}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-colors ${on ? "bg-teal-soft ring-2 ring-teal/60" : "bg-surface-2/60 hover:bg-surface-2"}`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-teal-ink"><UserRound className="size-5" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold leading-tight">{name(p)}</span>
                  <span className="num mt-0.5 block text-[13px] text-ink-2">{ageSex(p)}</span>
                  <span className="num block text-[12.5px] text-muted">
                    {stale ? <span className="font-semibold text-ink-2">{t("c_last_reading")} · </span> : null}{t("after_n", { n: nt("hour", hr.h) })}
                  </span>
                </span>
                <RiskChip level={hr.level} />
              </button>
            </motion.li>
          );
        })}
      </motion.ul>
    </Card>
  );
}

export default function Caregiver({ clock, clockIdx, selectedId, onSelect, notify }: {
  clock: Patient; clockIdx: number; selectedId: number; onSelect: (id: number) => void; notify: (m: string) => void;
}) {
  const { t, lang, nt } = useI18n();
  const ageSex = useAgeSex();
  const name = useName();
  const [vital, setVital] = useState<Vital>("Temp");
  const H = clock.hours[clockIdx].h;
  const patient = LIST.find((p) => p.id === selectedId) ?? clock;
  const stale = H > patient.hours[patient.hours.length - 1].h;
  const idx = atHour(patient, H);
  const hr = patient.hours[idx];
  const open = (id: number) => {
    onSelect(id);
    requestAnimationFrame(() => document.getElementById("patient-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const log = alertLog(patient, idx).reverse();
  const firstHigh = patient.hours.findIndex((h) => h.level === "high");
  const lead = patient.sepsis_onset_hour != null && firstHigh >= 0 && firstHigh <= idx ? patient.sepsis_onset_hour - patient.hours[firstHigh].h : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-5">
      <PatientList selected={patient.id} H={H} onSelect={open} />

      <div id="patient-detail" className="scroll-mt-24 lg:col-span-2">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-teal-soft text-teal-ink"><UserRound className="size-7" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{name(patient)}</h1>
          <p className="num text-[15px] text-ink-2">{ageSex(patient)}</p>
          {stale && <p className="num mt-0.5 text-[13px] font-semibold text-ink-2">{t("c_last_reading")} · {t("after_n", { n: nt("hour", hr.h) })}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge small>{t("badge_real")}</Badge><Badge small tone="muted">{t("fictional")}</Badge>
          <Badge small tone="muted">{t(patient.role === "cohort" ? "badge_cohort" : "badge_selected")}</Badge>
        </div>
      </Card>
      </div>

      <Card data-level={hr.level} className="p-5 lg:col-start-1 lg:row-start-3">
        <h2 className="mb-1 text-[15px] font-semibold text-ink-2">{t("c_risk")}</h2>
        <div className="mx-auto max-w-[280px] pt-2"><Gauge score={hr.score} level={hr.level} thresholds={[40, 70]} /></div>
        <h3 className="mb-2 mt-6 text-[17px] font-semibold">{t("c_why")}</h3>
        <AnimatePresence mode="wait" initial={false}>
          <motion.ul key={hr.reasons.map((r) => r.feature).join()} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} className="flex flex-col gap-2">
            {hr.reasons.length === 0 && <li className="rounded-xl bg-surface-2 p-3 text-[14px] text-muted">{t("c_why_empty")}</li>}
            {hr.reasons.map((r) => (
              <li key={r.feature} className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-[15px] leading-snug">
                <TrendingUp className="mt-0.5 size-[18px] shrink-0 text-risk" aria-hidden />{r[lang]}
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </Card>

      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-3">
        <section aria-label={t("c_vitals")}>
          <h2 className="mb-3 px-1 text-[17px] font-semibold">{t("c_vitals")}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {VITALS.map((v) => <VitalCard key={v} patient={patient} idx={idx} v={v} />)}
          </div>
          <Card className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-dashed bg-surface-2/60 p-4 shadow-none">
            <div className="flex items-center gap-2 text-[14px] font-medium text-ink-2">{t("c_pressure")}<Badge tone="muted">{t("badge_future")}</Badge></div>
            <div className="num text-[17px] font-semibold text-ink-2">{fmtVital("HR", hr.vitals.SBP)} / {fmtVital("HR", hr.vitals.DBP)} <span className="text-[13px] font-normal text-muted">({fmtVital("HR", hr.vitals.MAP)})</span></div>
            <div className="text-[13px] text-muted">{t("c_pressure_note")}</div>
          </Card>
        </section>

        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">{t("c_trend")}</h2>
            {lead != null && <Badge tone="teal">{t("c_lead", { h: nt("hour", lead) })}</Badge>}
          </div>
          <div role="tablist" aria-label={t("c_trend")} className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
            {VITALS.map((v) => (
              <button key={v} type="button" role="tab" aria-selected={vital === v} onClick={() => setVital(v)}
                className={`relative min-h-11 flex-1 whitespace-nowrap rounded-full px-3 text-[14px] font-semibold transition-colors ${vital === v ? "text-teal-ink" : "text-ink-2"}`}>
                {vital === v && <motion.span layoutId="trend-pill" transition={spring} className="absolute inset-0 rounded-full bg-surface shadow-card" />}
                <span className="relative">{t(`v_${v}` as Key)}</span>
              </button>
            ))}
          </div>
          <Trend patient={patient} idx={idx} vital={vital} />
          <p className="mt-3 text-[12.5px] text-muted">{t("c_hour_axis")}</p>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-4">
        <Card data-level={hr.level} className="p-5">
          <h2 className="text-[17px] font-semibold">{t("c_action")}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t(`c_a_${hr.level}` as Key)}</p>
          <p className="mt-2 text-[13.5px] font-medium text-teal-ink">{t("c_support")}</p>
          <div className="mt-4 flex items-center gap-3">
            <Button variant={hr.level === "high" ? "risk" : "secondary"} icon={Stethoscope} onClick={() => notify(t("c_escalated"))} className="flex-1">{t("c_escalate")}</Button>
            <Badge tone="warn">{t("badge_sim")}</Badge>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[17px] font-semibold">{t("c_log")}</h2>
          {log.length === 0 ? (
            <EmptyState compact icon={BellOff} title={t("c_log_empty_t")} text={t("c_log_empty")} />
          ) : (
            <ol className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {log.map((e) => (
                <li key={e.h} data-level={e.level} className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <RiskChip level={e.level} />
                    <span className="num text-[13px] text-muted">{t("after_n", { n: nt("hour", e.h) })}</span>
                  </div>
                  <div className="text-[14.5px] font-medium">{t(`c_log_${e.level === "low" || e.level === "medium" && e.from === "high" ? "down" : "up"}_${e.level}` as Key)}</div>
                  {e.reason && <div className="text-[13px] text-muted">{e.reason[lang]}</div>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
