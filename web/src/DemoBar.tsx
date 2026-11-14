import { motion } from "framer-motion";
import { ChevronDown, Clapperboard, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { Patient } from "./data";
import { useI18n, type Key } from "./i18n";
import { IconButton, spring } from "./ui";

export interface DemoState {
  patientId: number;
  idx: number;
  count: number;
  hour: number;
  playing: boolean;
  speed: number;
}

export function DemoBar({ s, patients, open, onOpen, onPatient, onToggle, onSpeed, onSeek, onJump }: {
  s: DemoState; patients: Patient[]; open: boolean; onOpen: (v: boolean) => void; onPatient: (id: number) => void; onToggle: () => void;
  onSpeed: () => void; onSeek: (i: number) => void; onJump: () => void;
}) {
  const { t, nt } = useI18n();
  const atEnd = s.idx >= s.count - 1;
  const rate = t("demo_rate", { r: nt("hour", s.speed, { nom: true }) });
  if (!open) {
    return (
      <button
        type="button" onClick={() => onOpen(true)} aria-label={t("demo_show")} title={t("demo_show")} aria-expanded={false}
        className="fixed bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom)+12px)] end-4 z-30 flex min-h-11 items-center gap-2 rounded-full border border-line bg-glass px-4 text-[14px] font-semibold text-ink-2 shadow-lift backdrop-blur-xl transition-transform active:scale-95 lg:bottom-4"
      >
        <Clapperboard className="size-4" aria-hidden />{t("demo_short")}
      </button>
    );
  }
  return (
    <div
      role="region" aria-label={t("demo_bar")}
      className="fixed inset-x-0 bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom))] z-30 lg:bottom-4 lg:px-4"
    >
      <div className="mx-auto max-w-3xl border-t border-line bg-glass px-3 pb-2 pt-2 backdrop-blur-xl lg:rounded-3xl lg:border lg:px-4 lg:pb-3 lg:pt-3 lg:shadow-lift">
        <div className="mb-1.5 flex items-center justify-between gap-2 ps-1">
          <p className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-muted">
            <Clapperboard className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{t("demo_title")}</span>
          </p>
          <button
            type="button" onClick={() => onOpen(false)} aria-label={t("demo_hide")} title={t("demo_hide")} aria-expanded
            className="-my-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 active:scale-95"
          >
            <ChevronDown className="size-5" aria-hidden />
          </button>
        </div>
        <div role="radiogroup" aria-label={t("demo_bar")} className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
          {patients.map((p) => {
            const on = s.patientId === p.id;
            const role = t(`demo_role_${p.role}` as Key);
            const tip = t("demo_chip_tip", { role });
            return (
              <button
                key={p.id} type="button" role="radio" aria-checked={on} aria-label={tip} title={tip} onClick={() => onPatient(p.id)}
                className={`relative flex min-h-11 min-w-0 items-center justify-center rounded-xl px-1.5 py-1 transition-colors ${on ? "text-teal-ink" : "text-ink-2"}`}
              >
                {on && <motion.span layoutId="demo-pill" transition={spring} className="absolute inset-0 rounded-xl bg-surface shadow-card" />}
                <span className="relative max-w-full truncate text-[14px] font-semibold leading-tight">{role}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 lg:flex-nowrap">
          <IconButton
            icon={atEnd ? RotateCcw : s.playing ? Pause : Play}
            label={atEnd ? t("demo_replay") : s.playing ? t("demo_pause") : t("demo_play")}
            onClick={onToggle} active={s.playing}
          />
          <IconButton icon={SkipForward} label={t("demo_jump")} onClick={onJump} />
          <button
            type="button" onClick={onSpeed} aria-label={t("demo_speed", { r: rate })} title={t("demo_speed", { r: rate })}
            className="num grid h-11 shrink-0 place-items-center whitespace-nowrap rounded-full px-3 text-[14px] font-semibold text-ink-2 transition-colors hover:bg-surface-2"
          >
            {rate}
          </button>
          <div className="flex min-w-full flex-1 items-center gap-3 lg:min-w-0" dir="ltr">
            <input
              type="range" className="scrub" min={0} max={s.count - 1} step={1} value={s.idx}
              onChange={(e) => onSeek(Number(e.target.value))} aria-label={t("demo_scrub")} title={t("demo_scrub")}
              aria-valuetext={t("demo_pos", { h: s.hour, i: s.idx + 1, n: s.count })}
            />
            <span className="num w-[72px] shrink-0 text-end text-[13px] font-medium text-muted" dir={document.documentElement.dir}>
              {t("hour_n", { n: s.hour })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
