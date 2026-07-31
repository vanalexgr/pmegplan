import { describe, expect, it } from "vitest";

import type { AnatomyCase } from "@/lib/planning/anatomy";
import { buildGraftModel, planGraft, requiredGraftLengthMm } from "@/lib/planning/plan";
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
    aorta: { sealZoneDiameterMm: 26 },
  };
}

describe("requiredGraftLengthMm", () => {
  it("adds the seal, the fixed pattern span, and a distal allowance", () => {
    const anatomy = normalizeAnatomy(taaaCase(36));

    expect(anatomy.fenestrationSpanMm).toBe(45);
    expect(requiredGraftLengthMm(anatomy)).toBe(85);
    expect(requiredGraftLengthMm(anatomy, 0)).toBe(55);
  });
});

describe("buildGraftModel", () => {
  it("treats the proximal covered ring as a different stent from the body", () => {
    for (const scanId of ["scan1", "scan2", "scan3"] as const) {
      const { sealingRing } = buildGraftModel(scanId);

      expect(sealingRing.differsFromBody).toBe(true);
      // Taller than the rings below it on every device scanned so far.
      expect(sealingRing.heightMm).toBeGreaterThan(sealingRing.bodyHeightMm);
      expect(sealingRing.fromDepthMm).toBeLessThan(sealingRing.toDepthMm);
    }
  });

  it("judges oversizing at the sealing ring, not the fabric surface", () => {
    const model = buildGraftModel("scan1");

    expect(model.proximalDiameterMm).toBe(model.sealingRing.diameterMm);
    // The Alpha's sealing ring is narrower than its body rings, so taking the
    // body diameter would overstate oversizing.
    expect(model.sealingRing.diameterMm).toBeLessThan(
      model.sealingRing.bodyDiameterMm,
    );
  });

  it("puts the anatomically proximal end first on an inverted scan", () => {
    // scan2 was scanned tail-first: its 42 mm end is the sealing end, and the
    // descriptor's first ring is the 32 mm one.
    const tx2 = buildGraftModel("scan2");

    expect(tx2.sealingRing.diameterMm).toBeGreaterThan(
      tx2.sealingRing.bodyDiameterMm,
    );
    expect(tx2.sealingRing.diameterMm).toBeCloseTo(42.6, 1);
  });

  it("finds a bare fixation ring on the Alphas and none on the TX2", () => {
    for (const scanId of ["scan1", "scan3"] as const) {
      const model = buildGraftModel(scanId);
      expect(
        model.renderModel.rings.some((ring) => ring.kind === "bare_fixation"),
      ).toBe(true);
      // It sits proximal to the fabric, so its wire is at negative depth.
      expect(model.renderModel.minimumZMm).toBeLessThan(-5);
      expect(model.renderModel.barbs.length).toBeGreaterThan(0);
    }

    const tx2 = buildGraftModel("scan2");
    expect(
      tx2.renderModel.rings.every((ring) => ring.kind === "covered"),
    ).toBe(true);
    expect(tx2.renderModel.barbs).toHaveLength(0);
  });
});

describe("planGraft", () => {
  it("picks a scanned device and solves a pose in one pass", () => {
    const plan = planGraft(taaaCase(36));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    // The device must be one that was actually scanned, not a scaled proxy.
    expect(["scan1", "scan2", "scan3"]).toContain(plan.graft.scan.reference.id);
    expect(plan.graft.fabricLengthMm).toBeGreaterThanOrEqual(plan.requiredLengthMm);
    expect(plan.openings).toHaveLength(4);
    expect(plan.solution.clearances).toHaveLength(4);
  });

  it("keeps the chosen device inside the oversizing window", () => {
    const plan = planGraft(taaaCase(36));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.oversizeFraction).toBeGreaterThanOrEqual(0.1);
    expect(plan.oversizeFraction).toBeLessThanOrEqual(0.3);
  });

  it("reports every scanned device it weighed, with a reason for each rejection", () => {
    const plan = planGraft(taaaCase(36));

    expect(plan.considered).toHaveLength(3);
    for (const fit of plan.considered) {
      if (fit.rejection !== null) expect(fit.rejection).not.toHaveLength(0);
    }
  });

  it("takes geometry from the bench CT rather than a nominal specification", () => {
    const plan = planGraft(taaaCase(36));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const { renderModel, segments } = plan.graft;
    expect(renderModel.rings.length).toBeGreaterThan(0);
    // Apices are measured, so ring spacing is irregular; a parametric waveform
    // would put every ring at an identical pitch.
    const ringTops = renderModel.rings.map((ring) =>
      Math.min(...ring.points.map((point) => point.zMm)),
    );
    const pitches = ringTops.slice(1).map((top, index) => top - ringTops[index]);
    const spread = Math.max(...pitches) - Math.min(...pitches);
    expect(spread).toBeGreaterThan(0.5);
    expect(segments.length).toBeGreaterThan(renderModel.rings.length);
  });

  it("honours the 10 mm seal floor on every plan it returns", () => {
    for (const diameter of [26, 34, 36, 38]) {
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
    const plan = planGraft(taaaCase(36), { maxRotationDeg: 30 });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(Math.abs(plan.solution.pose.rotationDeg)).toBeLessThanOrEqual(30);
  });

  it("reuses a cached graft model instead of rebuilding the clearance field", () => {
    const cache = new Map();

    const first = planGraft(taaaCase(36), {}, cache);
    expect(cache.size).toBeGreaterThan(0);

    // Different anatomy, same seal-zone diameter: the lattice is unchanged, so
    // the identical model object has to come back rather than a rebuilt one.
    const moved = taaaCase(36);
    moved.vessels[2].gapFromPreviousMm = 26;
    const second = planGraft(moved, {}, cache);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.graft).toBe(first.graft);
    expect(second.graft.field).toBe(first.graft.field);
  });

  it("rejects an anatomy error without pretending to have sized anything", () => {
    const broken = taaaCase(36);
    broken.fenestrate = [];

    const plan = planGraft(broken);

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.anatomy).toBeNull();
    expect(plan.reason).toMatch(/at least one fenestration/);
  });

  it("declines the gap between the scanned sizes instead of stretching into it", () => {
    // Sealing rings measure 29.7, 40.7 and 42.6 mm, so at 10-30% oversizing the
    // library covers roughly 23-27 mm and 31-39 mm of aorta. A 30 mm seal zone
    // falls between them, and the honest answer is to scan a device for it.
    const plan = planGraft(taaaCase(30));

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    // Too small below the gap, too large above it.
    expect(
      plan.considered.some((fit) => /undersized/.test(fit.rejection ?? "")),
    ).toBe(true);
    expect(
      plan.considered.some((fit) => /infolding/.test(fit.rejection ?? "")),
    ).toBe(true);
  });

  it("declines an aorta no scanned device covers rather than scaling one up", () => {
    const plan = planGraft(taaaCase(120));

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.anatomy).not.toBeNull();
    expect(plan.considered).toHaveLength(3);
    // Every device was set aside for being far too small, and says so.
    for (const fit of plan.considered) {
      expect(fit.rejection).toMatch(/undersized/);
    }
  });

  it("declines when the pattern is longer than any scanned device's fabric", () => {
    const long = taaaCase(36);
    long.vessels[2].gapFromPreviousMm = 200;

    const plan = planGraft(long);

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.considered.every((fit) => /fabric/.test(fit.rejection ?? ""))).toBe(
      true,
    );
  });
});
