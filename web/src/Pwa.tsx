import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Download, RefreshCw, Share, SquarePlus, WifiOff, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useI18n } from "./i18n";
import { Button, Card, IconButton, spring } from "./ui";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = "install-dismissed";

const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const dismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const toggle = () => setOnline(navigator.onLine);
    addEventListener("online", toggle); addEventListener("offline", toggle);
    return () => { removeEventListener("online", toggle); removeEventListener("offline", toggle); };
  }, []);
  return online;
}

export function OfflineDot() {
  const { t } = useI18n();
  if (useOnline()) return null;
  return (
    <span role="status" title={t("pwa_offline_t")} className="grid size-8 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
      <WifiOff className="size-4" aria-hidden /><span className="sr-only">{t("pwa_offline_t")}</span>
    </span>
  );
}

function Banner({ icon: Icon, title, children, action, onClose }: {
  icon: ComponentType<{ className?: string }>; title: string; children?: ReactNode; action?: ReactNode; onClose?: () => void;
}) {
  const { t } = useI18n();
  return (
    <motion.div layout initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={spring}>
      <Card as="div" className="flex items-start gap-3 p-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-teal-soft text-teal-ink"><Icon className="size-5" aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">{title}</p>
          <div className="mt-0.5 text-[14px] leading-relaxed text-muted">{children}</div>
          {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
        </div>
        {onClose && <IconButton icon={X} label={t("pwa_close")} onClick={onClose} />}
      </Card>
    </motion.div>
  );
}

export function PwaLayer({ notify }: { notify: (msg: string) => void }) {
  const { t } = useI18n();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(dismissed);
  const online = useOnline();
  const [offCard, setOffCard] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onOfflineReady: () => notify(t("pwa_ready")),
  });

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallEvent); };
    addEventListener("beforeinstallprompt", onPrompt);
    return () => removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    setOffCard(!online);
    if (online) return;
    const id = window.setTimeout(() => setOffCard(false), 5000);
    return () => window.clearTimeout(id);
  }, [online]);

  const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch { } };
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
  };
  const canInstall = !hidden && !isStandalone() && installEvent;
  const iosGuide = !hidden && !isStandalone() && !installEvent && isIOS();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top)+8px)] z-30 mx-auto flex max-w-md flex-col gap-3 px-4 [&>*]:pointer-events-auto" aria-live="polite">
      <AnimatePresence initial={false}>
        {offCard && <Banner key="off" icon={WifiOff} title={t("pwa_offline_t")} onClose={() => setOffCard(false)}>{t("pwa_offline_s")}</Banner>}
        {needRefresh && (
          <Banner key="upd" icon={RefreshCw} title={t("pwa_update_t")} action={<Button size="md" onClick={() => updateServiceWorker(true)}>{t("pwa_update_btn")}</Button>}>
            {t("pwa_update_s")}
          </Banner>
        )}
        {canInstall && (
          <Banner key="inst" icon={Download} title={t("pwa_install_t")} onClose={dismiss}
            action={<><Button onClick={install}>{t("pwa_install_btn")}</Button><Button variant="ghost" onClick={dismiss}>{t("pwa_later")}</Button></>}>
            {t("pwa_install_s")}
          </Banner>
        )}
        {iosGuide && (
          <Banner key="ios" icon={Share} title={t("pwa_ios_t")} onClose={dismiss}>
            <ol className="grid gap-1.5">
              <li className="flex items-center gap-2"><Share className="size-4 shrink-0 text-teal-ink" aria-hidden />{t("pwa_ios_1")}</li>
              <li className="flex items-center gap-2"><SquarePlus className="size-4 shrink-0 text-teal-ink" aria-hidden />{t("pwa_ios_2")}</li>
            </ol>
          </Banner>
        )}
      </AnimatePresence>
    </div>
  );
}
