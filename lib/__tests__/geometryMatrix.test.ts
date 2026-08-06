import { describe, expect, it } from "vitest";

import {
  normalizeAnatomy,
  placeOpenings,
  placeScallop,
  scallopEdgeDepthMm,
  scallopSeparationMm,
  type AnatomyCase,
  type GraftPose,
} from "@/lib/planning/anatomy";
import { arcMmToClockText } from "@/lib/planning/clock";
import { buildGraftModel, planGraft, type GraftModel } from "@/lib/planning/plan";
import type { CtScanId } from "@/lib/ctDeviceCatalog";

const SCANS: CtScanId[] = ["scan1", "scan2", "scan3"];

/**
 * One anatomy, treated four ways. The gaps and clocks stay fixed across all of
 * them so a difference in the answer is a difference in the treatment and not
 * in the measurements — and so the same case can be run against all three
 * scanned devices, which is where a per-device error shows up.
 */
function chain(): AnatomyCase["vessels"] {
  return [
    { name: "CELIAC", gapFromPreviousMm: 0, clock: "12:00", ostiumDiameterMm: 8 },
    { name: "SMA", gapFromPreviousMm: 18, clock: "12:30", ostiumDiameterMm: 9 },
    { name: "RRA", gapFromPreviousMm: 24, clock: "9:00", ostiumDiameterMm: 6 },
    { name: "LRA", gapFromPreviousMm: 5, clock: "3:30", ostiumDiameterMm: 6 },
  ];
}

function build(
  fenestrate: string[],
  scallop: string[] = [],
): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: chain(),
    fenestrate,
    ...(scallop.length > 0 ? { scallop } : {}),
    aorta: { sealZoneDiameterMm: 36, proximalLandingLengthMm: 25 },
  };
}

const CONFIGURATIONS = [
  {
    name: "four fenestrations",
    build: () => build(["CELIAC", "SMA", "RRA", "LRA"]),
  },
  {
    name: "three fenestrations, coeliac preserved",
    build: () => build(["SMA", "RRA", "LRA"]),
  },
  {
    name: "two renal fenestrations, SMA scalloped",
    build: () => build(["RRA", "LRA"], ["SMA"]),
  },
  {
    name: "three fenestrations, coeliac scalloped",
    build: () => build(["SMA", "RRA", "LRA"], ["CELIAC"]),
  },
] as const;

/** The pose every geometric invariant is checked at, clear of any solver. */
const PROBE: GraftPose = { proximalDepthMm: 40, rotationDeg: 0 };

describe.each(CONFIGURATIONS)("$name", ({ build: buildCase }) => {
  describe.each(SCANS)("on %s", (scanId) => {
    const model = buildGraftModel(scanId);
    const anatomy = normalizeAnatomy(buildCase());

    it("puts every opening at the clock it was entered as", () => {
      for (const opening of placeOpenings(anatomy, PROBE, model)) {
        // Read back with a tape run round the graft at the hole's own level,
        // which is the only circumference that means anything there.
        expect(
          arcMmToClockText(opening.arcMm, opening.circumferenceMm),
          opening.vessel.name,
        ).toBe(opening.vessel.clock);
      }
    });

    it("measures arc against the graft's width where the hole sits", () => {
      const openings = placeOpenings(anatomy, PROBE, model);
      for (const opening of openings) {
        expect(opening.circumferenceMm).toBeCloseTo(
          model.circumferenceAtDepthMm(opening.depthMm),
          10,
        );
        expect(opening.arcMm).toBeCloseTo(
          opening.turnFraction * opening.circumferenceMm,
          10,
        );
      }

      // The regression this whole reframing is for. On the tapered TX2 the
      // deepest opening sits where the graft has narrowed, so a full turn there
      // is several millimetres short of a turn at the fabric edge — which is
      // the frame the planner used to mark every hole in.
      if (scanId === "scan2") {
        const deepest = openings.reduce((deep, candidate) =>
          candidate.depthMm > deep.depthMm ? candidate : deep,
        );
        expect(deepest.circumferenceMm).toBeLessThan(model.circumferenceMm - 3);
      }
    });

    it("keeps the pattern rigid, at the gaps that were entered", () => {
      const openings = placeOpenings(anatomy, PROBE, model);
      const byName = new Map(
        openings.map((opening) => [opening.vessel.name, opening]),
      );
      const gaps = new Map(
        chain().map((vessel) => [vessel.name, vessel.gapFromPreviousMm]),
      );

      // Every consecutive pair of fenestrated vessels sits the sum of the gaps
      // between them apart, whatever the device or the pose.
      for (let index = 1; index < openings.length; index += 1) {
        const above = openings[index - 1];
        const below = openings[index];
        let expectedMm = 0;
        let walking = false;
        for (const vessel of chain()) {
          if (vessel.name === above.vessel.name) walking = true;
          else if (walking) expectedMm += gaps.get(vessel.name) ?? 0;
          if (vessel.name === below.vessel.name) break;
        }
        expect(
          below.depthMm - above.depthMm,
          `${above.vessel.name} to ${below.vessel.name}`,
        ).toBeCloseTo(expectedMm, 10);
      }

      expect(byName.size).toBe(anatomy.fenestrations.length);
    });

    it("cuts the scallop to the scalloped vessel's caudal rim", () => {
      const separationMm = scallopSeparationMm(anatomy);
      const scallop = placeScallop(anatomy, PROBE, model);
      if (anatomy.scalloped === null) {
        expect(separationMm).toBeNull();
        expect(scallop).toBeNull();
        return;
      }
      if (!scallop || separationMm === null) throw new Error("Expected a cut.");

      const radiusMm = anatomy.scalloped.ostiumDiameterMm / 2;
      // The vessel's centre, then a radius past it so no fabric crosses it.
      expect(scallop.centreDepthMm).toBeCloseTo(
        PROBE.proximalDepthMm - separationMm,
        10,
      );
      expect(scallop.heightMm).toBeCloseTo(
        scallop.centreDepthMm + radiusMm,
        10,
      );
      // And never wider than a U can be at that depth.
      expect(scallop.semiArcMm).toBeLessThanOrEqual(scallop.heightMm);
    });
  });

  it("cuts the same scallop whichever device carries it", () => {
    const anatomy = normalizeAnatomy(buildCase());
    if (anatomy.scalloped === null) return;

    const cuts = SCANS.map((scanId) =>
      placeScallop(anatomy, PROBE, buildGraftModel(scanId)),
    );
    for (const cut of cuts) {
      if (!cut) throw new Error("Expected a cut on every device.");
      expect(cut.heightMm).toBeCloseTo(cuts[0]!.heightMm, 10);
      expect(cut.semiArcMm).toBeCloseTo(cuts[0]!.semiArcMm, 10);
    }
  });

  it("plans without contradicting itself", () => {
    const plan = planGraft(buildCase());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    for (const fit of plan.considered) {
      if (fit.rejection !== null || fit.solution === null) continue;
      // A device offered a plan has the fabric the plan needs. The length gate
      // and the solver's depth bound used to be separate rules that disagreed.
      expect(fit.model.fabricLengthMm, fit.model.scan.reference.id)
        .toBeGreaterThanOrEqual(plan.requiredLengthMm);

      const bridge = fit.scallopBridge;
      if (!bridge) continue;
      // Edge to edge is a shortest path and nadir-to-centre is a purely axial
      // run, so neither bounds the other: where the two are far apart on the
      // clock the real fabric between them is the longer of the two. What must
      // hold is that a positive bridge and a merged aperture cannot coexist.
      expect(Number.isFinite(bridge.edgeToEdgeMm)).toBe(true);
      expect(bridge.edgeToEdgeMm > 0).toBe(
        fit.solution.status !== "scallop_meets_opening",
      );
      expect(bridge.circumferenceFraction).toBeGreaterThan(0);
      expect(bridge.circumferenceFraction).toBeLessThan(1);
    }
  });
});

describe("the specified cut", () => {
  it("has the same outline on every device in the library", () => {
    // The report this whole change answers: one anatomy drew three visibly
    // different scallops. Sampling the profile the renderers themselves call
    // catches a divergence in shape, not just in the width and height figures.
    const anatomy = normalizeAnatomy(build(["SMA", "RRA", "LRA"], ["CELIAC"]));
    const profiles = SCANS.map((scanId) => {
      const scallop = placeScallop(anatomy, PROBE, buildGraftModel(scanId));
      expect(scallop, scanId).not.toBeNull();
      if (!scallop) return null;
      const samples: number[] = [];
      for (let offsetMm = -15; offsetMm <= 15; offsetMm += 0.25) {
        samples.push(scallopEdgeDepthMm(scallop, offsetMm));
      }
      return { scanId, widthMm: scallop.semiArcMm * 2, heightMm: scallop.heightMm, samples };
    });

    const [reference, ...others] = profiles;
    expect(reference).not.toBeNull();
    if (!reference) return;
    for (const other of others) {
      if (!other) continue;
      expect(other.widthMm, other.scanId).toBeCloseTo(reference.widthMm, 10);
      expect(other.heightMm, other.scanId).toBeCloseTo(reference.heightMm, 10);
      for (const [index, depthMm] of other.samples.entries()) {
        expect(depthMm, `${other.scanId} at sample ${index}`).toBeCloseTo(
          reference.samples[index],
          10,
        );
      }
    }

    // And it really is a U rather than a saucer: sides at the full width all
    // the way down to the semicircular base.
    expect(reference.heightMm).toBeGreaterThanOrEqual(reference.widthMm / 2);
    expect(scallopEdgeDepthMm(
      placeScallop(anatomy, PROBE, buildGraftModel("scan1"))!,
      0,
    )).toBeCloseTo(reference.heightMm, 10);
  });
});

describe("edge cases", () => {
  it("moves the datum to the most distal vessel when there are no renals", () => {
    const noRenals: AnatomyCase = {
      clockConvention: "axial_ct",
      vessels: [
        { name: "CELIAC", gapFromPreviousMm: 0, clock: "12:00", ostiumDiameterMm: 8 },
        { name: "SMA", gapFromPreviousMm: 18, clock: "12:30", ostiumDiameterMm: 9 },
      ],
      fenestrate: ["CELIAC", "SMA"],
      aorta: { sealZoneDiameterMm: 36, proximalLandingLengthMm: 25 },
    };
    const anatomy = normalizeAnatomy(noRenals);

    expect(anatomy.datumVesselName).toBe("SMA");
    // Positions stay relative, so the 18 mm gap survives the datum move.
    const openings = placeOpenings(anatomy, PROBE, buildGraftModel("scan1"));
    expect(openings[1].depthMm - openings[0].depthMm).toBeCloseTo(18, 10);
  });

  it("plans a single fenestration", () => {
    // Only the renals are left, and both are covered rather than preserved,
    // which is what treating one vessel at the bottom of the chain means.
    const single = build(["LRA"]);
    single.cover = ["RRA"];
    const plan = planGraft(single);

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.openings).toHaveLength(1);
    // The SMA is the lowest vessel still kept clear of the fabric, so it caps
    // the push-in rather than the healthy aorta above the coeliac.
    expect(plan.depthLimit.limitingVesselName).toBe("SMA");
  });

  it("lets a covered vessel be covered rather than capping the push-in", () => {
    const covered = build(["SMA", "RRA", "LRA"]);
    covered.cover = ["CELIAC"];
    const anatomy = normalizeAnatomy(covered);

    expect(anatomy.preserved).toHaveLength(0);
    expect(anatomy.vessels[0].treatment).toBe("cover");
  });

  it("refuses to call a vessel preserved when the fabric runs over it", () => {
    // The right renal sits between the SMA and the left renal. Fenestrate above
    // and below it and it is under fabric whatever the pose — which used to
    // surface as every device being refused for a short seal zone.
    const buried = build(["CELIAC", "SMA", "LRA"]);

    expect(() => normalizeAnatomy(buried)).toThrow(
      /RRA would be under the fabric/,
    );
  });

  it("sees an opening the other side of the seam from the cut", () => {
    // The cut sits at 12:00 and the wrap is at 12:00, so the boundary of the
    // cut straddles it. Measured the long way round the two would look far
    // apart; measured the short way they are all but touching.
    const seam = build(["SMA", "RRA", "LRA"], ["CELIAC"]);
    seam.vessels[1].clock = "11:55";
    seam.vessels[1].gapFromPreviousMm = 8;

    const plan = planGraft(seam);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.solution.status).toBe("scallop_meets_opening");
  });
});

/** Guards the assumption the whole reframing rests on. */
describe("the library's taper", () => {
  it("is negligible on the Alphas and material on the TX2", () => {
    const spread = (model: GraftModel) => {
      const proximalMm = model.circumferenceMm;
      const distalMm = model.circumferenceAtDepthMm(100);
      return Math.abs(proximalMm - distalMm) / proximalMm;
    };

    // Only the TX2 is a tapered device, and only it narrows distally. Both
    // Alphas widen slightly instead: their first covered ring relaxes inward in
    // the free state (40.7 against a 42.3 body on scan1, 29.7 against 31.6 on
    // scan3), so measuring from the fabric edge the body is the wider end.
    // Asserting the sign is what separates a design taper from that relaxation;
    // asserting a small magnitude would only have hidden it.
    for (const scanId of ["scan1", "scan3"] as const) {
      const model = buildGraftModel(scanId);
      expect(model.circumferenceAtDepthMm(100), scanId).toBeGreaterThan(
        model.circumferenceMm,
      );
      expect(spread(model), scanId).toBeLessThan(0.12);
    }

    const tx2 = buildGraftModel("scan2");
    expect(tx2.circumferenceAtDepthMm(100)).toBeLessThan(tx2.circumferenceMm);
    expect(spread(tx2)).toBeGreaterThan(0.2);
  });

  it("runs the TX2's taper one way, without reversals", () => {
    // The property the raw per-slice profile could not hold. Segmentation
    // dropped out on individual slices — scan3 reads 25.7 mm at z=119 on a
    // 32 mm graft — so interpolating it put steps and reversals in a taper that
    // is monotone on the device. Ring diameters are fitted per ring instead.
    const model = buildGraftModel("scan2");
    let previousMm = model.circumferenceAtDepthMm(0);
    for (let depthMm = 5; depthMm <= 120; depthMm += 5) {
      const currentMm = model.circumferenceAtDepthMm(depthMm);
      expect(currentMm, `at ${depthMm} mm`).toBeLessThanOrEqual(previousMm + 1e-9);
      previousMm = currentMm;
    }
  });
});
