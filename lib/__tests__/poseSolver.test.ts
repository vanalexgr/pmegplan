import { describe, expect, it } from "vitest";

import { minDistToStruts } from "@/lib/conflictDetection";
import { BENCH_CT_DEVICE_LIBRARY } from "@/lib/geometry/benchCtDeviceLibrary";
import {
  MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
  normalizeAnatomy,
  placeOpenings,
  uniformCircumference,
  type AnatomyCase,
} from "@/lib/planning/anatomy";
import { buildClearanceField } from "@/lib/planning/clearanceField";
import {
  maxProximalDepthFromAnatomy,
  rotationPeriodDegFromApexCounts,
  solvePose,
} from "@/lib/planning/poseSolver";
import { buildBenchCtStrutSegments } from "@/lib/stentGeometry";
import type { StrutSegment } from "@/lib/types";

const CIRCUMFERENCE_MM = 100;

/** Three 20 mm zigzag rings on a 30 mm pitch, leaving 10 mm fabric windows. */
function zigzagRings(): StrutSegment[] {
  const segments: StrutSegment[] = [];
  const peaks = 6;
  const waveMm = CIRCUMFERENCE_MM / peaks;

  for (const top of [0, 30, 60]) {
    for (let peak = 0; peak < peaks; peak += 1) {
      const left = peak * waveMm;
      const middle = left + waveMm / 2;
      const right = left + waveMm;
      segments.push([left, top, middle, top + 20]);
      segments.push([middle, top + 20, right, top]);
    }
  }

  return segments;
}

function twoVesselCase(): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: [
      {
        name: "SMA",
        gapFromPreviousMm: 0,
        clock: "12:00",
        ostiumDiameterMm: 6,
      },
      {
        name: "RRA",
        gapFromPreviousMm: 30,
        clock: "9:30",
        ostiumDiameterMm: 6,
      },
    ],
    fenestrate: ["SMA", "RRA"],
    aorta: { sealZoneDiameterMm: 30, proximalLandingLengthMm: 30 },
  };
}

const baseOptions = {
  maxProximalDepthMm: 40,
  fabricLengthMm: 90,
  wireRadiusMm: 0.5,
};

describe("solvePose", () => {
  it("finds a conflict-free pose in the fabric windows", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, baseOptions);

    expect(solution.status).toBe("conflict_free");
    expect(solution.marginMm).toBeGreaterThan(1);
    expect(solution.clearances).toHaveLength(2);
  });

  it("never places the first fenestration above the seal minimum", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, baseOptions);

    expect(solution.pose.proximalDepthMm).toBeGreaterThanOrEqual(
      MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
    );
  });

  it("reports the margin as the worst opening clearance", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, baseOptions);
    const worst = Math.min(
      ...solution.clearances.map((clearance) => clearance.clearanceMm),
    );

    expect(solution.marginMm).toBeCloseTo(worst, 6);
  });

  it("keeps the pattern rigid at the chosen pose", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, baseOptions);
    const [sma, rra] = solution.clearances;

    expect(rra.depthMm - sma.depthMm).toBeCloseTo(30, 6);
  });

  it("stops pushing in once the clearance target is met", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const relaxed = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...baseOptions,
      targetClearanceMm: 0,
    });
    const demanding = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...baseOptions,
      targetClearanceMm: 1.4,
    });

    expect(relaxed.meetsTargetClearance).toBe(true);
    expect(demanding.meetsTargetClearance).toBe(true);
    expect(demanding.marginMm).toBeGreaterThanOrEqual(1.4);
    expect(relaxed.pose.proximalDepthMm).toBeLessThan(
      demanding.pose.proximalDepthMm,
    );
  });

  it("falls back to the widest clearance when the target is unreachable", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...baseOptions,
      targetClearanceMm: 50,
    });

    expect(solution.meetsTargetClearance).toBe(false);
    expect(solution.status).toBe("conflict_free");
    expect(solution.marginMm).toBeGreaterThan(0);
  });

  it("reports a graft that cannot span the vessels as too short", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...baseOptions,
      fabricLengthMm: 35,
    });

    expect(solution.status).toBe("graft_too_short");
  });

  it("bounds the push-in by the healthy aorta above the vessels", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());

    expect(maxProximalDepthFromAnatomy(anatomy, 30)).toBe(30);
  });

  it("leaves the push-in unbounded when nothing above constrains it", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());

    expect(maxProximalDepthFromAnatomy(anatomy)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("rotationPeriodDegFromApexCounts", () => {
  it("collapses a uniform lattice to one ring's period", () => {
    expect(rotationPeriodDegFromApexCounts(Array(8).fill(7))).toBeCloseTo(
      360 / 7,
      10,
    );
    expect(rotationPeriodDegFromApexCounts(Array(10).fill(5))).toBe(72);
  });

  it("keeps only the symmetry a tapered lattice shares", () => {
    expect(
      rotationPeriodDegFromApexCounts([12, 12, 12, 12, 14, 14, 14]),
    ).toBe(180);
  });

  it("falls back to a full turn when counts are unusable", () => {
    expect(rotationPeriodDegFromApexCounts([])).toBe(360);
  });
});

describe("rotation periodicity", () => {
  it("gives identical clearance one period apart", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const segments = zigzagRings();

    // The fixture is six-peaked and in phase, so the lattice repeats every 60°.
    // Checked against exact segment distance: the rasterised field cannot show
    // this exactly, because one period spans 66.67 cells rather than a whole
    // number of them.
    for (const rotationDeg of [0, 7, 23, 41]) {
      const here = placeOpenings(
        anatomy,
        { proximalDepthMm: 20, rotationDeg },
        uniformCircumference(CIRCUMFERENCE_MM),
      );
      const onePeriodOn = placeOpenings(
        anatomy,
        { proximalDepthMm: 20, rotationDeg: rotationDeg + 60 },
        uniformCircumference(CIRCUMFERENCE_MM),
      );

      for (const [index, opening] of here.entries()) {
        const moved = onePeriodOn[index];
        expect(
          minDistToStruts(moved.arcMm, moved.depthMm, segments, CIRCUMFERENCE_MM),
        ).toBeCloseTo(
          minDistToStruts(
            opening.arcMm,
            opening.depthMm,
            segments,
            CIRCUMFERENCE_MM,
          ),
          10,
        );
      }
    }
  });

  it("takes the smallest turn that still meets the target", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...baseOptions,
      targetClearanceMm: 1,
    });
    const map = solution.map;

    expect(solution.meetsTargetClearance).toBe(true);
    expect(map).not.toBeNull();
    if (!map) return;

    // No rotation at the chosen depth clears the target with a shorter turn.
    const depthIndex = Math.round(
      (solution.pose.proximalDepthMm - map.depthStartMm) / map.depthStepMm,
    );
    const chosenTurn = Math.abs(solution.pose.rotationDeg);

    for (let index = 0; index < map.rotationCount; index += 1) {
      if (map.values[depthIndex * map.rotationCount + index] < 1) continue;
      const deg = ((index * map.rotationStepMm) / CIRCUMFERENCE_MM) * 360;
      const turn = Math.abs(deg > 180 ? deg - 360 : deg);
      expect(turn).toBeGreaterThanOrEqual(chosenTurn - 1e-9);
    }
  });

  it("never exceeds the turn cap", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    for (const maxRotationDeg of [10, 25, 45]) {
      const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
        ...baseOptions,
        maxRotationDeg,
      });

      expect(Math.abs(solution.pose.rotationDeg)).toBeLessThanOrEqual(
        maxRotationDeg + 1e-9,
      );
    }
  });

  it("pushes in further rather than turning past the cap", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const loose = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...baseOptions,
      maxRotationDeg: 180,
    });
    const tight = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...baseOptions,
      maxRotationDeg: 10,
    });

    expect(Math.abs(tight.pose.rotationDeg)).toBeLessThanOrEqual(10 + 1e-9);
    expect(tight.pose.proximalDepthMm).toBeGreaterThanOrEqual(
      loose.pose.proximalDepthMm,
    );
  });

  it("surfaces a good pose the turn cap ruled out", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);
    // Pin the depth: given freedom, the solver would simply push in further
    // rather than turn past the cap, and nothing would be excluded.
    const singleDepth = {
      ...baseOptions,
      maxProximalDepthMm: MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
    };

    const probe = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...singleDepth,
      maxRotationDeg: 180,
    });
    const map = probe.map;
    expect(map?.depthCount).toBe(1);
    if (!map) return;

    let bestValue = Number.NEGATIVE_INFINITY;
    let bestTurnDeg = 0;
    for (let index = 0; index < map.rotationCount; index += 1) {
      if (map.values[index] <= bestValue) continue;
      bestValue = map.values[index];
      const deg = ((index * map.rotationStepMm) / CIRCUMFERENCE_MM) * 360;
      bestTurnDeg = deg > 180 ? deg - 360 : deg;
    }
    expect(Math.abs(bestTurnDeg)).toBeGreaterThan(1);

    // Back off a touch: the map is Float32 while the solve compares in Float64,
    // so an exactly-equal target can round out of reach.
    const targetClearanceMm = bestValue - 0.01;
    const capped = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      ...singleDepth,
      targetClearanceMm,
      maxRotationDeg: Math.abs(bestTurnDeg) / 2,
    });

    expect(capped.meetsTargetClearance).toBe(false);
    expect(capped.excludedByTurnCap).not.toBeNull();
    expect(capped.excludedByTurnCap?.marginMm).toBeGreaterThanOrEqual(
      targetClearanceMm,
    );
    expect(Math.abs(capped.excludedByTurnCap?.rotationDeg ?? 0)).toBeGreaterThan(
      Math.abs(bestTurnDeg) / 2,
    );
  });

  it("reports no exclusion when the capped pose already meets the target", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, baseOptions);

    expect(solution.meetsTargetClearance).toBe(true);
    expect(solution.excludedByTurnCap).toBeNull();
  });

  it("reports the turn as the shorter way round", () => {
    const anatomy = normalizeAnatomy(twoVesselCase());
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, baseOptions);

    expect(Math.abs(solution.pose.rotationDeg)).toBeLessThanOrEqual(180);
  });
});

/**
 * Juxtarenal repair: both renals fenestrated, SMA preserved by keeping the
 * fabric edge below it. The SMA-to-renal distance is the whole seal budget.
 */
function juxtarenalCase(smaToRenalMm: number): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: [
      {
        name: "SMA",
        gapFromPreviousMm: 0,
        clock: "12:00",
        ostiumDiameterMm: 9,
      },
      {
        name: "LRA",
        gapFromPreviousMm: smaToRenalMm,
        clock: "2:30",
        ostiumDiameterMm: 6,
      },
      {
        name: "RRA",
        gapFromPreviousMm: 5,
        clock: "9:30",
        ostiumDiameterMm: 6,
      },
    ],
    fenestrate: ["LRA", "RRA"],
    aorta: { sealZoneDiameterMm: 26 },
  };
}

describe("juxtarenal anatomy", () => {
  it("caps the push-in at the inferior margin of the preserved SMA", () => {
    const anatomy = normalizeAnatomy(juxtarenalCase(18));

    expect(anatomy.fenestrations.map((vessel) => vessel.name)).toEqual([
      "LRA",
      "RRA",
    ]);
    expect(anatomy.preserved.map((vessel) => vessel.name)).toEqual(["SMA"]);
    // SMA at z=23, inferior margin 23-4.5, most proximal fenestration at z=5.
    expect(maxProximalDepthFromAnatomy(anatomy)).toBeCloseTo(13.5, 10);
  });

  it("solves inside the narrow window the SMA leaves", () => {
    const anatomy = normalizeAnatomy(juxtarenalCase(18));
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      maxProximalDepthMm: maxProximalDepthFromAnatomy(anatomy),
      fabricLengthMm: 90,
      wireRadiusMm: 0.5,
    });

    expect(solution.pose.proximalDepthMm).toBeGreaterThanOrEqual(
      MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
    );
    expect(solution.pose.proximalDepthMm).toBeLessThanOrEqual(13.5);
    expect(solution.clearances).toHaveLength(2);
  });

  it("reports that the SMA needs its own hole when the seal cannot fit", () => {
    const anatomy = normalizeAnatomy(juxtarenalCase(13));
    const field = buildClearanceField(zigzagRings(), CIRCUMFERENCE_MM);

    // SMA at z=18, inferior margin 13.5, first fenestration at z=5 → 8.5 mm.
    expect(maxProximalDepthFromAnatomy(anatomy)).toBeCloseTo(8.5, 10);

    const solution = solvePose(anatomy, uniformCircumference(CIRCUMFERENCE_MM), field, {
      maxProximalDepthMm: maxProximalDepthFromAnatomy(anatomy),
      fabricLengthMm: 90,
      wireRadiusMm: 0.5,
    });

    expect(solution.status).toBe("seal_zone_too_short");
  });
});

describe("solvePose on measured CT geometry", () => {
  it("solves a four-vessel case against a real descriptor quickly", () => {
    const descriptor = BENCH_CT_DEVICE_LIBRARY[0];
    const circumferenceMm = Math.PI * 32;
    const segments = buildBenchCtStrutSegments(descriptor, circumferenceMm);

    const anatomy = normalizeAnatomy({
      clockConvention: "axial_ct",
      vessels: [
        {
          name: "CELIAC",
          gapFromPreviousMm: 0,
          clock: "12:00",
          ostiumDiameterMm: 8,
        },
        {
          name: "SMA",
          gapFromPreviousMm: 20,
          clock: "12:00",
          ostiumDiameterMm: 9,
        },
        {
          name: "LRA",
          gapFromPreviousMm: 25,
          clock: "2:30",
          ostiumDiameterMm: 6,
        },
        {
          name: "RRA",
          gapFromPreviousMm: 4,
          clock: "9:30",
          ostiumDiameterMm: 6,
        },
      ],
      fenestrate: ["CELIAC", "SMA", "LRA", "RRA"],
      aorta: { sealZoneDiameterMm: 30, proximalLandingLengthMm: 30 },
    });

    const startedAt = performance.now();
    const field = buildClearanceField(segments, circumferenceMm);
    const solution = solvePose(anatomy, uniformCircumference(circumferenceMm), field, {
      maxProximalDepthMm: maxProximalDepthFromAnatomy(anatomy, 30),
      fabricLengthMm: 150,
      wireRadiusMm: 0.5,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(["conflict_free", "best_compromise"]).toContain(solution.status);
    expect(solution.clearances).toHaveLength(4);
    expect(solution.pose.proximalDepthMm).toBeGreaterThanOrEqual(
      MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
    );
    expect(elapsedMs).toBeLessThan(2000);
  });
});
