import type { AnatomyCase, AnatomyVessel } from "@/lib/planning/anatomy";

/**
 * Reads a de-identified anatomy series extracted from Cook custom-made-device
 * graft plans and converts it into planning cases.
 *
 * The series file itself is gitignored and never committed; see
 * `studies/README.md`. This module contains no patient data.
 */

export type OpeningKind =
  | "scallop"
  | "large_fenestration"
  | "small_fenestration";

export interface SeriesTarget {
  vessel: string;
  opening: OpeningKind;
  /**
   * Axial position on the graft, in mm below its proximal edge. For a scallop
   * this is the base of the U, where the vessel sits.
   */
  distFromProxEdgeMm: number;
  clock: string;
  /** Aortic inner diameter at this vessel's level, in mm — the plan's `IVD`. */
  aorticDiameterAtLevelMm: number;
  openingWidthMm: number;
  openingHeightMm: number;
  /** The plan carried a `**Strut Free**` annotation for this opening. */
  strutFreeRequested: boolean;
  /** Arc from 12:00 in mm, on the aortic circumference. Redundant with clock. */
  arcsepMm?: number;
  notes: string | null;
}

export interface SeriesCase {
  caseId: string;
  deviceType: string;
  graftProximalDiameterMm: number;
  graftDistalDiameterMm: number;
  graftLengthMm: number;
  targets: SeriesTarget[];
}

export interface AnatomySeries {
  source: string;
  convention: Record<string, string>;
  cases: SeriesCase[];
}

/**
 * Oversizing the custom device was assumed to have been planned with, used to
 * recover the seal-zone diameter.
 *
 * The plan gives an aortic diameter at each vessel but not at the intended
 * proximal seal, which is above every target. Cook sized the graft to that
 * unrecorded diameter, so dividing the graft diameter back out recovers it —
 * conditional on this assumption, which is why it is a named constant.
 */
export const ASSUMED_CMD_OVERSIZE = 0.15;

export function inferSealZoneDiameterMm(
  graftProximalDiameterMm: number,
  assumedOversize = ASSUMED_CMD_OVERSIZE,
): number {
  return graftProximalDiameterMm / (1 + assumedOversize);
}

/**
 * Ostium diameters by vessel, in mm.
 *
 * The graft plan records the *opening the manufacturer cut*, not the vessel it
 * serves, and for a scallop those differ by more than a factor of two — a 20 mm
 * wide scallop does not imply a 20 mm coeliac. Fenestration sizes track the
 * ostium closely enough to use directly; scallops do not, so a nominal value is
 * substituted and flagged as an assumption.
 */
export const NOMINAL_OSTIUM_MM: Record<string, number> = {
  CELIAC: 8,
  SMA: 9,
  RRA: 6,
  LRA: 6,
};

/**
 * What to do with a vessel the custom device served with a scallop.
 *
 * `preserve` is the default and the faithful one. A scallop keeps a vessel
 * perfused *without* a closed hole, by cutting the fabric edge around it. In a
 * workflow that cuts only closed fenestrations the equivalent is to land the
 * fabric edge below that vessel — which is what `preserve` means here, and
 * which correctly makes the vessel cap the push-in.
 *
 * `fenestrate` treats it as a closed hole instead. That imposes a 10 mm seal
 * above a vessel the real device never needed one above, and makes an already
 * hard case artificially harder.
 */
export type ScallopPolicy = "preserve" | "fenestrate";

/** Why a case could not be turned into a planning problem. */
export interface ConversionProblem {
  caseId: string;
  reason: string;
}

export interface ConversionResult {
  cases: Array<{ caseId: string; anatomy: AnatomyCase; source: SeriesCase }>;
  skipped: ConversionProblem[];
}

/**
 * Convert a series case into a planning case.
 *
 * The absolute `distFromProxEdgeMm` values are device coordinates chosen with a
 * particular seal in mind, so only the differences between them are anatomy —
 * the planner solves the offset itself. The one absolute that is kept is the
 * distance to the first target, which measures how much healthy aorta the case
 * actually had and bounds the push-in.
 *
 * See `ScallopPolicy` for how a scalloped vessel is treated; the choice changes
 * the answers materially and defaults to the faithful one.
 */
export function toAnatomyCases(
  series: AnatomySeries,
  options: { assumedOversize?: number; scallopPolicy?: ScallopPolicy } = {},
): ConversionResult {
  const scallopPolicy = options.scallopPolicy ?? "preserve";
  const cases: ConversionResult["cases"] = [];
  const skipped: ConversionProblem[] = [];

  for (const source of series.cases) {
    const ordered = [...source.targets].sort(
      (left, right) => left.distFromProxEdgeMm - right.distFromProxEdgeMm,
    );

    if (ordered.length < 2) {
      skipped.push({ caseId: source.caseId, reason: "fewer than two targets" });
      continue;
    }

    // A vessel the custom device left uncovered is not on the plan at all, so
    // its distance to the next target is unknown. Reconstructing the chain
    // without it would silently place the graft's edge where that vessel is.
    const uncoveredProximal = ordered.some((target) =>
      /NOT covered/i.test(target.notes ?? ""),
    );
    if (uncoveredProximal) {
      skipped.push({
        caseId: source.caseId,
        reason:
          "a proximal vessel was left uncovered by the custom device and is absent from the plan, so its distance to the first target is unrecorded",
      });
      continue;
    }

    const isScallop = (target: SeriesTarget) => target.opening === "scallop";
    const preserved = new Set(
      scallopPolicy === "preserve"
        ? ordered.filter(isScallop).map((target) => target.vessel)
        : [],
    );

    const vessels: AnatomyVessel[] = ordered.map((target, index) => ({
      name: target.vessel,
      gapFromPreviousMm:
        index === 0
          ? 0
          : target.distFromProxEdgeMm - ordered[index - 1].distFromProxEdgeMm,
      // A preserved vessel is never cut, so it needs no clock.
      clock: preserved.has(target.vessel) ? undefined : target.clock,
      ostiumDiameterMm: isScallop(target)
        ? (NOMINAL_OSTIUM_MM[target.vessel] ??
          Math.min(target.openingWidthMm, target.openingHeightMm))
        : Math.max(target.openingWidthMm, target.openingHeightMm),
    }));

    cases.push({
      caseId: source.caseId,
      source,
      anatomy: {
        clockConvention: "axial_ct",
        vessels,
        fenestrate: vessels
          .map((vessel) => vessel.name)
          .filter((name) => !preserved.has(name)),
        aorta: {
          sealZoneDiameterMm: inferSealZoneDiameterMm(
            source.graftProximalDiameterMm,
            options.assumedOversize,
          ),
          // The custom device's own proximal seal: the distance its designer
          // left between the fabric edge and the first target. That is a
          // measurement of how much healthy aorta the case actually had, and
          // without it the planner has no bound on push-in and will bury the
          // pattern chasing clearance it can never use.
          proximalLandingLengthMm: ordered[0].distFromProxEdgeMm,
        },
      },
    });
  }

  return { cases, skipped };
}
