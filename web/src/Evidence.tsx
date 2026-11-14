import { motion } from "framer-motion";
import { lazy, Suspense } from "react";
import { Database, ExternalLink, FlaskConical, Info, Scale, TriangleAlert } from "lucide-react";
import { CASE4, METRICS as M, PROBLEM_SIZE } from "./data";
import { useI18n, type Key } from "./i18n";
import type { ReactNode } from "react";
import { Badge, Card, SectionTitle, Skeleton } from "./ui";

const Trend = lazy(() => import("./Trend"));

const B = M.models.main.external_B;
const f3 = (x: number) => x.toFixed(3);
const pct = (x: number) => Math.round(x * 100);

function FeverCard() {
  const { t, nt } = useI18n();
  const fever = M.models.fever.external_B, mf = M.main_at_fever_false_alert_rate.external_B;
  const rows = [
    { big: `${M.no_fever.B.no_fever_pct.toFixed(1)}%`, text: t("ev_fever_1", { n: M.no_fever.B.no_fever_pct.toFixed(1), t: M.fever_celsius, w: nt("hour", M.window_hours) }) },
    { big: f3(B.auroc), vs: f3(fever.auroc), text: t("ev_fever_2", { a: f3(B.auroc), b: f3(fever.auroc) }) },
  ];
  return (
    <Card className="border-s-4 border-s-teal p-5 sm:p-7">
      <SectionTitle icon={Scale}>{t("ev_fever_h")}</SectionTitle>
      <ol className="mt-5 grid gap-5">
        {rows.map((r, i) => (
          <li key={i} className="grid items-start gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6">
            <div className="num flex items-baseline gap-2 whitespace-nowrap" dir="ltr">
              <span className="text-[34px] font-bold leading-none text-navy">{r.big}</span>
              {r.vs && <span className="text-[17px] font-medium text-muted">vs {r.vs}</span>}
            </div>
            <p className="max-w-2xl text-[16px] leading-relaxed text-ink">{r.text}</p>
          </li>
        ))}
        <li className="max-w-3xl text-[16px] leading-relaxed text-ink">
          {t("ev_fever_3", { r: mf.false_alerts_per_patient_day.toFixed(2), d: mf.detected, n: mf.n_sepsis })}
        </li>
      </ol>
      <p className="mt-5 text-[12.5px] text-muted">{t("ev_fever_src", { t: M.fever_celsius })}</p>
      <p className="mt-1 text-[12.5px] text-muted">{t("ev_fever_gloss")}</p>
    </Card>
  );
}

function DataCard() {
  const { t, nt } = useI18n();
  const sets = [["ev_data_a", M.data.A.patients], ["ev_data_b", M.data.B.patients]] as const;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <SectionTitle icon={Database}>{t("ev_data_h")}</SectionTitle>
      <p className="max-w-3xl text-[15.5px] leading-relaxed text-ink-2">{t("ev_data_s")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sets.map(([k, n]) => (
          <div key={k} className="rounded-2xl bg-surface-2 p-4">
            <div className="num text-[26px] font-bold leading-tight">{nt("patient", n)}</div>
            <div className="text-[14px] text-ink-2">{t(k)}</div>
          </div>
        ))}
      </div>
      <p className="max-w-3xl text-[15px] leading-relaxed text-ink-2">{t("ev_data_in")}</p>
      <p className="text-[14px] font-medium text-teal-ink">{t("ev_data_no")}</p>
    </Card>
  );
}

function MetricCard({ label, value, unit, text, extra }: { label: string; value: string; unit?: string; text: string; extra?: ReactNode }) {
  return (
    <Card as="article" className="flex flex-col gap-1 p-5">
      <div className="text-[14px] font-semibold text-ink-2">{label}</div>
      <div className="num flex items-baseline gap-2"><span className="text-[34px] font-bold leading-tight">{value}</span>{unit && <span className="text-[13px] text-muted">{unit}</span>}</div>
      <p className="text-[13.5px] leading-snug text-muted">{text}</p>
      {extra && <p className="mt-1 text-[13.5px] font-medium leading-snug text-ink-2">{extra}</p>}
    </Card>
  );
}

function External() {
  const { t, nt } = useI18n();
  const p = B.patient, fever = M.models.fever.external_B;
  const times = (e: { auprc: number; prevalence: number }) => (e.auprc / e.prevalence).toFixed(1);
  return (
    <section className="flex flex-col gap-4" aria-label={t("ev_ext_h")}>
      <div>
        <SectionTitle>{t("ev_ext_h")}</SectionTitle>
        <p className="mt-1 max-w-3xl text-[15px] text-ink-2">{t("ev_ext_s", { n: nt("patient", M.data.B.patients) })}</p>
        <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-muted">{t("ev_ext_gloss")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("ev_auroc")} value={f3(B.auroc)} text={t("ev_auroc_d")} />
        <MetricCard label={t("ev_auprc")} value={f3(B.auprc)} text={t("ev_auprc_d", { p: f3(B.prevalence) })} extra={t("ev_auprc_x", { m: times(B), f: times(fever) })} />
        <MetricCard label={t("ev_sens")} value={`${pct(p.sensitivity)}%`} text={t("ev_sens_d", { d: p.detected, n: p.n_sepsis, w: nt("hour", M.window_hours), h: nt("hour", p.median_lead_h ?? 0) })} />
        <MetricCard label={t("ev_false")} value={p.false_alerts_per_patient_day.toFixed(2)} unit={t("ev_false_u")} text={t("ev_false_d", { p: pct(p.pct_nonsepsis_alerted) })} />
      </div>
      <p className="max-w-3xl text-[13.5px] leading-relaxed text-muted">{t("ev_acc")}</p>
    </section>
  );
}

function Compare() {
  const { t } = useI18n();
  const rows = [
    { key: "ev_n_fever", m: M.models.fever }, { key: "ev_n_logreg", m: M.models.logreg },
    { key: "ev_n_main", m: M.models.main }, { key: "ev_n_full", m: M.models.full },
  ] as const;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <SectionTitle>{t("ev_cmp_h")}</SectionTitle>
      <p className="flex items-start gap-2.5 rounded-2xl bg-warn-soft p-3.5 text-[15px] font-semibold leading-snug text-warn">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden />{t("ev_cmp_warn")}
      </p>
      <ul className="grid gap-2.5">
        {rows.map(({ key, m }) => {
          const e = m.external_B;
          const cells = [["ev_auroc", f3(e.auroc)], ["ev_auprc", f3(e.auprc)], ["ev_c_det", `${pct(e.patient.sensitivity)}%`], ["ev_c_false", e.patient.false_alerts_per_patient_day.toFixed(2)]] as const;
          return (
            <li key={key} className={`rounded-2xl p-3.5 ${key === "ev_n_main" ? "bg-teal-soft ring-2 ring-teal" : "bg-surface-2"}`}>
              <div className="mb-2 text-[14.5px] font-semibold">{t(key, { t: M.fever_celsius })}</div>
              <div className="num grid grid-cols-4 gap-2">
                {cells.map(([k, v]) => (
                  <div key={k}><div className="text-[11.5px] leading-tight text-muted">{t(k as Key)}</div><div className="text-[16px] font-bold">{v}</div></div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[13px] leading-relaxed text-muted">{t("ev_cmp_note", { a: f3(B.auroc), b: f3(M.models.full.external_B.auroc) })}</p>
    </Card>
  );
}

function Features() {
  const { t, lang } = useI18n();
  const top = M.top_features, max = Math.max(...top.map((f) => f.mean_abs_shap));
  const notInstant = top.filter((f) => !f.feature.endsWith("_value")).length;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div><SectionTitle>{t("ev_feat_h")}</SectionTitle><p className="mt-1 text-[14px] text-ink-2">{t("ev_feat_s")}</p><p className="mt-1 text-[13px] text-muted">{t("ev_feat_shap")}</p></div>
      <ul className="grid gap-3">
        {top.map((f, i) => (
          <li key={f.feature}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]"><span className="font-medium">{f[lang]}</span><span className="num text-[12.5px] text-muted">{f.mean_abs_shap.toFixed(2)}</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <motion.div className="h-full origin-[left] rounded-full bg-teal rtl:origin-[right]" style={{ width: `${(f.mean_abs_shap / max) * 100}%` }}
                initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 160, damping: 26, delay: i * 0.04 }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[15px] font-semibold leading-relaxed text-ink">{t("ev_feat_top", { f: top[0][lang] })}</p>
      <p className="text-[13.5px] leading-relaxed text-ink-2">{t("ev_feat_note", { n: notInstant })}</p>
    </Card>
  );
}

const TAGS = [
  [1, "ev_t_real", "teal"], [2, "ev_t_real", "teal"], [3, "ev_t_design", "muted"], [4, "ev_t_assume", "muted"], [5, "ev_t_sim", "warn"],
  [6, "ev_t_future", "warn"], [8, "ev_t_sim", "warn"],
] as const;

function RealOrSim() {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <SectionTitle>{t("ev_real_h")}</SectionTitle>
      <ul className="divide-y divide-line/70">
        {TAGS.map(([n, tag, tone]) => (
          <li key={n} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-[15px] font-semibold">{t(`ev_r${n}_n` as Key)}</div>
              <div className="text-[13.5px] leading-snug text-muted">{t(`ev_r${n}_d` as Key)}</div>
            </div>
            <Badge tone={tone}>{t(tag)}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MissedCase() {
  const { t, nt } = useI18n();
  const p = CASE4, onset = p?.sepsis_onset_hour;
  const first = p?.hours.find((h) => h.level !== "low");
  if (!p || onset == null || !first) return null;
  const maxTemp = Math.max(...p.hours.filter((h) => h.h <= onset).map((h) => h.vitals.Temp).filter((x): x is number => x != null));
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={TriangleAlert}>{t("ev_case_h")}</SectionTitle>
        <Badge tone="muted">{t("badge_real")}</Badge>
      </div>
      <p className="max-w-3xl text-[15.5px] leading-relaxed text-ink-2">{t("ev_case_s", { o: onset, n: nt("hour", onset - first.h), x: maxTemp.toFixed(1) })}</p>
      <Suspense fallback={<Skeleton className="h-[380px]" />}>
        <Trend patient={p} idx={p.hours.length - 1} vital="Temp" />
      </Suspense>
    </Card>
  );
}

function Limits() {
  const { t, nt } = useI18n();
  const A = M.exclusions.A, X = M.exclusions.B;
  const vars = { a: nt("patient", A.excluded_early_onset), ap: A.excluded_early_pct.toFixed(1), b: nt("patient", X.excluded_early_onset), bp: X.excluded_early_pct.toFixed(1), s: pct(B.patient.sensitivity), f: pct(B.patient.pct_nonsepsis_alerted) };
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <SectionTitle>{t("ev_lim_h")}</SectionTitle>
      <ul className="grid gap-3">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />{t(`ev_lim${i + 1}` as Key, vars)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProblemSize() {
  const { t, lang } = useI18n();
  if (PROBLEM_SIZE.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={t("ev_size_h")}>
      <SectionTitle>{t("ev_size_h")}</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PROBLEM_SIZE.map((i) => (
          <Card key={i.label_en} as="article" className="p-5">
            <div className="num text-[34px] font-bold leading-tight text-navy">{i.value}</div>
            <p className="text-[15px]">{lang === "ar" ? i.label_ar : i.label_en}</p>
            <p className="mt-2 text-[12.5px] text-muted">{t("ev_size_src")}: {i.url ? <a className="underline" href={i.url} target="_blank" rel="noopener noreferrer">{i.source}</a> : i.source}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

const CITES = [
  { text: "Reyna, M., Josef, C., Jeter, R., Shashikumar, S., Moody, B., Westover, M. B., Sharma, A., Nemati, S., & Clifford, G. D. (2019). Early Prediction of Sepsis from Clinical Data: The PhysioNet/Computing in Cardiology Challenge 2019 (version 1.0.0). PhysioNet.", url: "https://doi.org/10.13026/v64v-d857" },
  { text: "Reyna MA, et al. Early Prediction of Sepsis From Clinical Data: The PhysioNet/Computing in Cardiology Challenge. Critical Care Medicine 48(2): 210–217.", url: "https://doi.org/10.1097/CCM.0000000000004145" },
  { text: "Goldberger, A., Amaral, L., Glass, L., Hausdorff, J., Ivanov, P. C., Mark, R., … & Stanley, H. E. (2000). PhysioBank, PhysioToolkit, and PhysioNet: Components of a new research resource for complex physiologic signals. Circulation 101(23): e215–e220.", url: "https://doi.org/10.1161/01.CIR.101.23.e215" },
];

function Sources() {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <SectionTitle icon={FlaskConical}>{t("ev_src_h")}</SectionTitle>
      <p className="text-[14px] text-ink-2">{t("ev_license")}</p>
      <p className="text-[14px] text-ink-2">{t("ev_trained", { d: `⁦${M.trained_at}⁩` })}</p>
      <ul dir="ltr" lang="en" className="grid gap-2.5 text-start text-[13px] leading-relaxed text-muted">
        {CITES.map((c) => (
          <li key={c.url}>{c.text} <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-teal-ink underline">{c.url.replace("https://", "")}<ExternalLink className="size-3" aria-hidden /></a></li>
        ))}
      </ul>
      <a href="https://physionet.org/content/challenge-2019/1.0.0/" target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-2xl bg-surface-2 px-4 text-[15px] font-semibold text-ink hover:bg-line">
        {t("ev_open")}<ExternalLink className="size-4" aria-hidden />
      </a>
    </Card>
  );
}

export default function Evidence() {
  const { t } = useI18n();
  const h = M.hours_since_ablation;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2"><Badge>{t("badge_real")}</Badge></div>
        <h1 className="text-[34px] font-bold leading-tight">{t("ev_title")}</h1>
        <p className="text-[17px] text-ink-2">{t("ev_sub")}</p>
      </header>
      <FeverCard />
      <DataCard />
      <External />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <Compare />
        <Card className="flex flex-col gap-2 p-5 sm:p-6">
          <SectionTitle>{t("ev_abl_h")}</SectionTitle>
          <p className="text-[15px] leading-relaxed text-ink-2">{t("ev_abl_s", { a: f3(h.auroc_without), b: f3(h.auroc_with_hours_since), d: Math.abs(h.diff).toFixed(3) })}</p>
        </Card>
      </div>
      <Features />
      <MissedCase />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <Limits />
        <RealOrSim />
      </div>
      <ProblemSize />
      <Sources />
    </div>
  );
}
