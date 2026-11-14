import { AnimatePresence, motion } from "framer-motion";
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlaskConical, Languages, Stethoscope, Sun, TriangleAlert, UserRound } from "lucide-react";
import { DEMO, firstAlertIndex, firstFullIndex, type Lang } from "./data";
import { DemoBar } from "./DemoBar";
import { I18nContext, makeNt, makeT, useI18n } from "./i18n";
import Patient, { Welcome } from "./Patient";
import { OfflineDot, PwaLayer } from "./Pwa";
import { Button, EmptyState, IconButton, Skeleton, spring, Toast } from "./ui";

const Caregiver = lazy(() => import("./Caregiver"));
const Evidence = lazy(() => import("./Evidence"));

const TABS = [
  { id: "patient", icon: UserRound, key: "tab_patient" },
  { id: "caregiver", icon: Stethoscope, key: "tab_caregiver" },
  { id: "evidence", icon: FlaskConical, key: "tab_evidence" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const SPEEDS = [1, 2, 4];

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { } };
const params = new URLSearchParams(location.search);

class Boundary extends Component<{ children: ReactNode; t: ReturnType<typeof makeT> }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    const { t } = this.props;
    return this.state.failed ? (
      <EmptyState icon={TriangleAlert} title={t("err_t")} text={t("err_s")}
        action={<Button onClick={() => location.reload()}>{t("err_btn")}</Button>} />
    ) : this.props.children;
  }
}

function ScreenSkeleton() {
  return (
    <div className="grid gap-4 py-6 lg:grid-cols-[1fr_400px]" aria-busy>
      <Skeleton className="h-64 lg:col-start-2" /><Skeleton className="h-96 lg:col-start-1 lg:row-start-1 lg:row-span-2" /><Skeleton className="h-40 lg:col-start-2" />
    </div>
  );
}

function Header({ tab, onTab, lang, onLang, onTheme }: {
  tab: TabId; onTab: (t: TabId) => void; lang: Lang; onLang: () => void; onTheme: () => void;
}) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-line/40 bg-glass pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/logo-mark.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl bg-white object-cover ring-1 ring-line" />
          <div className="min-w-0 leading-tight">
            <div className="text-lg font-bold text-navy">{t("app")}</div>
            <div className="hidden truncate text-[11px] font-medium tracking-wide text-muted sm:block" dir="ltr" lang="en">
              {lang === "ar" ? "EARLY DETECTION • SMARTER HEALTH" : t("tagline")}
            </div>
          </div>
        </div>
        <nav aria-label={t("nav")} className="mx-auto hidden gap-1 rounded-full bg-surface-2 p-1 lg:flex">
          {TABS.map(({ id, icon: Icon, key }) => (
            <button
              key={id} type="button" onClick={() => onTab(id)} aria-current={tab === id ? "page" : undefined}
              className={`relative flex min-h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors ${tab === id ? "text-teal-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {tab === id && <motion.span layoutId="nav-pill" transition={spring} className="absolute inset-0 rounded-full bg-surface shadow-card" />}
              <Icon className="relative size-[18px]" aria-hidden /><span className="relative">{t(key)}</span>
            </button>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          <OfflineDot />
          <button type="button" onClick={onLang} aria-label={t("lang_aria")}
            className="flex h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-ink-2 transition-colors hover:bg-surface-2">
            <Languages className="size-[18px]" aria-hidden />{t("lang_switch")}
          </button>
          <IconButton icon={Sun} label={t("theme_aria")} onClick={onTheme} />
        </div>
      </div>
    </header>
  );
}

function TabBar({ tab, onTab }: { tab: TabId; onTab: (t: TabId) => void }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("nav")} className="fixed inset-x-0 bottom-0 z-40 border-t border-line/50 bg-glass pb-[env(safe-area-inset-bottom)] shadow-lift backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid h-[var(--tab-h)] max-w-lg grid-cols-3">
        {TABS.map(({ id, icon: Icon, key }) => (
          <button key={id} type="button" onClick={() => onTab(id)} aria-current={tab === id ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 px-1 text-center text-[12px] font-semibold leading-tight transition-colors ${tab === id ? "text-teal-ink" : "text-muted"}`}>
            <span className="relative grid h-8 w-14 place-items-center">
              {tab === id && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-0 rounded-full bg-teal-soft" />}
              <Icon className="relative size-[22px]" aria-hidden />
            </span>
            {t(key)}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>((params.get("lang") ?? read("lang")) === "en" ? "en" : "ar");
  const [tab, setTab] = useState<TabId>((TABS.find((x) => x.id === params.get("tab"))?.id) ?? "patient");
  const [patientId, setPatientId] = useState(Math.min(3, Math.max(1, Number(params.get("p")) || 1)));
  const patient = DEMO.find((p) => p.id === patientId) ?? DEMO[0];
  const count = patient.hours.length;
  const [idx, setIdx] = useState(Math.min(count - 1, Math.max(0, Number(params.get("h")) || firstFullIndex(patient))));
  const [welcome, setWelcome] = useState(true);
  const [selectedId, setSelectedId] = useState(patientId);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [barOpen, setBarOpen] = useState(() => matchMedia("(min-width: 1024px)").matches);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const t = useMemo(() => makeT(lang), [lang]);
  const nt = useMemo(() => makeNt(lang), [lang]);

  useEffect(() => {
    const d = document.documentElement;
    d.lang = lang; d.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = `${t("app")} · ${lang === "ar" ? "Manaaty" : "مناعتي"}`;
    write("lang", lang);
  }, [lang, t]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setIdx((i) => Math.min(i + 1, count - 1)), 1000 / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, count]);
  useEffect(() => { if (playing && idx >= count - 1) setPlaying(false); }, [idx, count, playing]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  const toggleTheme = () => {
    const d = document.documentElement;
    const dark = d.dataset.theme === "dark";
    d.dataset.theme = dark ? "light" : "dark";
    write("theme", d.dataset.theme);
  };
  const togglePlay = () => { if (idx >= count - 1) { setIdx(firstFullIndex(patient)); setPlaying(true); } else setPlaying(!playing); };
  const pickPatient = (id: number) => {
    if (selectedId === patientId) setSelectedId(id);
    setPatientId(id); setIdx(firstFullIndex(DEMO.find((x) => x.id === id) ?? DEMO[0])); setPlaying(false);
  };

  const showDemo = tab === "patient" || tab === "caregiver";
  const demo = { patientId, idx, count, hour: patient.hours[idx].h, playing, speed };
  const screen = tab === "patient" ? <Patient patient={patient} idx={idx} notify={notify} />
    : tab === "caregiver" ? <Caregiver clock={patient} clockIdx={idx} selectedId={selectedId} onSelect={setSelectedId} notify={notify} />
    : <Evidence />;

  return (
    <I18nContext.Provider value={{ lang, t, nt }}>
      <Header tab={tab} onTab={setTab} lang={lang} onLang={() => setLang(lang === "ar" ? "en" : "ar")} onTheme={toggleTheme} />
      <PwaLayer notify={notify} />
      <main className={`mx-auto w-full max-w-[1200px] px-4 pt-5 lg:px-8 ${showDemo
        ? (barOpen ? "pb-[calc(var(--tab-h)+env(safe-area-inset-bottom)+212px)] lg:pb-56"
          : "pb-[calc(var(--tab-h)+env(safe-area-inset-bottom)+80px)] lg:pb-24") : "pb-[calc(var(--tab-h)+env(safe-area-inset-bottom)+32px)] lg:pb-12"}`}>
        <Boundary t={t}>
          <Suspense fallback={<ScreenSkeleton />}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ...spring, duration: 0.2 }}>
                {screen}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </Boundary>
      </main>
      {showDemo && (
        <DemoBar s={demo} patients={DEMO} open={barOpen} onOpen={setBarOpen} onPatient={pickPatient} onToggle={togglePlay}
          onSpeed={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          onSeek={(i) => { setIdx(i); setPlaying(false); }}
          onJump={() => { setIdx(firstAlertIndex(patient)); setPlaying(false); }} />
      )}
      <TabBar tab={tab} onTab={setTab} />
      {welcome && <Welcome onStart={() => setWelcome(false)} />}
      <Toast message={toast} />
    </I18nContext.Provider>
  );
}
