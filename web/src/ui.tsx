import { AnimatePresence, motion } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import { Eye, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Level } from "./data";
import { useI18n } from "./i18n";

export const spring = { type: "spring", stiffness: 380, damping: 32 } as const;
export const LEVEL_ICON = { low: ShieldCheck, medium: Eye, high: TriangleAlert } satisfies Record<Level, ComponentType<{ className?: string }>>;

export function Card({ children, className = "", as: Tag = "section", ...rest }: {
  children: ReactNode; className?: string; as?: "section" | "div" | "article"; "aria-label"?: string; "data-level"?: string;
}) {
  return <Tag className={`rounded-card border border-line/50 bg-surface shadow-card ${className}`} {...rest}>{children}</Tag>;
}

export function SectionTitle({ children, icon: Icon }: { children: ReactNode; icon?: ComponentType<{ className?: string }> }) {
  return <h2 className="flex items-center gap-2 text-xl font-semibold">{Icon && <Icon className="size-5 text-teal-ink" aria-hidden />}{children}</h2>;
}

const TONES = {
  teal: "bg-teal-soft text-teal-ink",
  warn: "bg-warn-soft text-warn",
  muted: "bg-surface-2 text-ink-2",
} as const;

export function Badge({ children, tone = "teal", icon: Icon, small }: {
  children: ReactNode; tone?: keyof typeof TONES; icon?: ComponentType<{ className?: string }>; small?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium leading-tight ${small ? "min-h-6 px-2.5 py-0.5 text-[12px]" : "min-h-7 px-3 py-1 text-[13px]"} ${TONES[tone]}`}>
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {children}
    </span>
  );
}

export function RiskChip({ level }: { level: Level }) {
  const { t } = useI18n();
  const Icon = LEVEL_ICON[level];
  return (
    <span data-level={level} className="risk-fade inline-flex min-h-8 items-center gap-1.5 rounded-full bg-risk-soft px-3 text-sm font-semibold text-risk">
      <Icon className="size-4" aria-hidden />
      {t(`level_${level}`)}
    </span>
  );
}

const BTN = {
  primary: "bg-primary text-surface shadow-card hover:brightness-110",
  risk: "bg-risk text-surface shadow-card hover:brightness-110 risk-fade",
  secondary: "bg-surface text-ink shadow-card ring-1 ring-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2",
} as const;

export function Button({ variant = "primary", size = "md", loading, icon: Icon, children, className = "", disabled, ...props }: {
  variant?: keyof typeof BTN; size?: "md" | "lg"; loading?: boolean; icon?: ComponentType<{ className?: string }>;
  children?: ReactNode; className?: string; disabled?: boolean; onClick?: () => void; "aria-label"?: string; type?: "button";
}) {
  return (
    <motion.button
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={spring}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "lg" ? "min-h-14 px-6 text-[17px]" : "min-h-11 px-4 text-[15px]"} ${BTN[variant]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : Icon && <Icon className="size-5" aria-hidden />}
      {children}
    </motion.button>
  );
}

export function IconButton({ icon: Icon, label, onClick, active }: {
  icon: ComponentType<{ className?: string }>; label: string; onClick: () => void; active?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }} transition={spring} onClick={onClick} aria-label={label} title={label} type="button"
      className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150 hover:bg-surface-2 ${active ? "bg-teal-soft text-teal-ink" : "text-ink-2"}`}
    >
      <Icon className="size-5" aria-hidden />
    </motion.button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, text, action, compact }: {
  icon: ComponentType<{ className?: string }>; title: string; text: string; action?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={`mx-auto flex max-w-sm flex-col items-center gap-3 px-4 text-center ${compact ? "py-6" : "py-16"}`}>
      <div className="grid size-16 place-items-center rounded-full bg-teal-soft text-teal-ink"><Icon className="size-7" aria-hidden /></div>
      <h2 className={compact ? "text-[17px] font-semibold" : "text-xl font-semibold"}>{title}</h2>
      <p className="text-[15px] leading-relaxed text-muted">{text}</p>
      {action}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom)+112px)] z-50 flex justify-center px-4 lg:bottom-28" role="status" aria-live="polite">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }} transition={spring}
            className="max-w-md rounded-2xl bg-ink px-5 py-3 text-center text-[15px] font-medium text-bg shadow-lift"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Gauge({ score, level, thresholds }: { score: number; level: Level; thresholds: [number, number] }) {
  const { t } = useI18n();
  const pt = (s: number, r: number) => {
    const a = Math.PI - (Math.PI * s) / 100;
    return [90 + r * Math.cos(a), 100 - r * Math.sin(a)] as const;
  };
  return (
    <div data-level={level} className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 180 112" className="w-full overflow-visible" role="img" aria-label={`${t("c_risk")}: ${t(`level_${level}`)}`}>
        <path d="M10 100 A80 80 0 0 1 170 100" fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-line" />
        <motion.path
          d="M10 100 A80 80 0 0 1 170 100" fill="none" strokeWidth="14" strokeLinecap="round"
          className="risk-fade stroke-risk" style={{ transition: "stroke 0.6s ease" }}
          initial={false} animate={{ pathLength: Math.max(score, 1.5) / 100 }} transition={spring}
        />
        {thresholds.map((s) => {
          const [x1, y1] = pt(s, 70), [x2, y2] = pt(s, 91);
          return <line key={s} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="2" strokeLinecap="round" className="stroke-muted" />;
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center leading-tight">
        <span className="risk-fade text-[28px] font-bold text-risk">{t(`level_${level}`)}</span>
      </div>
    </div>
  );
}

export function PulseLine({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 60" className={`${className} rtl:-scale-x-100`} aria-hidden preserveAspectRatio="none">
      <path
        pathLength="1" className="pulse-trace" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        d="M0 32 H96 L104 28 L112 34 L120 32 L130 8 L140 54 L150 24 L158 32 H300"
      />
    </svg>
  );
}
