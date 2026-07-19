import "@fontsource-variable/fraunces/index.css";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { publicConfig } from "@/lib/publicConfig";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const supportEmail =
  publicConfig.supportEmail?.trim() || "support@l-fms.com";
const contactHref = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent("LFMS walkthrough for my farm")}`;

// ─── Palette ─────────────────────────────────────────────────────────────────
// barn-ink #182619 · pasture #2F5233 · tag-amber #FFB300 · wool #F7F5EE ·
// graphite #4A564B — display: Fraunces Variable · data: ui-monospace

const HERD = [
  { id: "EW-0142", weight: 61.4, status: "Pregnant", event: "Scan confirmed twins" },
  { id: "RM-0027", weight: 84.2, status: "Breeding", event: "Joined pen B ewes" },
  { id: "LM-0311", weight: 24.8, status: "Fattening", event: "+2.4 kg this week" },
  { id: "EW-0118", weight: 58.9, status: "Lactating", event: "Weaned two lambs" },
];

const TICKER = [
  "EW-0142 · lambed — twins",
  "LM-0311 · +2.4 kg this week",
  "SH-0113 · clostridial booster given",
  "LM-0086 · moved to fattening",
  "EW-0201 · pregnancy confirmed",
  "KD-0045 · sold — payment received",
  "FEED · barley stock below 3 days",
  "EW-0118 · weaned 2 lambs",
  "RM-0027 · joined breeding pen B",
  "SH-0074 · weighed 71.6 kg",
];

const LIFECYCLE = [
  { step: "Tagged", line: "New head registered with its ear tag, category, and owner." },
  { step: "Weighed", line: "Weight sessions build the growth curve automatically." },
  { step: "Bred", line: "Sire, dam, and joining dates recorded on both records." },
  { step: "Lambed", line: "Lambs arrive already linked to their dam's history." },
  { step: "Fed", line: "Ration plans and stock ledgers track every kilogram." },
  { step: "Vaccinated", line: "Boosters scheduled from the vaccine program, not memory." },
  { step: "Sold", line: "The sale closes the record and lands on the income statement." },
];

const MODULES = [
  { tag: "BRD", name: "Breeding & lambing", line: "Joinings, pregnancies, and lambing logs with dam and sire lineage kept for every birth." },
  { tag: "FED", name: "Feed & rations", line: "Ration plans per category, feed stock ledgers, and low-stock warnings before the trough is empty." },
  { tag: "VAX", name: "Vaccination program", line: "Vaccine schedules with due lists per pen — who is due, who is overdue, who is done." },
  { tag: "WGT", name: "Weights & fattening", line: "Weigh sessions, growth targets, and color-coded progress from weaning to sale weight." },
  { tag: "SAL", name: "Sales & income", line: "Per-animal sales, payment tracking, and an income statement built from the herd itself." },
  { tag: "EXP", name: "Expenses", line: "Farm and company expenses split by category, attributable down to a single head." },
];

const ASSURANCES = [
  { name: "Multi-farm, one company", line: "Run several farms under one roof. Every historical record keeps the farm it happened on." },
  { name: "Roles & permissions", line: "Owners, supervisors, and staff each see exactly what their role allows — per farm." },
  { name: "A full audit trail", line: "Every change is logged with who, when, and what it was before. Mistakes can be reverted." },
  { name: "Arabic and English", line: "The whole system works in both — for the office and for the barn." },
];

function EarTag() {
  const [index, setIndex] = useState(0);
  const weightRef = useRef<HTMLSpanElement>(null);
  const animal = HERD[index];

  useEffect(() => {
    const id = window.setInterval(
      () => setIndex(current => (current + 1) % HERD.length),
      3600,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const node = weightRef.current;
    if (!node) return;
    const counter = { value: Math.max(0, animal.weight - 6) };
    const tween = gsap.to(counter, {
      value: animal.weight,
      duration: 1.1,
      ease: "power2.out",
      onUpdate: () => {
        node.textContent = counter.value.toFixed(1);
      },
    });
    return () => {
      tween.kill();
    };
  }, [animal.weight]);

  return (
    <div className="lp-tag-hang relative mx-auto w-[19rem] select-none sm:w-[21rem]" aria-hidden="true">
      <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-[#0e1810] ring-4 ring-[#324635]" />
      <div className="lp-tag-swing origin-top">
        <div className="lp-tag-shape mt-2 bg-[#FFB300] px-7 pb-8 pt-12 text-[#182619] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.55)]">
          <div className="mx-auto mb-6 h-4 w-4 rounded-full bg-[#182619]/85" />
          <p className="font-mono text-[11px] font-semibold tracking-[0.28em] text-[#182619]/60">
            LIVE RECORD
          </p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-tight">{animal.id}</p>
          <dl className="mt-6 grid gap-3 font-mono text-sm">
            <div className="flex items-baseline justify-between border-t border-[#182619]/20 pt-3">
              <dt className="text-[#182619]/60">Weight</dt>
              <dd className="text-lg font-semibold">
                <span ref={weightRef}>{animal.weight.toFixed(1)}</span> kg
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-[#182619]/20 pt-3">
              <dt className="text-[#182619]/60">Status</dt>
              <dd className="rounded-full bg-[#182619] px-3 py-0.5 text-xs font-semibold text-[#FFB300]">
                {animal.status}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-[#182619]/20 pt-3">
              <dt className="shrink-0 text-[#182619]/60">Last entry</dt>
              <dd className="text-right text-xs leading-5">{animal.event}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.timeline({ defaults: { ease: "power3.out" } })
          .from("[data-hero-line]", { y: 42, opacity: 0, duration: 0.9, stagger: 0.12 })
          .from(".lp-tag-hang", { y: -36, opacity: 0, duration: 1, ease: "bounce.out" }, "-=0.5")
          .from("[data-ticker]", { opacity: 0, duration: 0.6 }, "-=0.4");

        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach(section => {
          gsap.from(section, {
            y: 48,
            opacity: 0,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: { trigger: section, start: "top 82%" },
          });
        });
      });
      return () => media.revert();
    },
    { scope: pageRef },
  );

  return (
    <div ref={pageRef} className="lp-root min-h-dvh bg-[#F7F5EE] text-[#182619]">
      <style>{`
        .lp-root { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
        .lp-display { font-family: "Fraunces Variable", Georgia, serif; font-variation-settings: "SOFT" 60, "WONK" 1; }
        .lp-tag-shape { clip-path: polygon(28% 0, 72% 0, 86% 9%, 100% 22%, 100% 96%, 96% 100%, 4% 100%, 0 96%, 0 22%, 14% 9%); }
        .lp-tag-shape-wide { clip-path: polygon(12% 0, 88% 0, 96% 12%, 100% 26%, 100% 94%, 98% 100%, 2% 100%, 0 94%, 0 26%, 4% 12%); }
        @media (prefers-reduced-motion: no-preference) {
          .lp-tag-swing { animation: lp-swing 5.2s ease-in-out infinite; }
          .lp-ticker-track { animation: lp-ticker 46s linear infinite; }
        }
        @keyframes lp-swing { 0%, 100% { transform: rotate(2.1deg); } 50% { transform: rotate(-2.1deg); } }
        @keyframes lp-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .lp-root a:focus-visible, .lp-root button:focus-visible { outline: 3px solid #FFB300; outline-offset: 3px; }
      `}</style>

      {/* ── Header ── */}
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <p className="lp-display text-xl font-semibold tracking-tight text-[#F7F5EE]">
            LFMS
            <span className="ml-2 hidden font-mono text-[10px] font-normal tracking-[0.3em] text-[#F7F5EE]/50 sm:inline">
              LIVESTOCK FARM MANAGEMENT
            </span>
          </p>
          <a
            href={contactHref}
            className="rounded-full border border-[#F7F5EE]/25 px-5 py-2 text-sm font-medium text-[#F7F5EE] transition-colors hover:border-[#FFB300] hover:text-[#FFB300]"
          >
            Contact us
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="bg-[#182619] text-[#F7F5EE]">
        <div className="mx-auto grid max-w-6xl gap-14 px-6 pb-20 pt-32 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pb-28 lg:pt-40">
          <div>
            <p data-hero-line className="font-mono text-xs font-semibold tracking-[0.32em] text-[#FFB300]">
              HERD SOFTWARE FOR WORKING FARMS
            </p>
            <h1 data-hero-line className="lp-display mt-6 text-5xl font-semibold leading-[1.06] tracking-tight sm:text-6xl lg:text-[4.4rem]">
              From ear tag to
              <br />
              <em className="text-[#FFB300] [font-variation-settings:'SOFT'_100,'WONK'_1,'ital'_1]">income statement.</em>
            </h1>
            <p data-hero-line className="mt-7 max-w-xl text-lg leading-8 text-[#F7F5EE]/75">
              LFMS keeps the working record of your herd — breeding, lambing,
              feed, vaccinations, weights, and sales — for every animal on every
              farm you run.
            </p>
            <div data-hero-line className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href={contactHref}
                className="rounded-full bg-[#FFB300] px-7 py-3.5 text-base font-semibold text-[#182619] transition-transform hover:-translate-y-0.5"
              >
                Book a walkthrough
              </a>
              <a
                href="#modules"
                className="px-2 py-3 text-base font-medium text-[#F7F5EE]/70 underline decoration-[#FFB300]/60 decoration-2 underline-offset-8 transition-colors hover:text-[#F7F5EE]"
              >
                See what it tracks
              </a>
            </div>
          </div>
          <EarTag />
        </div>

        {/* ── Ticker ── */}
        <div data-ticker className="overflow-hidden border-t border-[#F7F5EE]/10 bg-[#131f14] py-3.5" aria-hidden="true">
          <div className="lp-ticker-track flex w-max gap-10 whitespace-nowrap font-mono text-[13px] text-[#F7F5EE]/45">
            {[...TICKER, ...TICKER].map((entry, i) => (
              <span key={i}>
                <span className="mr-10 text-[#FFB300]/70">◆</span>
                {entry}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Statement ── */}
      <section data-reveal className="mx-auto max-w-4xl px-6 py-24 text-center lg:py-32">
        <p className="lp-display text-3xl font-medium leading-snug tracking-tight sm:text-4xl lg:text-[2.75rem]">
          A farm remembers everything
          <br className="hidden sm:block" /> when its software does.
        </p>
        <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#4A564B]">
          Notebooks get wet. Spreadsheets drift. LFMS is a single herd book that
          every worker writes into and every owner can read — from the pen to
          the balance line.
        </p>
      </section>

      {/* ── Lifecycle ── */}
      <section data-reveal className="border-y border-[#182619]/10 bg-[#efece0] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="font-mono text-xs font-semibold tracking-[0.32em] text-[#2F5233]">
            ONE RECORD FOLLOWS THE ANIMAL
          </p>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {LIFECYCLE.map((stage, i) => (
              <div key={stage.step} className="relative border-t-2 border-[#182619]/15 pt-4">
                <span className="absolute -top-[13px] left-0 bg-[#efece0] pr-3 font-mono text-xs font-bold text-[#FFB300]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="lp-display text-xl font-semibold">{stage.step}</h3>
                <p className="mt-2 text-sm leading-6 text-[#4A564B]">{stage.line}</p>
              </div>
            ))}
            <div className="relative border-t-2 border-[#FFB300] pt-4">
              <span className="absolute -top-[15px] left-0 bg-[#efece0] pr-3 font-mono text-sm font-bold text-[#2F5233]">
                ∑
              </span>
              <h3 className="lp-display text-xl font-semibold text-[#2F5233]">The book balances</h3>
              <p className="mt-2 text-sm leading-6 text-[#4A564B]">
                Sold or kept, the history stays — feeding next season's breeding
                and buying decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Modules ── */}
      <section id="modules" data-reveal className="mx-auto max-w-6xl scroll-mt-10 px-6 py-24 lg:py-28">
        <h2 className="lp-display max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          What LFMS tracks
        </h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(module => (
            <article
              key={module.tag}
              className="group rounded-2xl border border-[#182619]/10 bg-white/70 p-7 transition-all hover:-translate-y-1 hover:border-[#FFB300] hover:shadow-[0_18px_44px_-20px_rgba(24,38,25,0.35)]"
            >
              <span className="inline-block rounded-md bg-[#182619] px-2.5 py-1 font-mono text-[11px] font-bold tracking-[0.18em] text-[#FFB300]">
                {module.tag}
              </span>
              <h3 className="lp-display mt-4 text-2xl font-semibold">{module.name}</h3>
              <p className="mt-3 text-[15px] leading-7 text-[#4A564B]">{module.line}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Assurances ── */}
      <section data-reveal className="bg-[#182619] py-24 text-[#F7F5EE]">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="lp-display max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Built for farms that answer to owners
          </h2>
          <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {ASSURANCES.map(item => (
              <div key={item.name} className="border-l-2 border-[#FFB300] pl-6">
                <h3 className="text-lg font-semibold">{item.name}</h3>
                <p className="mt-2 leading-7 text-[#F7F5EE]/65">{item.line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section data-reveal className="mx-auto max-w-6xl px-6 py-24 lg:py-28">
        <div className="lp-tag-shape-wide bg-[#FFB300] px-8 py-16 text-center text-[#182619] sm:px-16">
          <p className="font-mono text-xs font-semibold tracking-[0.32em] text-[#182619]/60">
            NO FORMS. NO TIERS. JUST YOUR FARM.
          </p>
          <h2 className="lp-display mx-auto mt-5 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Walk us through your farm. We'll show you LFMS running on it.
          </h2>
          <a
            href={contactHref}
            className="mt-10 inline-block rounded-full bg-[#182619] px-8 py-4 text-base font-semibold text-[#FFB300] transition-transform hover:-translate-y-0.5"
          >
            {supportEmail}
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#182619]/10 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-[#4A564B]">
          <p className="lp-display text-base font-semibold text-[#182619]">LFMS</p>
          <p className="font-mono text-xs tracking-[0.2em]">EVERY HEAD ACCOUNTED FOR</p>
          <a href={contactHref} className="underline decoration-[#FFB300] decoration-2 underline-offset-4 hover:text-[#182619]">
            {supportEmail}
          </a>
        </div>
      </footer>
    </div>
  );
}
