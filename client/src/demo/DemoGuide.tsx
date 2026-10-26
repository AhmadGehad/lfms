import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import type { PermissionPage } from "@shared/permissions";
import {
  CARD_GUIDE,
  CONTROL_GUIDE,
  PAGE_GUIDE,
  TABLE_GUIDE,
  TAB_GUIDE,
  TOUR_STEPS,
  explainButton,
  type Explanation,
} from "./guideContent";

const FOREST = "#0D3B2E";
const GOLD = "#C9973B";
const IVORY = "#F6F3EA";
const INK = "#17251D";
const MUTED = "#58675F";
const EASE = "cubic-bezier(0.2,0,0,1)";
const FONT = '"Manrope Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

type Box = { top: number; left: number; width: number; height: number };

const toBox = (rect: DOMRect): Box => ({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });

function visible(rect: DOMRect) {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
    rect.top < window.innerHeight && rect.left < window.innerWidth;
}

/** Text extent of an element: a full-width heading should get its mark next to the words. */
function textBox(el: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 ? rect : el.getBoundingClientRect();
}

function pageForPath(path: string): Explanation | null {
  if (/^\/animals\/\d+/.test(path)) {
    return { title: "Animal record", body: "Everything about one animal: identity, parents, weights, breeding, vaccinations, costs and sale. Use the tabs to move between them." };
  }
  const entry = Object.values(PAGE_GUIDE).find(guide => guide?.path === path);
  return entry ? { title: entry.title, body: entry.body } : null;
}

// Re-measures on scroll, resize and a slow interval, since pages load
// asynchronously and the main pane scrolls independently of the window.
function useMeasure(measure: () => void, active: boolean) {
  const frame = useRef(0);
  useEffect(() => {
    if (!active) return;
    const schedule = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    };
    schedule();
    const interval = window.setInterval(schedule, 400);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame.current);
      window.clearInterval(interval);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [measure, active]);
}

function placeCard(target: Box | null, width: number, height: number): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 14;
  const margin = 16;
  const clampX = (x: number) => Math.min(Math.max(x, margin), vw - width - margin);
  const clampY = (y: number) => Math.min(Math.max(y, margin), vh - height - margin);
  if (!target) return { left: clampX((vw - width) / 2), top: clampY((vh - height) / 2) };
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  if (target.height > vh * 0.4 && right + gap + width <= vw - margin) {
    return { left: right + gap, top: clampY(target.top + 48) };
  }
  if (bottom + gap + height <= vh - margin) return { left: clampX(target.left), top: bottom + gap };
  if (target.top - gap - height >= margin) return { left: clampX(target.left), top: target.top - gap - height };
  return { left: clampX(right + gap), top: clampY(target.top) };
}

const cardStyle: CSSProperties = {
  position: "fixed",
  zIndex: 1002,
  background: "#FFFFFF",
  color: INK,
  borderRadius: 12,
  boxShadow: "0 18px 48px rgba(13,59,46,0.28)",
  border: "1px solid #D9DFD8",
  fontFamily: FONT,
  transition: `top 200ms ${EASE}, left 200ms ${EASE}`,
};

function Button({ variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" }) {
  const primary = variant === "primary";
  return (
    <button
      type="button"
      {...props}
      className="demo-focus"
      style={{
        height: 40,
        padding: "0 16px",
        borderRadius: 8,
        border: primary ? "none" : "1px solid #D9DFD8",
        background: primary ? FOREST : "transparent",
        color: primary ? IVORY : INK,
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer",
        fontFamily: FONT,
        ...props.style,
      }}
    />
  );
}

export function GuideTour({ step, onStep, onClose }: { step: number; onStep: (next: number) => void; onClose: () => void }) {
  const [location, setLocation] = useLocation();
  const current = TOUR_STEPS[step];
  const [target, setTarget] = useState<Box | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const scrolledFor = useRef(-1);

  useEffect(() => {
    if (current.path && location !== current.path) setLocation(current.path);
  }, [current.path, location, setLocation]);

  useEffect(() => {
    setTarget(null);
    setGaveUp(false);
    if (!current.target) return;
    // Pages without the element (e.g. the sidebar inside a closed mobile
    // sheet) fall back to a centred card rather than waiting forever.
    const timer = window.setTimeout(() => setGaveUp(true), 2500);
    return () => window.clearTimeout(timer);
  }, [step, current.target]);

  const measure = useCallback(() => {
    if (!current.target) return;
    if (current.path && location !== current.path) return;
    const el = document.querySelector(current.target);
    if (!el) return setTarget(null);
    if (scrolledFor.current !== step) {
      scrolledFor.current = step;
      el.scrollIntoView({ block: "nearest" });
    }
    const rect = el.getBoundingClientRect();
    if (!visible(rect)) return setTarget(null);
    const next = toBox(current.target === "main h1" ? textBox(el) : rect);
    setTarget(prev => (prev && Math.abs(prev.top - next.top) < 1 && Math.abs(prev.left - next.left) < 1 &&
      Math.abs(prev.width - next.width) < 1 && Math.abs(prev.height - next.height) < 1 ? prev : next));
  }, [current.target, current.path, location, step]);
  useMeasure(measure, Boolean(current.target));

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  });

  const last = step === TOUR_STEPS.length - 1;
  const next = useCallback(() => (last ? onClose() : onStep(step + 1)), [last, onClose, onStep, step]);
  const back = useCallback(() => step > 0 && onStep(step - 1), [onStep, step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onClose]);

  useEffect(() => {
    cardRef.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus({ preventScroll: true });
  }, [step]);

  const waiting = Boolean(current.target) && !target && !gaveUp;
  const pad = 6;
  const spot = target && { top: target.top - pad, left: target.left - pad, width: target.width + pad * 2, height: target.height + pad * 2 };
  const width = Math.min(360, window.innerWidth - 32);

  return createPortal(
    <>
      {/* Blocks the app while a step is shown; the tour is the only thing to interact with. */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 1000, background: spot ? "transparent" : "rgba(13,59,46,0.55)" }} />
      {spot && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            zIndex: 1001,
            ...spot,
            borderRadius: 10,
            boxShadow: `0 0 0 2px ${GOLD}, 0 0 0 9999px rgba(13,59,46,0.55)`,
            pointerEvents: "none",
            transition: `all 280ms ${EASE}`,
          }}
        />
      )}
      {!waiting && (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-tour-title"
          aria-describedby="demo-tour-body"
          style={{ ...cardStyle, width, padding: 20, ...placeCard(spot, width, cardHeight) }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED }}>
            Step {step + 1} of {TOUR_STEPS.length}
          </p>
          <h2 id="demo-tour-title" style={{ margin: "6px 0 8px", fontSize: 19, lineHeight: 1.3, fontWeight: 700, color: FOREST }}>
            {current.title}
          </h2>
          <p id="demo-tour-body" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: INK }}>
            {current.body}
          </p>
          <div aria-hidden style={{ display: "flex", gap: 4, margin: "16px 0" }}>
            {TOUR_STEPS.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? FOREST : "#D9DFD8" }} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!last && (
              <button
                type="button"
                onClick={onClose}
                className="demo-focus"
                style={{ background: "none", border: "none", padding: "0 4px", height: 40, color: MUTED, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
              >
                Skip tour
              </button>
            )}
            <span style={{ flex: 1 }} />
            {step > 0 && <Button variant="quiet" onClick={back}>Back</Button>}
            <Button data-primary onClick={next}>{last ? "Start exploring" : step === 0 ? "Start tour" : "Next"}</Button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

type Mark = { key: string; x: number; y: number; info: Explanation };

/** Collects the "?" marks for whatever is on screen right now. */
function collectMarks(path: string): Mark[] {
  const marks: Mark[] = [];
  const seen = new Set<string>();
  const add = (key: string, rect: DOMRect, info: Explanation, x: number, y: number) => {
    if (!visible(rect) || seen.has(key)) return;
    seen.add(key);
    marks.push({ key, x, y, info });
  };

  // An open dialog or menu covers the page; marks over it would be noise.
  if (document.querySelector("[role='dialog'][data-state='open'], [role='menu'][data-state='open']")) return marks;

  // The nav list scrolls inside the sidebar; items scrolled under its
  // header or footer are still "on screen" but must not get a mark.
  const navBounds = document.querySelector("[data-tour='sidebar-nav']")?.getBoundingClientRect();
  document.querySelectorAll<HTMLElement>("[data-tour^='nav-']").forEach(el => {
    const page = el.dataset.tour!.slice(4) as PermissionPage;
    const guide = PAGE_GUIDE[page];
    const label = el.querySelector("span");
    if (!guide || !label) return; // collapsed icon rail: no label, no room
    const rect = el.getBoundingClientRect();
    if (navBounds && (rect.top < navBounds.top || rect.bottom > navBounds.bottom)) return;
    const text = textBox(label);
    add(`nav-${page}`, rect, guide, Math.min(text.right + 8, rect.right - 22), rect.top + rect.height / 2 - 9);
  });

  for (const control of ["farm-switcher", "owner-filter"]) {
    const el = document.querySelector(`[data-tour='${control}']`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    add(control, rect, CONTROL_GUIDE[control], rect.right - 10, rect.top - 6);
  }

  const main = document.querySelector("main");
  if (!main) return marks;

  const heading = main.querySelector("h1");
  const pageInfo = pageForPath(path);
  if (heading && pageInfo) {
    const rect = textBox(heading);
    add("page", rect, pageInfo, rect.right + 8, rect.top + rect.height / 2 - 9);
  }

  main.querySelectorAll("[role='tablist']").forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    add(`tabs-${i}`, rect, TAB_GUIDE, rect.right - 10, rect.top - 8);
  });

  main.querySelectorAll("table").forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    add(`table-${i}`, rect, TABLE_GUIDE, rect.left - 4, rect.top - 14);
  });

  // KPI cards on the dashboard and summary pages.
  main.querySelectorAll("[data-slot='card']").forEach((el, i) => {
    if (i > 7 || el.querySelector("table, [role='tablist'], input, [role='combobox']")) return;
    const rect = el.getBoundingClientRect();
    if (rect.height > 220) return;
    add(`card-${i}`, rect, CARD_GUIDE, rect.right - 22, rect.top + 6);
  });

  main.querySelectorAll<HTMLButtonElement>("button").forEach((el, i) => {
    if (el.closest("tbody, [role='tablist'], [data-slot='card-content'] table")) return;
    const label = el.getAttribute("aria-label") || el.textContent || "";
    const info = explainButton(label);
    if (!info) return;
    const rect = el.getBoundingClientRect();
    add(`btn-${i}-${info.title}`, rect, info, rect.right - 10, rect.top - 8);
  });

  return marks.slice(0, 40);
}

export function HelpMarks() {
  const [location] = useLocation();
  const [marks, setMarks] = useState<Mark[]>([]);
  const [open, setOpen] = useState<Mark | null>(null);
  const signature = useRef("");

  const measure = useCallback(() => {
    const next = collectMarks(location);
    const sig = next.map(m => `${m.key}:${Math.round(m.x)}:${Math.round(m.y)}`).join("|");
    if (sig === signature.current) return;
    signature.current = sig;
    setMarks(next);
  }, [location]);
  useMeasure(measure, true);

  useEffect(() => setOpen(null), [location]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(null);
    const onScroll = () => setOpen(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const width = Math.min(300, window.innerWidth - 32);
  const popover = open && placeCard({ top: open.y, left: open.x, width: 18, height: 18 }, width, 150);

  return createPortal(
    <>
      {marks.map(mark => (
        <button
          key={mark.key}
          type="button"
          aria-label={`What is this: ${mark.info.title}`}
          aria-expanded={open?.key === mark.key}
          onClick={event => {
            event.stopPropagation();
            setOpen(prev => (prev?.key === mark.key ? null : mark));
          }}
          className="demo-focus demo-mark"
          style={{ left: mark.x, top: mark.y }}
        >
          ?
        </button>
      ))}
      {open && popover && (
        <>
          <div aria-hidden onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
          <div role="dialog" aria-labelledby="demo-help-title" style={{ ...cardStyle, zIndex: 999, width, padding: 16, ...popover }}>
            <h2 id="demo-help-title" style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: FOREST }}>{open.info.title}</h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{open.info.body}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <Button variant="quiet" style={{ height: 34 }} onClick={() => setOpen(null)}>Got it</Button>
            </div>
          </div>
        </>
      )}
    </>,
    document.body,
  );
}

export function DemoBar({ helpOn, onToggleHelp, onRestart }: { helpOn: boolean; onToggleHelp: () => void; onRestart: () => void }) {
  const barButton: CSSProperties = {
    height: 36,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid rgba(246,243,234,0.28)",
    background: "transparent",
    color: IVORY,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: FONT,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
  };
  return createPortal(
    <div
      role="region"
      aria-label="Demo controls"
      className="demo-bar"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 997,
        maxWidth: "calc(100vw - 32px)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 8px 8px 16px",
        borderRadius: 12,
        background: FOREST,
        color: IVORY,
        boxShadow: "0 12px 32px rgba(13,59,46,0.35)",
        fontFamily: FONT,
        overflowX: "auto",
      }}
    >
      <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>
        <strong style={{ color: GOLD, fontWeight: 700 }}>Demo</strong>
        <span className="demo-bar-note"> · Sample data, nothing is saved</span>
      </span>
      <button type="button" className="demo-focus-dark" style={barButton} onClick={onRestart}>Restart tour</button>
      <button type="button" className="demo-focus-dark" style={barButton} aria-pressed={helpOn} onClick={onToggleHelp}>
        {helpOn ? "Hide ? marks" : "Show ? marks"}
      </button>
      <a href="/" className="demo-focus-dark" style={{ ...barButton, background: IVORY, color: FOREST, border: "none" }}>Exit demo</a>
    </div>,
    document.body,
  );
}

export const DEMO_STYLES = `
  [data-tour='design-switch'] { display: none !important; }
  .demo-mark {
    position: fixed; z-index: 996; width: 18px; height: 18px; padding: 0;
    border-radius: 999px; border: 1.5px solid #FFFFFF; background: ${GOLD}; color: ${FOREST};
    font: 700 11px/1 ${FONT}; cursor: pointer; display: grid; place-items: center;
    box-shadow: 0 2px 6px rgba(13,59,46,0.3); transition: transform 120ms ${EASE};
  }
  .demo-mark:hover { transform: scale(1.12); }
  .demo-focus:focus-visible, .demo-mark:focus-visible { outline: 2px solid #315E83; outline-offset: 2px; }
  .demo-focus-dark:focus-visible { outline: 2px solid ${IVORY}; outline-offset: 2px; }
  @media (max-width: 640px) { .demo-bar-note { display: none; } }
  /* Phones show the app's bottom tab bar; sit above it instead of covering it. */
  @media (max-width: 767px) { .demo-bar { bottom: calc(env(safe-area-inset-bottom) + 76px) !important; } }
  @media (prefers-reduced-motion: reduce) {
    .demo-mark { transition: none; }
    .demo-mark:hover { transform: none; }
  }
`;
