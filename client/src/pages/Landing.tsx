import "@fontsource-variable/manrope/index.css";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  Building2,
  Heart,
  History,
  Languages,
  Receipt,
  Scale,
  ShieldCheck,
  Syringe,
  Wallet,
  Wheat,
} from "lucide-react";
import { publicConfig } from "@/lib/publicConfig";
import apisLogoReversed from "@/assets/brand/apis-horizontal-reversed.svg";
import apisLogoFullColor from "@/assets/brand/apis-horizontal-full-color.svg";
import apisSealReversed from "@/assets/brand/apis-symbol-reversed.svg";

gsap.registerPlugin(CustomEase, ScrollTrigger, useGSAP);
// Brand motion curve: cubic-bezier(0.2, 0, 0, 1).
CustomEase.create("apis", "0.2,0,0,1");

const supportEmail =
  publicConfig.supportEmail?.trim() || "support@apiseg.com";
const contactHref = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent("APIS walkthrough for my farm")}`;

// ─── Brand palette (APIS Brand Guidelines 1.0) ──────────────────────────────
// forest #0D3B2E · solar gold #C9973B · warm ivory #F6F3EA · ink #17251D ·
// soft sage #DAE6DD · muted green #58675F · stone line #D9DFD8
// Type: Manrope. Gold is an accent only; it never carries status on its own.

const VALUES = [
  { name: "Clarity", line: "The next task, record and decision are easy to understand." },
  { name: "Care", line: "Animals and the people who manage them are treated with respect." },
  { name: "Traceability", line: "Every event stays connected to its animal and to its farm." },
];

const LIFECYCLE = [
  { step: "Registered", line: "Each animal gets its ID, category and owner on day one." },
  { step: "Weighed", line: "Weight sessions build the growth record automatically." },
  { step: "Bred", line: "Sire, dam and joining dates are recorded on both records." },
  { step: "Born", line: "Newborns start out linked to their dam's history." },
  { step: "Fed", line: "Ration plans and stock ledgers track every kilogram." },
  { step: "Vaccinated", line: "Boosters follow the vaccine program, with due lists per pen." },
  { step: "Sold", line: "The sale closes the record and appears in the income statement." },
];

const MODULES = [
  { icon: Heart, name: "Breeding and pregnancy", line: "Joinings, pregnancy checks and birth records, with dam and sire lineage for every animal." },
  { icon: Wheat, name: "Feeding", line: "Ration plans per group, feed stock ledgers, and a warning before stock runs low." },
  { icon: Syringe, name: "Vaccination", line: "Vaccine schedules with due lists per pen: due today, overdue and recorded." },
  { icon: Scale, name: "Weights and fattening", line: "Weigh sessions and growth targets from weaning to sale weight." },
  { icon: Receipt, name: "Sales and income", line: "Per-animal sales, payment tracking and an income statement built from your records." },
  { icon: Wallet, name: "Expenses", line: "Farm and company expenses by category, down to a single animal." },
];

const ASSURANCES = [
  { icon: Building2, name: "Several farms, one company", line: "Run every farm in one place. Each record keeps the farm it happened on." },
  { icon: ShieldCheck, name: "Roles and permissions", line: "Owners, supervisors and staff see what their role allows, farm by farm." },
  { icon: History, name: "A complete audit trail", line: "Every change records who made it, when, and the previous value." },
  { icon: Languages, name: "Arabic and English", line: "The whole system works in both languages, in the office and in the pen." },
];

const TASKS = [
  { id: "BRQ-014", task: "Vaccination record", due: "Today", state: "due" },
  { id: "G-022", task: "Weight check", due: "Today", state: "due" },
  { id: "C-008", task: "Pregnancy check", due: "26/10/2026", state: "upcoming" },
] as const;

const SPECIES = [
  { name: "Sheep", count: 180 },
  { name: "Goats", count: 48 },
  { name: "Cattle", count: 20 },
];

/** Large open arcs cropped by an edge: the brand's framing device. */
function CroppedArcs({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 600"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {[140, 210, 280].map(radius => (
        <circle key={radius} cx="300" cy="300" r={radius} stroke="currentColor" strokeWidth="1.2" />
      ))}
    </svg>
  );
}

// The APIS favicon is the site default (client/index.html), so only the
// title needs setting here.
function useLandingDocumentBranding() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "APIS · Livestock management, clearly";
    return () => {
      document.title = previousTitle;
    };
  }, []);
}

function ProductPreview() {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      {/* Animal record */}
      <article className="rounded-2xl border border-[#D9DFD8] bg-white p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#58675F]">Animal record</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[2rem] font-bold leading-10 tracking-tight" dir="ltr">BRQ-014</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4ED] px-3 py-1 text-sm font-semibold text-[#256B4A]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#256B4A]" aria-hidden="true" />
            Active record
          </span>
        </div>
        <p className="mt-1 text-[#58675F]">Barqi ewe / Female</p>
        <dl className="mt-6 divide-y divide-[#D9DFD8] border-y border-[#D9DFD8]">
          {[
            ["Latest weight", "50.0 kg"],
            ["Breeding event", "12/09/2026"],
            ["Health entries", "3 records"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between py-3.5">
              <dt className="text-[#58675F]">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </article>

      {/* Farm overview */}
      <article className="rounded-2xl border border-[#D9DFD8] bg-white p-6 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#58675F]">Upcoming tasks</p>
          <p className="text-sm text-[#58675F]">Sunday, 25 October 2026</p>
        </div>
        <table className="mt-4 w-full text-left">
          <thead>
            <tr className="border-b border-[#D9DFD8] text-xs uppercase tracking-[0.12em] text-[#58675F]">
              <th scope="col" className="pb-2 font-semibold">Animal</th>
              <th scope="col" className="pb-2 font-semibold">Task</th>
              <th scope="col" className="pb-2 text-right font-semibold">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9DFD8]">
            {TASKS.map(row => (
              <tr key={row.id}>
                <td className="whitespace-nowrap py-3 pr-3 font-semibold" dir="ltr">{row.id}</td>
                <td className="py-3 text-[#58675F]">{row.task}</td>
                <td className="whitespace-nowrap py-3 pl-2 text-right">
                  {row.state === "due" ? (
                    <span className="rounded-full bg-[#FFF2D6] px-2.5 py-0.5 text-sm font-semibold text-[#855B18]">
                      {row.due}
                    </span>
                  ) : (
                    <span className="tabular-nums text-[#17251D]">{row.due}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[#D9DFD8] pt-5">
          {SPECIES.map(item => (
            <div key={item.name} className="rounded-xl bg-[#F6F3EA] px-3 py-3 sm:px-4">
              <p className="text-sm text-[#58675F]">{item.name}</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">{item.count}</p>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

export default function Landing() {
  const pageRef = useRef<HTMLDivElement>(null);
  useLandingDocumentBranding();

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        // One calm entrance; the seal fades in once and then stays still.
        gsap.timeline({ defaults: { ease: "apis" } })
          .from("[data-hero-line]", { y: 24, opacity: 0, duration: 0.6, stagger: 0.08 })
          .from("[data-hero-seal]", { opacity: 0, scale: 0.96, duration: 0.8 }, "-=0.45");

        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach(section => {
          gsap.from(section, {
            y: 24,
            opacity: 0,
            duration: 0.5,
            ease: "apis",
            scrollTrigger: { trigger: section, start: "top 85%", once: true },
          });
        });
      });
      return () => media.revert();
    },
    { scope: pageRef },
  );

  return (
    <div ref={pageRef} className="lp-root min-h-dvh bg-[#F6F3EA] text-[#17251D]">
      <style>{`
        .lp-root { font-family: "Manrope Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
        .lp-root a, .lp-root button { transition: background-color 120ms cubic-bezier(0.2, 0, 0, 1), color 120ms cubic-bezier(0.2, 0, 0, 1), border-color 120ms cubic-bezier(0.2, 0, 0, 1); }
        .lp-root a:focus-visible, .lp-root button:focus-visible { outline: 2px solid #315E83; outline-offset: 2px; }
        .lp-dark a:focus-visible, .lp-dark button:focus-visible { outline-color: #F6F3EA; }
      `}</style>

      {/* ── Hero ── */}
      <section className="lp-dark relative overflow-hidden bg-[#0D3B2E] text-[#F6F3EA]">
        <CroppedArcs className="pointer-events-none absolute -right-48 top-1/2 h-[46rem] w-[46rem] -translate-y-1/2 text-[#F6F3EA]/10 sm:-right-40 lg:-right-24" />

        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:py-6">
          <img src={apisLogoReversed} alt="APIS" width={160} height={61} className="h-auto w-[124px] sm:w-[160px]" />
          <a
            href={contactHref}
            className="inline-flex h-10 items-center rounded-lg border border-[#F6F3EA]/30 px-4 text-sm font-semibold sm:h-11 sm:px-5 hover:border-[#F6F3EA] hover:bg-[#F6F3EA]/5"
          >
            Contact us
          </a>
        </header>

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 pb-14 pt-8 sm:pb-24 sm:pt-12 lg:grid-cols-[1.2fr_0.8fr] lg:pb-32 lg:pt-20">
          <div>
            <p data-hero-line className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C9973B]">
              Livestock management, clearly.
            </p>
            <h1 data-hero-line className="mt-5 text-[2.75rem] sm:mt-6 sm:text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-[4rem]">
              Every animal.
              <br />
              Every detail.
            </h1>
            <p data-hero-line className="mt-5 max-w-xl text-base leading-7 text-[#DAE6DD] sm:mt-6 sm:text-lg sm:leading-8">
              APIS brings individual animal records and daily farm operations
              into one connected view: feeding, breeding, pregnancy,
              vaccination and sales, for every farm you run.
            </p>
            <div data-hero-line className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <a
                href="/demo"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-[#F6F3EA] px-6 text-base font-semibold text-[#0D3B2E] hover:bg-white"
              >
                Take the walkthrough
              </a>
              <a
                href="#modules"
                className="inline-flex h-12 items-center justify-center rounded-lg px-4 text-base font-semibold text-[#DAE6DD] underline decoration-[#C9973B] decoration-2 underline-offset-8 hover:text-[#F6F3EA]"
              >
                See what APIS tracks
              </a>
            </div>
          </div>

          <div data-hero-seal className="mx-auto hidden w-full max-w-[22rem] sm:block lg:max-w-none">
            <img
              src={apisSealReversed}
              alt=""
              width={1254}
              height={1254}
              className="mx-auto h-auto w-[min(100%,22rem)]"
            />
          </div>
        </div>
      </section>

      {/* ── Foundations ── */}
      <section data-reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-24 lg:py-28">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#58675F]">Why APIS</p>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Clear records. Confident farm decisions.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#58675F] sm:text-lg sm:leading-8">
            Notebooks get wet and spreadsheets drift. APIS is one record that
            every worker writes into and every owner can read, from the pen to
            the income statement.
          </p>
        </div>
        <div className="mt-10 grid gap-6 sm:mt-14 sm:grid-cols-3 sm:gap-10">
          {VALUES.map((value, i) => (
            <div key={value.name} className="border-t border-[#D9DFD8] pt-5">
              <p className="text-sm font-semibold tabular-nums text-[#58675F]">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-xl font-semibold">{value.name}</h3>
              <p className="mt-2 leading-6 text-[#58675F] sm:leading-7">{value.line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Lifecycle ── */}
      <section data-reveal className="border-y border-[#D9DFD8] bg-[#DAE6DD]/45 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            From the first record to the final sale.
          </h2>
          <ol className="mt-10 grid grid-cols-2 gap-x-5 gap-y-7 sm:mt-12 sm:gap-x-8 sm:gap-y-10 lg:grid-cols-4">
            {LIFECYCLE.map((stage, i) => (
              <li key={stage.step} className="border-t-2 border-[#0D3B2E]/15 pt-4">
                <p className="text-sm font-semibold tabular-nums text-[#58675F]">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-1 text-lg font-semibold sm:text-xl">{stage.step}</h3>
                <p className="mt-1.5 text-sm leading-[1.4rem] text-[#58675F] sm:mt-2 sm:text-[15px] sm:leading-6">{stage.line}</p>
              </li>
            ))}
            <li className="border-t-2 border-[#0D3B2E] pt-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#0D3B2E]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#C9973B]" aria-hidden="true" />
                Kept
              </p>
              <h3 className="mt-1 text-lg font-semibold text-[#0D3B2E] sm:text-xl">The history stays</h3>
              <p className="mt-1.5 text-sm leading-[1.4rem] text-[#58675F] sm:mt-2 sm:text-[15px] sm:leading-6">
                Sold or kept, the record remains and informs next season's
                breeding and buying.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* ── Modules ── */}
      <section id="modules" data-reveal className="mx-auto max-w-6xl scroll-mt-8 px-6 py-16 sm:py-24 lg:py-28">
        <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          What APIS tracks
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#58675F] sm:text-lg sm:leading-8">
          Track feeding, breeding and daily records in one place.
        </p>
        <div className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {MODULES.map(({ icon: Icon, name, line }) => (
            <article key={name} className="flex gap-4 rounded-2xl border border-[#D9DFD8] bg-white p-5 sm:block sm:p-7">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DAE6DD] text-[#0D3B2E]">
                <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-semibold sm:mt-5 sm:text-xl">{name}</h3>
                <p className="mt-1 text-[15px] leading-6 text-[#58675F] sm:mt-2 sm:text-base sm:leading-7">{line}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Product preview ── */}
      <section data-reveal className="border-t border-[#D9DFD8] py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Keep the animal and the action in view.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#58675F] sm:text-lg sm:leading-8">
              Every record shows its ID, units and dates. Tasks due today are
              labeled, never signaled by color alone.
            </p>
          </div>
          <div className="mt-8 sm:mt-12">
            <ProductPreview />
          </div>
          <p className="mt-4 text-sm text-[#58675F]">Sample records for illustration.</p>
        </div>
      </section>

      {/* ── Assurances ── */}
      <section data-reveal className="lp-dark bg-[#0D3B2E] py-16 text-[#F6F3EA] sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Built for farms that answer to owners.
          </h2>
          <div className="mt-10 grid gap-x-12 gap-y-8 sm:mt-12 sm:grid-cols-2 sm:gap-y-10">
            {ASSURANCES.map(({ icon: Icon, name, line }) => (
              <div key={name} className="flex gap-4 sm:gap-5">
                <Icon size={24} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[#C9973B]" aria-hidden="true" />
                <div>
                  <h3 className="text-lg font-semibold">{name}</h3>
                  <p className="mt-2 leading-7 text-[#DAE6DD]">{line}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section data-reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-24 lg:py-28">
        <div className="lp-dark relative overflow-hidden rounded-3xl bg-[#0D3B2E] px-6 py-12 text-[#F6F3EA] sm:px-16 sm:py-16">
          <CroppedArcs className="pointer-events-none absolute -bottom-72 -right-56 h-[40rem] w-[40rem] text-[#F6F3EA]/10" />
          <span className="absolute right-5 top-5 h-6 w-6 rounded-full bg-[#C9973B] sm:right-16 sm:top-14 sm:h-10 sm:w-10" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-[1.1]">
              Your farm, in view.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#DAE6DD] sm:mt-5 sm:text-lg sm:leading-8">
              Try APIS on a sample farm now, or talk to us and we'll set it
              up with your own records.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <a
                href="/demo"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-[#F6F3EA] px-6 text-base font-semibold text-[#0D3B2E] hover:bg-white"
              >
                Take the walkthrough
              </a>
              <a
                href={contactHref}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-[#F6F3EA]/30 px-6 text-base font-semibold hover:border-[#F6F3EA] hover:bg-[#F6F3EA]/5"
              >
                Talk to us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#D9DFD8] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-6 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-6 text-[#58675F]">
          <img src={apisLogoFullColor} alt="APIS" width={160} height={61} className="h-auto w-[160px]" />
          <p className="font-semibold text-[#0D3B2E]">Every animal. Every detail.</p>
          <a
            href={contactHref}
            className="underline decoration-[#C9973B] decoration-2 underline-offset-4 hover:text-[#17251D]"
          >
            {supportEmail}
          </a>
        </div>
      </footer>
    </div>
  );
}
