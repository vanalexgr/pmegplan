"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Printer,
  RotateCw,
  Ruler,
  ScanLine,
} from "lucide-react";

import { GraftModel3D } from "@/components/GraftModel3D";
import { PunchCard } from "@/components/PunchCard";
import { UnrolledGraftCanvas } from "@/components/UnrolledGraftCanvas";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
  MIN_SEAL_BELOW_SCALLOP_MM,
  scallopHeightMm,
  scallopSeparationMm,
} from "@/lib/planning/anatomy";
import type { AnatomyCase, AnatomyVessel } from "@/lib/planning/anatomy";
import type { CtScanId } from "@/lib/ctDeviceCatalog";
import {
  oversizeWarning,
  planGraft,
  type GraftModel,
  type PlanResult,
} from "@/lib/planning/plan";
import {
  measureHole,
  type HoleGap,
  type StrutLandmark,
} from "@/lib/planning/holeMeasurements";
import { cn } from "@/lib/utils";

/**
 * The splanchnic chain, fixed and in anatomic order. The surgeon measures gaps
 * along this chain rather than choosing which vessels exist, because a chain
 * with a vessel silently missing changes every downstream distance.
 */
/** Extra axial height an egg-shaped opening carries over a round one, in mm. */
const EGG_EXTRA_HEIGHT_MM = 2;

const CHAIN: Array<{ name: string; label: string; defaultOstiumMm: number }> = [
  { name: "CELIAC", label: "Coeliac", defaultOstiumMm: 8 },
  { name: "SMA", label: "SMA", defaultOstiumMm: 9 },
  { name: "RRA", label: "Right renal", defaultOstiumMm: 6 },
  { name: "LRA", label: "Left renal", defaultOstiumMm: 6 },
];

interface VesselEntry {
  name: string;
  label: string;
  gapFromPreviousMm: string;
  clock: string;
  ostiumDiameterMm: string;
  treatment: "fenestrate" | "scallop" | "preserve";
  /**
   * Egg-shaped openings are taller than they are wide, which some prefer for
   * the easier cannulation the longer axial opening gives. Offered per vessel
   * because whether it fits is a question the solver answers, not a preference
   * that can be applied blindly.
   */
  shape: "round" | "egg";
}

function initialEntries(): VesselEntry[] {
  return [
    { ...blank(CHAIN[0]), gapFromPreviousMm: "0", clock: "12:00", treatment: "fenestrate" as const, shape: "round" as const },
    { ...blank(CHAIN[1]), gapFromPreviousMm: "18", clock: "12:30", treatment: "fenestrate" as const, shape: "round" as const },
    { ...blank(CHAIN[2]), gapFromPreviousMm: "24", clock: "9:00", treatment: "fenestrate" as const, shape: "round" as const },
    { ...blank(CHAIN[3]), gapFromPreviousMm: "5", clock: "3:30", treatment: "fenestrate" as const, shape: "round" as const },
  ];
}

function blank(vessel: (typeof CHAIN)[number]): VesselEntry {
  return {
    name: vessel.name,
    label: vessel.label,
    gapFromPreviousMm: "",
    clock: "12:00",
    ostiumDiameterMm: String(vessel.defaultOstiumMm),
    treatment: "preserve" as const,
    shape: "round" as const,
  };
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildCase(
  entries: VesselEntry[],
  sealZoneDiameterMm: string,
  proximalLandingLengthMm: string,
): AnatomyCase | { error: string } {
  const vessels: AnatomyVessel[] = [];

  for (const [index, entry] of entries.entries()) {
    const gap = index === 0 ? 0 : toNumber(entry.gapFromPreviousMm);
    if (Number.isNaN(gap)) {
      return { error: `Distance above ${entry.label} is not a number.` };
    }
    const ostium = toNumber(entry.ostiumDiameterMm);
    if (Number.isNaN(ostium) || ostium <= 0) {
      return { error: `${entry.label} ostium diameter is not a number.` };
    }

    vessels.push({
      name: entry.name,
      gapFromPreviousMm: gap,
      clock: entry.treatment === "preserve" ? undefined : entry.clock,
      ostiumDiameterMm: ostium,
      ...(entry.shape === "egg"
        ? {
            // The reference plans cut 6 x 8 mm renal fenestrations: the same
            // width as the ostium, 2 mm longer axially.
            openingWidthMm: ostium,
            openingHeightMm: ostium + EGG_EXTRA_HEIGHT_MM,
          }
        : {}),
    });
  }

  const diameter = toNumber(sealZoneDiameterMm);
  if (Number.isNaN(diameter) || diameter <= 0) {
    return { error: "Seal-zone aortic diameter is not a number." };
  }

  const landing = toNumber(proximalLandingLengthMm);
  if (Number.isNaN(landing) || landing <= 0) {
    return { error: "Healthy aorta above the top vessel is not a number." };
  }

  return {
    clockConvention: "axial_ct",
    vessels,
    fenestrate: entries
      .filter((entry) => entry.treatment === "fenestrate")
      .map((entry) => entry.name),
    scallop: entries
      .filter((entry) => entry.treatment === "scallop")
      .map((entry) => entry.name),
    aorta: {
      sealZoneDiameterMm: diameter,
      proximalLandingLengthMm: landing,
    },
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-[11px] leading-4 text-[color:var(--muted-foreground)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function StatusBanner({ plan }: { plan: PlanResult }) {
  if (!plan.ok) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">This case cannot be planned as entered.</p>
          <p className="mt-1 leading-5">{plan.reason}</p>
        </div>
      </div>
    );
  }

  const { solution, depthLimit } = plan;

  if (solution.status === "seal_zone_too_short") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">
            No room for a {MIN_PROXIMAL_FENESTRATION_DEPTH_MM} mm seal.
          </p>
          <p className="mt-1 leading-5">
            {depthLimit.limitingVesselName
              ? `The ${depthLimit.limitingVesselName} sits only ${depthLimit.maxDepthMm.toFixed(1)} mm above the first fenestration, so keeping it perfused leaves too little fabric above to seal.`
              : `Only ${depthLimit.maxDepthMm.toFixed(1)} mm of landing is available above the first fenestration.`}
          </p>
          {depthLimit.limitingVesselName ? (
            <p className="mt-2 leading-5">
              A closed fenestration is what will not fit here. Scalloping the{" "}
              {depthLimit.limitingVesselName}, or landing the graft below it,
              are the configurations this anatomy leaves — neither of which this
              planner can lay out yet.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (solution.status === "scallop_seal_too_short") {
    const scalloped = plan.anatomy.scalloped;
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">
            Too little fabric below the {scalloped?.name} scallop to seal.
          </p>
          <p className="mt-1 leading-5">
            A scallop cuts the fabric edge, so the seal comes from the fabric
            beneath it — and this anatomy leaves only{" "}
            {scallopSeparationMm(plan.anatomy)?.toFixed(1)} mm before the next
            opening, against the {MIN_SEAL_BELOW_SCALLOP_MM} mm needed. No
            push-in can create fabric the vessels do not leave.
          </p>
        </div>
      </div>
    );
  }

  if (solution.status === "graft_too_short") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          No scanned device has enough fabric for a{" "}
          {plan.anatomy.fenestrationSpanMm.toFixed(0)} mm pattern with a{" "}
          {MIN_PROXIMAL_FENESTRATION_DEPTH_MM} mm seal above it.
        </p>
      </div>
    );
  }

  if (solution.marginMm <= 0) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">No conflict-free pose exists on this device.</p>
          <p className="mt-1 leading-5">
            The best available pose still overlaps wire by{" "}
            {Math.abs(solution.marginMm).toFixed(2)} mm. The pattern is rigid, so
            this cannot be fixed by moving one hole.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-sm",
        solution.meetsTargetClearance
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-amber-300 bg-amber-50 text-amber-900",
      )}
    >
      {solution.meetsTargetClearance ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Info className="mt-0.5 size-4 shrink-0" />
      )}
      <div>
        <p className="font-semibold">
          {solution.meetsTargetClearance
            ? "Conflict-free with margin to spare."
            : "Conflict-free, but tight."}
        </p>
        <p className="mt-1 leading-5">
          Every opening lands in fabric. The worst clears wire by{" "}
          {solution.marginMm.toFixed(2)} mm — which is also how far the whole
          pattern can drift before any hole touches a strut.
        </p>
        {solution.excludedByTurnCap ? (
          <p className="mt-2 leading-5">
            A {solution.excludedByTurnCap.rotationDeg.toFixed(0)}° turn would clear{" "}
            {solution.excludedByTurnCap.marginMm.toFixed(2)} mm at{" "}
            {solution.excludedByTurnCap.proximalDepthMm.toFixed(1)} mm depth, but
            was rejected as too large a rotation to deploy reliably.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Distance from the solved fabric edge to the vessel that caps the push-in.
 *
 * The clearance margin measures room against wire, not against anatomy. A pose
 * solved right at the limit clears every strut and still covers the preserved
 * vessel if the graft lands a millimetre high, so the two have to be reported
 * separately.
 */
const TIGHT_TO_LIMIT_MM = 2;

function LimitNotice({ plan }: { plan: Extract<PlanResult, { ok: true }> }) {
  const { depthLimit, solution } = plan;
  if (!depthLimit.limitingVesselName || !Number.isFinite(depthLimit.maxDepthMm)) {
    return null;
  }

  const headroomMm = depthLimit.maxDepthMm - solution.pose.proximalDepthMm;
  if (headroomMm > TIGHT_TO_LIMIT_MM) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">
          The fabric edge sits {headroomMm < 0.05 ? "on" : `${headroomMm.toFixed(1)} mm below`}{" "}
          the {depthLimit.limitingVesselName} ostium.
        </p>
        <p className="mt-1 leading-5">
          This pose uses the whole seal zone the {depthLimit.limitingVesselName}{" "}
          allows. Deploying even slightly high covers it. The{" "}
          {solution.marginMm.toFixed(2)} mm clearance above is room against wire,
          not against this vessel.
        </p>
      </div>
    </div>
  );
}

function Readout({ plan }: { plan: Extract<PlanResult, { ok: true }> }) {
  const { solution, graft, anatomy, oversizeFraction } = plan;
  const { scan } = graft;
  const scallopHeight = scallopHeightMm(anatomy, solution.pose);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric
        icon={<Ruler className="size-4" />}
        label="Push in from fabric edge"
        value={`${solution.pose.proximalDepthMm.toFixed(1)} mm`}
        detail={`first hole = ${anatomy.fenestrations[0]?.name ?? "—"}`}
      />
      <Metric
        icon={<RotateCw className="size-4" />}
        label="Rotate graft"
        value={`${Math.abs(solution.pose.rotationDeg).toFixed(1)}° ${
          solution.pose.rotationDeg === 0
            ? ""
            : solution.pose.rotationDeg > 0
              ? "CW"
              : "CCW"
        }`.trim()}
        detail="applied to the whole pattern"
      />
      <Metric
        icon={<ScanLine className="size-4" />}
        label="Scanned device"
        value={graft.naming.code ?? scan.platform.shortLabel}
        detail={`${graft.naming.size} · ${(oversizeFraction * 100).toFixed(
          0,
        )}% oversize · ${scan.reference.id.toUpperCase()}`}
        warning={oversizeWarning(
          plan.considered.find(
            (fit) => fit.model.scan.reference.id === plan.selectedScanId,
          )!,
        )}
      />
      {scallopHeight !== null ? (
        <Metric
          label={`${anatomy.scalloped?.name} scallop`}
          value={`${scallopHeight.toFixed(1)} mm`}
          detail={`cut from the fabric edge · ${scallopSeparationMm(anatomy)?.toFixed(1)} mm sealing below it`}
        />
      ) : null}
      <Metric
        label="Worst clearance"
        value={`${solution.marginMm.toFixed(2)} mm`}
        detail="on directly measured bench-CT geometry"
      />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  warning,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  warning?: string | null;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white/70 p-4",
        warning
          ? "border-amber-300 bg-amber-50/70"
          : "border-[color:var(--border)]",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-[color:var(--muted-foreground)]">
        {detail}
      </p>
      {warning ? (
        <p className="mt-1.5 text-[11px] font-semibold leading-4 text-amber-800">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

export function PmegPlanner() {
  const [entries, setEntries] = useState<VesselEntry[]>(initialEntries);
  const [sealZoneDiameterMm, setSealZoneDiameterMm] = useState("36");
  const [proximalLandingLengthMm, setProximalLandingLengthMm] = useState("25");
  const [view, setView] = useState<"flat" | "model">("model");
  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);
  const [showPunchCard, setShowPunchCard] = useState(false);
  // Null means take the planner's recommendation.
  const [preferredScanId, setPreferredScanId] = useState<CtScanId | null>(null);

  const patch = (index: number, next: Partial<VesselEntry>) => {
    setEntries((current) =>
      current.map((entry, position) =>
        position === index ? { ...entry, ...next } : entry,
      ),
    );
  };

  const built = useMemo(
    () => buildCase(entries, sealZoneDiameterMm, proximalLandingLengthMm),
    [entries, sealZoneDiameterMm, proximalLandingLengthMm],
  );

  // planGraft caches clearance fields by scanned device internally, so editing
  // anatomy re-solves without rebuilding the measured lattice.
  const plan = useMemo<PlanResult | null>(
    () =>
      "error" in built
        ? null
        : planGraft(built, { scanId: preferredScanId ?? undefined }),
    [built, preferredScanId],
  );

  const fenestrationCount = entries.filter(
    (entry) => entry.treatment === "fenestrate",
  ).length;
  const scallopCount = entries.filter(
    (entry) => entry.treatment === "scallop",
  ).length;

  const solved = plan?.ok && plan.openings.length > 0 ? plan : null;

  return (
    <>
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--brand)]">
          PMEGplan
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Plan a physician-modified endograft
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--muted-foreground)]">
          Enter the measured anatomy. The planner picks from the endografts that
          have been through the bench CT, then finds where to place the hole
          pattern on that device&rsquo;s measured stent lattice. Anatomy fixes the
          holes relative to each other, so the only things it can move are how far
          the pattern is pushed in and how far the graft is turned — both applied
          to every hole together.
        </p>
        <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[color:var(--muted-foreground)]">
          Prototype. The library holds three scanned devices, so it demonstrates
          the method rather than covering the range a real one would need.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Anatomy</CardTitle>
              <CardDescription>
                Measure every vessel in the chain, including ones you are not
                cutting — a preserved vessel is usually what limits how far the
                pattern can be pushed in.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 pt-0">
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Seal zone Ø"
                  hint="Outer wall. Drives device choice."
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={sealZoneDiameterMm}
                    aria-label="Aortic diameter at seal zone in mm"
                    onChange={(event) => setSealZoneDiameterMm(event.target.value)}
                  />
                </Field>
                <Field
                  label="Healthy aorta above"
                  hint="Above the top vessel. Caps the push-in."
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={proximalLandingLengthMm}
                    aria-label="Healthy aorta above the top vessel in mm"
                    onChange={(event) =>
                      setProximalLandingLengthMm(event.target.value)
                    }
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[1fr_64px_64px_58px_62px] gap-2 px-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                  <span>Vessel</span>
                  <span>Gap ↑</span>
                  <span>Ostium</span>
                  <span>Clock</span>
                  <span>Shape</span>
                </div>

                {entries.map((entry, index) => (
                  <div
                    key={entry.name}
                    className={cn(
                      "grid grid-cols-[1fr_64px_64px_58px_62px] items-center gap-2 rounded-2xl border p-2 transition-colors",
                      entry.treatment === "fenestrate"
                        ? "border-[color:var(--brand)]/35 bg-[color:var(--brand)]/[0.05]"
                        : entry.treatment === "scallop"
                          ? "border-amber-300 bg-amber-50/60"
                          : "border-[color:var(--border)] bg-white/50",
                    )}
                  >
                    <div className="flex flex-col gap-1 pl-1">
                      <span className="text-sm font-medium">{entry.label}</span>
                      <select
                        className="h-7 rounded-lg border border-[color:var(--border)] bg-white px-1 text-[11px] outline-none"
                        value={entry.treatment}
                        aria-label={`How to treat ${entry.label}`}
                        onChange={(event) =>
                          patch(index, {
                            treatment: event.target
                              .value as VesselEntry["treatment"],
                          })
                        }
                      >
                        <option value="fenestrate">fenestrate</option>
                        <option value="scallop">scallop</option>
                        <option value="preserve">preserve</option>
                      </select>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      className="h-9 rounded-xl px-2 font-mono text-xs"
                      value={entry.gapFromPreviousMm}
                      disabled={index === 0}
                      aria-label={`Distance from ${
                        entries[index - 1]?.label ?? "start"
                      } to ${entry.label} in mm`}
                      onChange={(event) =>
                        patch(index, { gapFromPreviousMm: event.target.value })
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      className="h-9 rounded-xl px-2 font-mono text-xs"
                      value={entry.ostiumDiameterMm}
                      aria-label={`${entry.label} ostium diameter in mm`}
                      onChange={(event) =>
                        patch(index, { ostiumDiameterMm: event.target.value })
                      }
                    />
                    <Input
                      className="h-9 rounded-xl px-2 font-mono text-xs"
                      value={entry.clock}
                      disabled={entry.treatment === "preserve"}
                      aria-label={`${entry.label} clock position`}
                      onChange={(event) => patch(index, { clock: event.target.value })}
                    />
                    <select
                      className="h-9 rounded-xl border border-[color:var(--border)] bg-white px-1 text-[11px] outline-none disabled:opacity-40"
                      value={entry.shape}
                      disabled={entry.treatment !== "fenestrate"}
                      aria-label={`${entry.label} opening shape`}
                      onChange={(event) =>
                        patch(index, {
                          shape: event.target.value as VesselEntry["shape"],
                        })
                      }
                    >
                      <option value="round">round</option>
                      <option value="egg">egg</option>
                    </select>
                  </div>
                ))}

                <p className="px-1 text-[11px] leading-4 text-[color:var(--muted-foreground)]">
                  Gap ↑ is the centreline distance from the vessel above.
                  Clock is read on axial CT — 12:00 anterior, 3:00 the
                  patient&rsquo;s left. Unticked vessels are preserved, not
                  covered.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-[color:var(--surface-strong)]/60 px-4 py-3 text-sm">
                <span className="text-[color:var(--muted-foreground)]">
                  Fenestrations
                </span>
                <span className="font-mono text-lg font-semibold">
                  {fenestrationCount}
                  {scallopCount > 0 ? (
                    <span className="ml-2 text-xs font-medium text-amber-800">
                      + {scallopCount} scallop
                    </span>
                  ) : null}
                </span>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setEntries(initialEntries());
                  setSealZoneDiameterMm("36");
                  setProximalLandingLengthMm("25");
                  setPreferredScanId(null);
                }}
              >
                Reset to example case
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {"error" in built ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{built.error}</p>
            </div>
          ) : plan ? (
            <>
              <StatusBanner plan={plan} />
              {plan.ok && plan.openings.length > 0 ? (
                <>
                  <LimitNotice plan={plan} />
                  <Readout plan={plan} />

                  <Card>
                    <CardHeader className="gap-2 pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="text-base">
                          {view === "flat"
                            ? "Graft laid flat — mark from here"
                            : "Reconstruction from the bench CT"}
                        </CardTitle>
                        <div className="flex gap-1 rounded-full border border-[color:var(--border)] bg-white/70 p-1">
                          {(["flat", "model"] as const).map((option) => (
                            <button
                              key={option}
                              type="button"
                              className={cn(
                                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                                view === option
                                  ? "bg-[color:var(--brand)] text-white"
                                  : "text-[color:var(--muted-foreground)] hover:bg-white",
                              )}
                              onClick={() => setView(option)}
                            >
                              {option === "flat" ? "Flat" : "3D"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <CardDescription>
                        {plan.graft.naming.full} ·{" "}
                        {plan.graft.scan.reference.id.toUpperCase()} bench CT ·{" "}
                        {plan.graft.fabricLengthMm.toFixed(0)} mm of fabric
                        measured
                        {plan.graft.renderModel.rings.some(
                          (ring) => ring.kind === "bare_fixation",
                        )
                          ? `, plus a bare fixation ring reaching ${Math.abs(
                              plan.graft.renderModel.minimumZMm,
                            ).toFixed(1)} mm above the fabric`
                          : ", fabric-covered end to end"}
                        .
                        {plan.graft.renderModel.rings.some(
                          (ring) => ring.kind === "bare_fixation",
                        ) ? (
                          <>
                            {" "}
                            Its barbs are not drawn: the segmentation resolves no
                            metal past that ring&rsquo;s own apices, so their
                            length and direction are not in this scan.
                          </>
                        ) : null}
                      </CardDescription>
                      <WireProvenanceWarning graft={plan.graft} />
                    </CardHeader>
                    <CardContent className="pt-2">
                      {view === "flat" ? (
                        <UnrolledGraftCanvas
                          graft={plan.graft}
                          openings={plan.openings}
                          proximalDepthMm={plan.solution.pose.proximalDepthMm}
                          selectedVessel={selectedVessel}
                          onSelect={setSelectedVessel}
                        />
                      ) : (
                        <GraftModel3D
                          graft={plan.graft}
                          openings={plan.openings}
                          proximalDepthMm={plan.solution.pose.proximalDepthMm}
                          selectedVessel={selectedVessel}
                          onSelect={setSelectedVessel}
                        />
                      )}
                    </CardContent>
                  </Card>

                  {selectedVessel ? (
                    <HoleMeasurementPanel
                      plan={plan}
                      vesselName={selectedVessel}
                      onClose={() => setSelectedVessel(null)}
                    />
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant={showPunchCard ? "secondary" : "default"}
                      onClick={() => setShowPunchCard((current) => !current)}
                    >
                      <Printer className="mr-2 size-4" />
                      {showPunchCard ? "Hide punch card" : "Punch card"}
                    </Button>
                    {showPunchCard ? (
                      <>
                        <Button variant="outline" onClick={() => window.print()}>
                          Print at 100%
                        </Button>
                        <span className="text-[11px] leading-4 text-[color:var(--muted-foreground)]">
                          Turn off &ldquo;fit to page&rdquo; — the template is
                          drawn at true size and the ruler on it is the check.
                        </span>
                      </>
                    ) : null}
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Cut list</CardTitle>
                      <CardDescription>
                        Select a row, or a hole on the graft, for the marking
                        measurements around it.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
                            <tr>
                              <th className="pb-2 pr-4">Vessel</th>
                              <th className="pb-2 pr-4">Depth from edge</th>
                              <th className="pb-2 pr-4">Arc from 12:00</th>
                              <th className="pb-2 pr-4">Hole Ø</th>
                              <th className="pb-2">Clearance</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono">
                            {plan.openings.map((opening, index) => {
                              const clearance =
                                plan.solution.clearances[index]?.clearanceMm ?? 0;
                              return (
                                <tr
                                  key={opening.vessel.name}
                                  className={cn(
                                    "cursor-pointer border-t border-[color:var(--border)] transition-colors hover:bg-white/60",
                                    selectedVessel === opening.vessel.name &&
                                      "bg-[color:var(--brand)]/[0.08]",
                                  )}
                                  onClick={() =>
                                    setSelectedVessel((current) =>
                                      current === opening.vessel.name
                                        ? null
                                        : opening.vessel.name,
                                    )
                                  }
                                >
                                  <td className="py-2.5 pr-4 font-sans font-medium">
                                    {opening.vessel.name}
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    {opening.depthMm.toFixed(1)} mm
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    {opening.arcMm.toFixed(1)} mm
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    {opening.semiArcMm === opening.semiDepthMm
                                      ? `Ø${(opening.semiArcMm * 2).toFixed(1)} mm`
                                      : `${(opening.semiArcMm * 2).toFixed(
                                          1,
                                        )} × ${(opening.semiDepthMm * 2).toFixed(
                                          1,
                                        )} mm`}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-2.5",
                                      clearance <= 0
                                        ? "text-rose-700"
                                        : clearance < 1
                                          ? "text-amber-700"
                                          : "text-emerald-700",
                                    )}
                                  >
                                    {clearance.toFixed(2)} mm
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}

              <DeviceLibrary
                plan={plan}
                onSelect={setPreferredScanId}
                onClearSelection={() => setPreferredScanId(null)}
              />
            </>
          ) : null}
        </div>
      </div>
    </main>

    {showPunchCard && solved ? (
      <section className="punch-card-sheet mx-auto w-full max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-8">
        <PunchCard plan={solved} />
      </section>
    ) : null}
    </>
  );
}

function gapText(gap: HoleGap | null): string {
  return gap === null ? "clear" : `${gap.distanceMm.toFixed(1)} mm`;
}

/**
 * Everything needed to mark one hole out on the bench.
 *
 * The cut list says where the hole goes in graft coordinates; this says what is
 * around it. A surgeon marking fabric works from the struts they can see, so
 * the free fabric in each direction and the nearest apex and valley are what a
 * ruler actually gets laid against.
 */
function HoleMeasurementPanel({
  plan,
  vesselName,
  onClose,
}: {
  plan: Extract<PlanResult, { ok: true }>;
  vesselName: string;
  onClose: () => void;
}) {
  const index = plan.openings.findIndex(
    (opening) => opening.vessel.name === vesselName,
  );
  if (index < 0) return null;

  const opening = plan.openings[index];
  const clearance = plan.solution.clearances[index]?.clearanceMm ?? 0;
  const measurement = measureHole(plan.graft, opening, clearance);

  return (
    <Card className="border-[color:var(--brand)]/40">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-base">
            {measurement.vesselName} — how to mark it
          </CardTitle>
          <CardDescription>
            Ø {measurement.diameterMm.toFixed(1)} mm at{" "}
            {measurement.clock}, {measurement.depthMm.toFixed(1)} mm below the
            proximal fabric edge.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-2">
        {measurement.insideRingBand ? (
          <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-900">
            This hole overlaps a strut. It cannot be cut here without crossing
            wire.
          </p>
        ) : null}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Free fabric from the hole edge
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["Above", measurement.gaps.above],
                ["Below", measurement.gaps.below],
                ["Left (CCW)", measurement.gaps.left],
                ["Right (CW)", measurement.gaps.right],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-2"
              >
                <p className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
                  {label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 font-mono text-lg font-semibold",
                    value !== null && value.distanceMm < 1 && "text-amber-700",
                  )}
                >
                  {gapText(value)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-[color:var(--muted-foreground)]">
            How far the hole could slide each way before its rim meets wire,
            measured to the wire&rsquo;s surface. The {clearance.toFixed(2)} mm
            clearance is the shortest distance in any direction at all, so it
            sits at or below every figure here.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            Landmarks to measure from
          </p>
          <div className="flex flex-col gap-2">
            {measurement.apexAbove ? (
              <LandmarkRow
                label="Nearest apex above"
                landmark={measurement.apexAbove}
                holeDepthMm={measurement.depthMm}
              />
            ) : null}
            {measurement.valleyBelow ? (
              <LandmarkRow
                label="Nearest valley below"
                landmark={measurement.valleyBelow}
                holeDepthMm={measurement.depthMm}
              />
            ) : null}
            {!measurement.apexAbove && !measurement.valleyBelow ? (
              <p className="text-[11px] text-[color:var(--muted-foreground)]">
                No strut within 40 mm — this hole sits in open fabric.
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LandmarkRow({
  label,
  landmark,
  holeDepthMm,
}: {
  label: string;
  landmark: StrutLandmark;
  holeDepthMm: number;
}) {
  const axialMm = Math.abs(landmark.depthMm - holeDepthMm);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-[color:var(--border)] bg-white/60 px-3 py-2 text-sm">
      <span className="text-[color:var(--muted-foreground)]">{label}</span>
      <span className="font-mono text-xs">
        {landmark.distanceMm.toFixed(1)} mm from edge · {axialMm.toFixed(1)} mm
        axially · {Math.abs(landmark.arcOffsetMm).toFixed(1)} mm{" "}
        {landmark.arcOffsetMm >= 0 ? "CW" : "CCW"} · at {landmark.clock}
      </span>
    </div>
  );
}

/**
 * Fires only when the strut path is not the scan's own.
 *
 * When the geometry is segmented there is nothing to say — that is the normal
 * case and narrating it just buries the plan. When it is an interpolated curve
 * through a dozen apices per ring, the clearance figures are a guess and the
 * surgeon has to know.
 */
function WireProvenanceWarning({ graft }: { graft: GraftModel }) {
  const { wireProvenance: wire } = graft;
  if (wire.source === "segmented") return null;

  return (
    <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
      <span className="font-semibold">Wire path is interpolated.</span> This
      device has no segmented wire map, so the struts are a curve fitted through
      {" "}
      {wire.apexCount} apices. Treat the clearances as indicative only.
    </p>
  );
}

/**
 * The scanned library, what each device would give, and which one is in use.
 *
 * Every device that suits the seal zone is solved, so where more than one fits
 * the choice between them is the surgeon's to make on their poses rather than
 * the planner's to make on a tiebreak. The recommendation is only a default.
 *
 * Shown whether or not a plan was found: when nothing fits, the reason is the
 * point, and it is what tells you which endograft is worth scanning next.
 */
function DeviceLibrary({
  plan,
  onSelect,
  onClearSelection,
}: {
  plan: PlanResult;
  onSelect: (scanId: CtScanId) => void;
  onClearSelection: () => void;
}) {
  if (plan.considered.length === 0) return null;
  const usableCount = plan.considered.filter(
    (fit) => fit.rejection === null,
  ).length;

  return (
    <Card>
      <CardHeader className="gap-2 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Scanned device library</CardTitle>
          {plan.ok && plan.overridden ? (
            <Button variant="outline" size="sm" onClick={onClearSelection}>
              Use recommended
            </Button>
          ) : null}
        </div>
        <CardDescription>
          {usableCount > 1
            ? `${usableCount} of these suit this anatomy. Each is solved on its own measured lattice — pick whichever you would rather implant.`
            : "Every endograft that has been through the bench CT, measured in the free state. Adding a device to the library means scanning it, not entering its specification."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-2">
        {plan.considered.map((fit) => {
          const { scan } = fit.model;
          const scanId = scan.reference.id;
          const selectable = fit.rejection === null;
          const isChosen = plan.ok && scanId === plan.selectedScanId;
          const isRecommended = plan.ok && scanId === plan.recommendedScanId;
          const solution = fit.solution;

          const Row = selectable ? "button" : "div";
          return (
            <Row
              key={scanId}
              {...(selectable
                ? {
                    type: "button" as const,
                    onClick: () => onSelect(scanId),
                    "aria-pressed": isChosen,
                  }
                : {})}
              className={cn(
                "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border p-3 text-left text-sm transition-colors",
                isChosen
                  ? "border-[color:var(--brand)]/50 bg-[color:var(--brand)]/[0.08]"
                  : "border-[color:var(--border)] bg-white/50",
                selectable && !isChosen && "hover:bg-white",
                selectable && "cursor-pointer",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs font-semibold">
                  {scanId.toUpperCase()}
                </span>
                <span className="font-medium">
                  {fit.model.naming.code ?? scan.platform.shortLabel}
                </span>
                <span className="font-mono text-xs text-[color:var(--muted-foreground)]">
                  {fit.model.naming.size}
                </span>
                {isRecommended && usableCount > 1 ? (
                  <span className="rounded-full bg-[color:var(--surface-strong)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--muted-foreground)]">
                    recommended
                  </span>
                ) : null}
              </div>

              {fit.rejection ? (
                <span className="text-xs text-[color:var(--muted-foreground)]">
                  set aside — {fit.rejection}
                </span>
              ) : (
                <span
                  className={cn(
                    "font-mono text-xs",
                    isChosen
                      ? "font-semibold text-[color:var(--brand-strong)]"
                      : "text-[color:var(--muted-foreground)]",
                  )}
                >
                  <span
                    className={cn(
                      fit.oversizeOutOfRange !== null &&
                        "font-semibold text-amber-800",
                    )}
                  >
                    {(fit.oversizeFraction * 100).toFixed(0)}% oversize
                    {fit.oversizeOutOfRange !== null ? " ⚠" : ""}
                  </span>
                  {solution && solution.map !== null ? (
                    <>
                      {" · "}
                      <span
                        className={cn(
                          solution.marginMm <= 0 && "text-rose-700",
                        )}
                      >
                        {solution.marginMm.toFixed(2)} mm clear
                      </span>
                      {" · "}
                      {solution.pose.proximalDepthMm.toFixed(1)} mm in ·{" "}
                      {Math.abs(solution.pose.rotationDeg).toFixed(0)}°
                    </>
                  ) : null}
                  {isChosen ? " · in use" : ""}
                </span>
              )}
            </Row>
          );
        })}
      </CardContent>
    </Card>
  );
}
