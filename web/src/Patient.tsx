import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { BellRing, Clock, Droplets, HeartPulse, Phone, Thermometer, Wind } from "lucide-react";
import { fmtVital, VITALS, type Patient as PatientT } from "./data";
import { useI18n, type Key } from "./i18n";
import { Badge, Button, Card, LEVEL_ICON, PulseLine, spring } from "./ui";

const VITAL_ICON = { Temp: Thermometer, HR: HeartPulse, O2Sat: Droplets, Resp: Wind } as const;

export default function Patient({ patient, idx, notify }: { patient: PatientT; idx: number; notify: (m: string) => void }) {
  const { t, nt } = useI18n();
  const hr = patient.hours[idx];
  const level = hr.level;
  const alert = level !== "low";
  const Icon = LEVEL_ICON[level];
  const [calling, setCalling] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const contact = () => {
    setCalling(true);
    notify(t("p_calling"));
    timer.current = window.setTimeout(() => setCalling(false), 1600);
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge small>{t("badge_real")}</Badge>
        <Badge small tone="muted">{t("fictional")}</Badge>
        <Badge small tone="muted">{t("badge_selected")}</Badge>
      </div>

      <section
        data-level={level} aria-live="polite"
        className="risk-fade relative overflow-hidden rounded-hero bg-risk-soft p-6 pb-24 shadow-card sm:p-8 sm:pb-28"
      >
        <div className="risk-fade pointer-events-none absolute -end-24 -top-24 size-72 rounded-full bg-risk opacity-20 blur-3xl" aria-hidden />
        <PulseLine className="risk-fade pointer-events-none absolute inset-x-0 bottom-3 h-16 w-full text-risk opacity-40" />
        <div className="relative flex flex-col gap-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={level} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              transition={spring} className="risk-fade grid size-14 place-items-center rounded-full bg-risk text-surface"
            >
              <Icon className="size-7" aria-hidden />
            </motion.div>
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={alert ? "alert" : "low"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink">{t(alert ? "p_alert_t" : "p_low_t")}</h1>
              {alert ? (
                <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-surface/70 p-3 text-[16px] font-semibold text-ink">
                  <BellRing className="mt-0.5 size-5 shrink-0 text-risk" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{t("p_alert_s")}</span>
                    <Badge small tone="warn">{t("badge_sim")}</Badge>
                  </div>
                </div>
              ) : (
                <p className="mt-2 max-w-md text-[17px] leading-relaxed text-ink-2">{t("p_low_s")}</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <div className="flex items-center gap-2 px-1 text-[14px] text-muted">
        <Clock className="size-4" aria-hidden />
        <span className="num">{t("p_updated", { h: nt("hour", hr.h) })}</span>
      </div>

      <div data-level={level} className="flex">
        <Button size="lg" variant={level === "high" ? "risk" : level === "medium" ? "primary" : "secondary"} icon={Phone}
          loading={calling} onClick={contact} className={`w-full ${level === "high" ? "min-h-16 text-[18px]" : ""}`}>
          {t("p_contact")}
        </Button>
      </div>

      <Card className="p-5">
        <h2 className="text-[17px] font-semibold">{t("p_readings")}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{t("p_readings_note")}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {VITALS.map((v) => {
            const VI = VITAL_ICON[v];
            return (
              <div key={v} className="rounded-2xl bg-surface-2 p-4">
                <dt className="flex items-center gap-2 text-[14px] text-ink-2"><VI className="size-[18px] text-teal-ink" aria-hidden />{t(`v_${v}` as Key)}</dt>
                <dd className="num mt-2 flex items-baseline gap-1.5">
                  <span className="text-[30px] font-bold leading-none">{fmtVital(v, hr.vitals[v])}</span>
                  <span className="text-[13px] text-muted">{t(`u_${v}` as Key)}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      </Card>
    </div>
  );
}

export function Welcome({ onStart }: { onStart: () => void }) {
  const { t, lang } = useI18n();
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="welcome-title"
      className="welcome-bg fixed inset-0 z-[60] flex flex-col items-center justify-between px-8 pb-[calc(env(safe-area-inset-bottom)+36px)] pt-[calc(env(safe-area-inset-top)+64px)] text-center text-white">
      <span aria-hidden />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }} className="flex flex-col items-center">
        <img src="/logo-mark.png" alt="" width={112} height={112} className="size-28 rounded-[30px] bg-white object-cover shadow-lift" />
        <h1 id="welcome-title" className="mt-7 text-[36px] font-bold leading-none">{t("app")}</h1>
        <div className="mt-2 text-[12px] font-semibold tracking-[0.3em] text-white/65" lang={lang === "ar" ? "en" : "ar"}>{lang === "ar" ? "MANAATY" : "مناعتي"}</div>
        <p className="mt-7 max-w-[280px] text-[19px] font-medium leading-relaxed text-white/90">{t("welcome_line")}</p>
      </motion.div>
      <div className="w-full max-w-sm">
        <motion.button type="button" autoFocus whileTap={{ scale: 0.97 }} transition={spring} onClick={onStart}
          className="min-h-14 w-full rounded-2xl bg-white text-[17px] font-bold text-[var(--brand-navy)] shadow-lift">
          {t("welcome_start")}
        </motion.button>
      </div>
    </div>
  );
}
