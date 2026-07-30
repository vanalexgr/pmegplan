import Link from "next/link";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Crosshair,
  Layers3,
  Ruler,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-1 flex-col bg-[#edf2ef]">
      <nav className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#0a2633] text-[#ff8a72]">
            <Crosshair className="size-4" strokeWidth={2.6} />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-[#0a2633]">
              PMEGplan
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#5c706f]">
              Dimensional planning
            </p>
          </div>
        </div>
        <Link
          href="/planner"
          className="flex items-center gap-2 text-xs font-semibold text-[#0a2633]"
        >
          Open workspace <ArrowRight className="size-3.5" />
        </Link>
      </nav>

      <section className="mx-auto grid w-full max-w-[1500px] flex-1 gap-6 px-5 pb-6 sm:px-8 lg:grid-cols-[0.84fr_1.16fr]">
        <div className="flex min-h-[610px] flex-col justify-between rounded-[32px] bg-[#0a2633] p-7 text-white shadow-[0_30px_90px_-45px_rgba(7,30,43,0.75)] sm:p-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-px w-8 bg-[#ff8a72]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ffab98]">
                From template transfer to spatial guidance
              </p>
            </div>
            <h1 className="mt-8 max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-balance sm:text-6xl">
              See the graft. Select a vessel. Mark from what is physically there.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/56">
              A scan-informed PMEG reconstruction turns every fenestration into
              a set of ruler-ready distances—from fabric edge, strut apices,
              valleys, device datum, and adjacent openings.
            </p>
          </div>

          <div>
            <Link href="/planner">
              <Button
                size="lg"
                className="h-12 rounded-xl bg-[#ff8a72] px-5 text-[#0a2633] hover:bg-[#ff9b86]"
              >
                Open the measurement cockpit
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-3 text-emerald-300" />
                Multi-anchor verification
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-3 text-emerald-300" />
                Device-specific lattice
              </span>
            </div>
          </div>
        </div>

        <div className="grid min-h-[610px] gap-4 sm:grid-cols-2 sm:grid-rows-[1.15fr_0.85fr]">
          <div className="relative col-span-full overflow-hidden rounded-[32px] border border-[#cddbd6] bg-[#dfe9e5] p-6 sm:p-8">
            <div className="relative z-10 max-w-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#687b78]">
                Interactive reconstruction
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#0a2633]">
                One hole. Eight independent measurements.
              </h2>
            </div>

            <div className="absolute -bottom-24 right-[-62px] h-[430px] w-[360px] rounded-[48%] border border-[#789a99]/35 bg-[linear-gradient(90deg,rgba(255,255,255,0.18),rgba(34,82,88,0.1))] shadow-[inset_32px_0_60px_rgba(255,255,255,0.25)]">
              {[48, 106, 164, 222, 280].map((top, rowIndex) => (
                <div
                  key={top}
                  className="absolute left-8 right-8 h-16"
                  style={{ top }}
                >
                  {Array.from({ length: 7 }).map((_, index) => (
                    <span
                      key={`${rowIndex}-${index}`}
                      className="absolute h-px w-14 origin-left bg-[#446d70]/50"
                      style={{
                        left: index * 42,
                        top: index % 2 === 0 ? 7 : 47,
                        transform: `rotate(${index % 2 === 0 ? 42 : -42}deg)`,
                      }}
                    />
                  ))}
                </div>
              ))}
              <span className="absolute left-[82px] top-[138px] flex size-12 items-center justify-center rounded-full border-4 border-[#ffd1c6] bg-[#ff8a72] font-mono text-sm font-semibold text-[#0a2633] shadow-[0_0_0_12px_rgba(255,138,114,0.18)]">
                1
              </span>
              <span className="absolute right-[88px] top-[244px] flex size-10 items-center justify-center rounded-full border-4 border-white/60 bg-[#edf7f4] font-mono text-xs font-semibold text-[#0a2633]">
                2
              </span>
            </div>

            <div className="absolute bottom-6 left-6 z-10 flex gap-2 sm:left-8">
              {["Edge 12.0", "Apex 8.6", "Valley 7.4"].map((label) => (
                <span
                  key={label}
                  className="rounded-lg border border-[#aabfba] bg-white/55 px-2.5 py-1.5 font-mono text-[9px] text-[#365553] backdrop-blur"
                >
                  {label} mm
                </span>
              ))}
            </div>
          </div>

          {[
            {
              icon: <Ruler className="size-4" />,
              eyebrow: "Back-table speed",
              title: "Ruler-first marking",
              body: "A short sequence establishes the axial datum, triangulates within a strut bay, and cross-checks against the next opening.",
            },
            {
              icon: <Layers3 className="size-4" />,
              eyebrow: "Geometry fidelity",
              title: "Landmarks, not abstractions",
              body: "The fabric edge, real lattice phase, strut apices, valleys, seam datum, and every vessel opening stay in one coordinate system.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="flex flex-col justify-between rounded-[28px] border border-[#cddbd6] bg-white/65 p-6"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-full bg-[#0a2633] text-[#ff8a72]">
                  {item.icon}
                </span>
                <Box className="size-4 text-[#90a39f]" />
              </div>
              <div className="mt-10">
                <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#798c89]">
                  {item.eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#0a2633]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#607370]">
                  {item.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 pb-7 pt-1 text-[10px] text-[#72837f] sm:px-8">
        <p>Planning support · not a substitute for physician verification</p>
        <p className="font-mono uppercase tracking-[0.14em]">
          Source geometry → vessel plan → back-table guidance
        </p>
      </footer>
    </main>
  );
}
