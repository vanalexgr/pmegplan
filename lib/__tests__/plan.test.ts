import { describe, expect, it } from "vitest";

import type { AnatomyCase } from "@/lib/planning/anatomy";
import {
  buildGraftModel,
  oversizeWarning,
  planGraft,
  requiredGraftLengthMm,
} from "@/lib/planning/plan";
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

  it("judges oversizing on the labelled diameter, not a measured one", () => {
    // The measured sealing ring is 40.7 mm on a device labelled 42. Sizing
    // against the measurement would report 13% oversizing in a 36 mm aorta
    // where the label gives 16.7%, and understating oversizing is the direction
    // that makes an undersized device look acceptable.
    const model = buildGraftModel("scan1");

    expect(model.proximalDiameterMm).toBe(42);
    expect(model.sealingRing.diameterMm).toBeLessThan(41);
    expect(model.proximalDiameterMm).toBeGreaterThan(
      model.sealingRing.diameterMm,
    );
  });

  it("keeps the unrolled circumference on measured geometry", () => {
    // Sizing switches to the label; the frame the wire and holes share must not,
    // or every strut moves relative to every opening.
    const model = buildGraftModel("scan1");

    expect(model.circumferenceMm).toBeLessThan(Math.PI * 42);
    expect(model.circumferenceMm).toBeCloseTo(
      Math.PI * model.renderModel.diameterAt(0),
      6,
    );
  });

  it("names the device by its catalog code and ordered size", () => {
    const alpha = buildGraftModel("scan1");
    expect(alpha.naming.code).toBe("ZTA-P-42");
    expect(alpha.naming.size).toBe("42 × 173 mm");
    expect(alpha.naming.platformLabel).toBe("Cook Zenith Alpha Thoracic");

    // A tapered device is named with both ends.
    const tx2 = buildGraftModel("scan2");
    expect(tx2.naming.code).toBe("ZTEG-2PT-42-32");
    expect(tx2.naming.size).toBe("42 → 32 × 165 mm");

    // The size is still inferred from the scan, never read off packaging.
    expect(alpha.naming.sizeConfirmed).toBe(false);
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
    // With no clearance to chase, the solver should take the shallowest pose
    // that merely clears rather than the one that clears best.
    const relaxed = planGraft(juxtarenalCase(22), { targetClearanceMm: 0 });
    const chasing = planGraft(juxtarenalCase(22), { targetClearanceMm: 1 });

    expect(relaxed.ok && chasing.ok).toBe(true);
    if (!relaxed.ok || !chasing.ok) return;

    expect(relaxed.solution.marginMm).toBeGreaterThan(0);
    expect(relaxed.solution.pose.proximalDepthMm).toBeLessThanOrEqual(
      chasing.solution.pose.proximalDepthMm,
    );
    // Close to the seal floor: the measured wire leaves 10.00 mm itself
    // conflicted, so "shallowest that clears" is just above it rather than on it.
    expect(relaxed.solution.pose.proximalDepthMm).toBeLessThan(12);
  });

  it("reports the SMA as the blocker when it sits too close to the renals", () => {
    const plan = planGraft(juxtarenalCase(9));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.solution.status).toBe("seal_zone_too_short");
    expect(plan.depthLimit.limitingVesselName).toBe("SMA");
    expect(plan.depthLimit.maxDepthMm).toBeLessThan(10);
  });

  it("solves every usable device, not only the one it picks", () => {
    const plan = planGraft(taaaCase(36));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const usable = plan.considered.filter((fit) => fit.rejection === null);
    expect(usable.length).toBeGreaterThan(1);
    // Each carries its own pose, so the choice between them can be compared.
    for (const fit of usable) {
      expect(fit.solution).not.toBeNull();
      expect(fit.openings.length).toBe(plan.anatomy.fenestrations.length);
    }
    // A device set aside on sizing was never solved.
    for (const fit of plan.considered.filter((f) => f.rejection !== null)) {
      expect(fit.solution).toBeNull();
    }
  });

  it("uses the device asked for instead of the recommendation", () => {
    const auto = planGraft(taaaCase(36));
    expect(auto.ok).toBe(true);
    if (!auto.ok) return;

    const other = auto.considered.find(
      (fit) =>
        fit.rejection === null &&
        fit.model.scan.reference.id !== auto.recommendedScanId,
    );
    if (!other) throw new Error("Expected a second usable device");

    const forced = planGraft(taaaCase(36), {
      scanId: other.model.scan.reference.id,
    });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;

    expect(forced.selectedScanId).toBe(other.model.scan.reference.id);
    expect(forced.recommendedScanId).toBe(auto.recommendedScanId);
    expect(forced.overridden).toBe(true);
    expect(forced.graft.scan.reference.id).toBe(other.model.scan.reference.id);
    // The pose is the one that device gives, not the recommendation's.
    expect(forced.solution.pose).toEqual(other.solution?.pose);
  });

  it("marks the unprompted choice as not overridden", () => {
    const plan = planGraft(taaaCase(36));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.overridden).toBe(false);
    expect(plan.selectedScanId).toBe(plan.recommendedScanId);
  });

  it("falls back to the recommendation when the chosen device stops fitting", () => {
    // A choice made for one anatomy must not lose the plan when the pattern
    // outgrows that device's fabric.
    // A pattern needing 173 mm of fabric: past scan1's 167 mm, inside
    // scan3's 185 mm, so one device survives and the choice must move to it.
    const long = taaaCase(36);
    long.vessels[2].gapFromPreviousMm = 110;
    const plan = planGraft(long, { scanId: "scan1" });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const scan1 = plan.considered.find(
      (fit) => fit.model.scan.reference.id === "scan1",
    );
    expect(scan1?.rejection).not.toBeNull();
    expect(plan.selectedScanId).toBe(plan.recommendedScanId);
  });

  it("plans an out-of-window device rather than refusing, and flags it", () => {
    // Oversizing is a clinical judgement, and with three devices refusing on it
    // leaves real anatomy with no plan at all. The device is planned and
    // flagged; the recommendation still prefers one inside the window.
    const plan = planGraft(taaaCase(30));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const flagged = plan.considered.filter(
      (fit) => fit.oversizeOutOfRange !== null,
    );
    expect(flagged.length).toBeGreaterThan(0);
    for (const fit of flagged) {
      expect(fit.solution).not.toBeNull();
      expect(oversizeWarning(fit)).not.toBeNull();
    }
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

  it("shows the gap between the scanned sizes rather than hiding it", () => {
    // Nominal diameters are 32, 42 and 42, so at 10-30% oversizing the library
    // covers roughly 25-29 mm and 32-38 mm of aorta. A 30 mm seal zone falls
    // between them: every device is out of window, in both directions.
    const plan = planGraft(taaaCase(30));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(
      plan.considered.every((fit) => fit.oversizeOutOfRange !== null),
    ).toBe(true);
    expect(
      plan.considered.some((fit) => fit.oversizeOutOfRange === "under"),
    ).toBe(true);
    expect(
      plan.considered.some((fit) => fit.oversizeOutOfRange === "over"),
    ).toBe(true);
  });

  it("flags every device as undersized for an aorta none of them covers", () => {
    const plan = planGraft(taaaCase(120));

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.considered).toHaveLength(3);
    for (const fit of plan.considered) {
      expect(fit.oversizeFraction).toBeLessThan(0);
      expect(oversizeWarning(fit)).toMatch(/undersized/);
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
