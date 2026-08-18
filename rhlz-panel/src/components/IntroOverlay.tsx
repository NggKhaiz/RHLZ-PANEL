import React, { useEffect, useState } from "react";
import { m, AnimatePresence, useReducedMotion } from "framer-motion";
import { PRODUCT_NAME, PANEL_UI_NAME, SECURITY_CORE, TAGLINE, VERSION } from "../brand";

const SESSION_KEY = "rhlz_intro_shown";

/**
 * Professional entry splash — pure CSS/SVG/Framer animation, no video.
 * Shown once per browser session, auto-dismisses, respects
 * prefers-reduced-motion, and never blocks interaction for long.
 */
export function IntroOverlay() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch {}
    setShow(true);
    const t = setTimeout(() => setShow(false), reduce ? 1200 : 2600);
    return () => clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") setShow(false);
    };
    if (show) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  const dismiss = () => {
    setShow(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
  };

  return (
    <AnimatePresence>
      {show && (
        <m.div
          key="intro"
          className="fixed inset-0 z-[9998] flex items-center justify-center p-6"
          style={{ background: "rgba(3,3,5,0.72)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.4 }}
          onClick={dismiss}
          role="presentation"
        >
          <m.div
            className="glass-panel relative w-full max-w-md overflow-hidden rounded-3xl p-8 text-center"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 18, filter: "blur(8px)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: reduce ? 0.15 : 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* ambient glow */}
            <m.div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-theme-600/20 blur-3xl"
              animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* rotating ring + rhlz mark */}
            <div className="relative mx-auto mb-5 flex h-24 w-24 items-center justify-center">
              <m.span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent 0deg, rgba(var(--theme-rgb-600),0.25) 140deg, var(--color-theme-500) 300deg, #e0e7ff 360deg)",
                  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
                }}
                animate={reduce ? undefined : { rotate: 360 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
              />
              <svg viewBox="0 0 64 64" className="relative h-12 w-12" aria-hidden>
                <rect x="5" y="5" width="54" height="54" rx="14" fill="none" stroke="var(--theme-500)" strokeWidth="2.4" />
                <path
                  d="M20 47V17h15c7 0 11 3.6 11 9.6 0 5-3.4 8.4-8.6 9.4l9.4 11h-8.8l-8.2-9.8h-1.6V47z"
                  fill="var(--theme-500)"
                />
              </svg>
            </div>

            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {PRODUCT_NAME}
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {PANEL_UI_NAME} · v{VERSION}
            </p>
            <p className="mt-3 text-sm text-foreground-muted">{TAGLINE}</p>

            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 font-mono text-[10px] tracking-wider text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-theme-500" />
              {SECURITY_CORE} security core · hardened · watching
            </div>

            <button
              onClick={dismiss}
              className="mt-6 rounded-xl border border-border bg-muted px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-500"
            >
              Enter {PANEL_UI_NAME}
            </button>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
