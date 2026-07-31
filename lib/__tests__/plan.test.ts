import { describe, expect, it } from "vitest";

import type { AnatomyCase } from "@/lib/planning/anatomy";
import { planGraft, requiredGraftLengthMm } from "@/lib/planning/plan";
import { normalizeAnatomy } from "@/lib/planning/anatomy";

/** Four-vessel thoracoabdominal: celiac, SMA and both renals fenestrated. */
function taaaCase(sealZoneDiameterMm: number): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: [
      { name: "CELIAC", gapFromPreviousMm: 0, clock: "12:00", ostiumDiameterMm: 8 },
      { name: "SMA", gapFromPreviousMm: 18, clock: "12:30", ostiumDiameterMm: 9 },
      { name: "LRA", gapFromPreviousMm: 22, clock: "3:30", ostiumDiameterMm: 6 },
      { name: "RRA", gapFromPreviousMm: 5, clock: "9:00", ostiumDiameterMm: 6 },
    ],
    fenestrate: ["CELIAC", "SMA", "LRA", "RRA"],
    aorta: { sealZoneDiameterMm },
  };
}

/** Juxtarenal: renals only, SMA preserved and therefore capping the push-in. */
function juxtarenalCase(smaToRenalMm: number): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: [
      { name: "CELIAC", gapFromPreviousMm: 0, ostiumDiameterMm: 8 },
      { name: "SMA", gapFromPreviousMm: 18, ostiumDiameterMm: 9 },
      { name: "LRA", gapFromPreviousMm: smaToRenalMm, clock: "3:30", ostiumDiameterMm: 6 },
      { name: "RRA", gapFromPreviousMm: 5, clock: "9:00", ostiumDiameterMm: 6 },
    ],
    fenestrate: ["LRA", "RRA"],
    aorta: { sealZoneDiameterMm: 30 },
  };
}

describe("requiredGraftLengthMm", () => {
  it("adds the seal, the fixed pattern span, and a distal allowance", () => {
    const anatomy = normalizeAnatomy(taaaCase(30));

    expect(anatomy.fenestrationSpanMm).toBe(45);
    expect(requiredGraftLengthMm(anatomy)).toBe(85);
    expect(requiredGraftLengthMm(anatomy, 0)).toBe(55);
  });
});

describe("planGraft", () => {
  it("sizes from the seal-zone diameter and solves a pose in one pass", () => {
    const plan = planGraft(taaaCase(30));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.graft.selection.component.proximalAorticRangeMm.min).toBeLessThanOrEqual(30);
    expect(plan.graft.selection.component.proximalAorticRangeMm.max).toBeGreaterThanOrEqual(30);
    expect(plan.graft.selection.selectedLengthMm).toBeGreaterThanOrEqual(
      plan.requiredLengthMm,
    );
    expect(plan.openings).toHaveLength(4);
    expect(plan.solution.clearances).toHaveLength(4);
  });

  it("honours the 10 mm seal floor on every plan it returns", () => {
    for (const diameter of [26, 30, 34, 38]) {
      const plan = planGraft(taaaCase(diameter));
      if (!plan.ok) continue;
      expect(plan.solution.pose.proximalDepthMm).toBeGreaterThanOrEqual(10);
    }
  });

  it("lets the SMA cap the juxtarenal push-in and still clears the wire", () => {
    const plan = planGraft(juxtarenalCase(22));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.depthLimit.limitingVesselName).toBe("SMA");
    expect(plan.solution.status).toBe("conflict_free");
    // SMA centre 22 mm above the renal, less half its 9 mm ostium.
    expect(plan.depthLimit.maxDepthMm).toBeCloseTo(17.5, 10);
    expect(plan.solution.pose.proximalDepthMm).toBeGreaterThanOrEqual(10);
    expect(plan.solution.pose.proximalDepthMm).toBeLessThanOrEqual(17.5);
  });

  it("does not push deeper than a pose that already meets the target", () => {
    // With no target to chase the solver has no reason to leave the seal floor.
    const plan = planGraft(juxtarenalCase(22), { targetClearanceMm: 0 });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.solution.pose.proximalDepthMm).toBe(10);
    expect(plan.solution.marginMm).toBeGreaterThan(0);
  });

  it("reports the SMA as the blocker when it sits too close to the renals", () => {
    const plan = planGraft(juxtarenalCase(9));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.solution.status).toBe("seal_zone_too_short");
    expect(plan.depthLimit.limitingVesselName).toBe("SMA");
    expect(plan.depthLimit.maxDepthMm).toBeLessThan(10);
  });

  it("keeps the turn inside the cap it was given", () => {
    const plan = planGraft(taaaCase(30), { maxRotationDeg: 30 });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(Math.abs(plan.solution.pose.rotationDeg)).toBeLessThanOrEqual(30);
  });

  it("reuses a cached graft model instead of rebuilding the clearance field", () => {
    const cache = new Map();

    const first = planGraft(taaaCase(30), {}, cache);
    expect(cache.size).toBeGreaterThan(0);

    // Different anatomy, same seal-zone diameter: the lattice is unchanged, so
    // the identical model object has to come back rather than a rebuilt one.
    const moved = taaaCase(30);
    moved.vessels[2].gapFromPreviousMm = 26;
    const second = planGraft(moved, {}, cache);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.graft).toBe(first.graft);
    expect(second.graft.field).toBe(first.graft.field);
  });

  it("rejects an anatomy error without pretending to have sized anything", () => {
    const broken = taaaCase(30);
    broken.fenestrate = [];

    const plan = planGraft(broken);

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.anatomy).toBeNull();
    expect(plan.reason).toMatch(/at least one fenestration/);
  });

  it("reports a sizing failure rather than extrapolating past the catalog", () => {
    const plan = planGraft(taaaCase(120));

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.anatomy).not.toBeNull();
    expect(plan.sizingFailures.length).toBeGreaterThan(0);
  });
});
