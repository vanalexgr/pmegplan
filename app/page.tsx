import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-10 overflow-hidden rounded-[40px] border border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(230,241,237,0.88))] px-6 py-8 shadow-[0_36px_120px_-52px_rgba(7,31,28,0.5)] lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-12">
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[color:var(--brand)]">
            PMEGplan.io
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-balance text-[color:var(--foreground)] sm:text-6xl">
            Physician-facing PMEG planning with rotational conflict analysis built in.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-[color:var(--muted-foreground)]">
            Compare Zenith Alpha, TREO, Endurant II, and Excluder in one workspace,
            scan the full circumference for conflict-free windows, and export a
            printable punch card sized for back-table use.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/planner">
              <Button size="lg">Open planner</Button>
            </Link>
            <a href="#scope">
              <Button size="lg" variant="outline">
                Review MVP scope
              </Button>
            </a>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Strut conflict engine", "Segment-based cylindrical distance checks for each fenestration."],
            ["Rotation optimisation", "0.1 mm circumferential scan with valid window detection."],
            ["Punch-card export", "Print-ready device templates generated from the same geometry model."],
            ["Ranked recommendations", "Conflict-free devices rise first, then wider windows and better clearance."],
          ].map(([title, body]) => (
            <Card key={title} className="bg-white/80">
              <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                {body}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="scope" className="grid gap-5 lg:grid-cols-3">
        {[
          ["Input", "Capture neck diameter, target vessel clocks, depths, and fenestration dimensions for up to four vessels."],
          ["Analysis", "Auto-select graft size per device, generate strut geometry, score conflicts at baseline and optimal rotation."],
          ["Export", "Preview punch cards in-browser, open a print layout, or download single-device and bundled PDF exports."],
        ].map(([title, body]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-[color:var(--muted-foreground)]">
              {body}
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
