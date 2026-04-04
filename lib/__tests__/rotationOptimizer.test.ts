import { describe, it, expect } from "vitest";
import { optimiseRotation } from "@/lib/rotationOptimizer";
import { buildStrutSegments } from "@/lib/stentGeometry";
import { getDeviceById, selectSize } from "@/lib/devices";
import { circumferenceMm } from "@/lib/planning/geometry";
import { sampleCase } from "@/lib/sampleCase";
import type { Fenestration } from "@/lib/types";

describe("rotationOptimizer", () => {
  it("all-scallop case returns trivially valid result", () => {
    const fen: Fenestration = {
      vessel: "CUSTOM",
      ftype: "SCALLOP",
      clock: "12:00",
      depthMm: 20,
      widthMm: 10,
      heightMm: 10,
    };
    const circ = 100;
    const wireRadius = 0.5;
    const result = optimiseRotation([fen], [], circ, wireRadius, 0.1);

    expect(result.hasConflictFreeRotation).toBe(true);
    expect(result.validWindows).toHaveLength(1);
    expect(result.validWindows[0].startMm).toBe(0);
    expect(result.validWindows[0].endMm).toBe(circ);
  });

  it("sampleCase finds a conflict-free window", () => {
    // Cook device with sampleCase
    const device = getDeviceById("zfen_plus")!;
    const size = selectSize(device, sampleCase.neckDiameterMm)!;
    const circ = circumferenceMm(size.graftDiameter);
    // Rough estimate of nPeaks and seal zone for test
    const nPeaks = 10;
    const sealZoneHeight = 15;
    const segs = buildStrutSegments(device, size.graftDiameter, nPeaks, sealZoneHeight);
    
    const result = optimiseRotation(
      sampleCase.fenestrations,
      segs,
      circ,
      device.wireRadius,
      0.5
    );

    expect(result.hasConflictFreeRotation).toBe(true);
    expect(result.validWindows.length).toBeGreaterThan(0);
  });

  it("Optimal delta is within [0, circ)", () => {
    const fen: Fenestration = {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "6:00",
      depthMm: 30,
      widthMm: 6,
      heightMm: 6,
    };
    const circ = 100;
    // Cover circumference densely with struts except for interval [70, 80]
    // A strut every 5 mm
    const segs: [number, number, number, number][] = [];
    for (let x = 0; x < circ; x += 5) {
      if (x >= 70 && x <= 80) continue;
      segs.push([x, 0, x, 50]);
    }

    const result = optimiseRotation([fen], segs, circ, 0.5, 1);
    expect(result.optimalDeltaMm).toBeGreaterThanOrEqual(0);
    expect(result.optimalDeltaMm).toBeLessThan(circ);
  });

  it("scanData length is deterministic", () => {
    const circ = 100;
    const step = 0.2;
    const result = optimiseRotation([], [], circ, 0.5, step);
    const expectedLength = Math.ceil(circ / step) + 1;
    expect(result.scanData.length).toBe(expectedLength);
  });

  it("Valid windows are non-overlapping and sorted", () => {
    const fn1: Fenestration = {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "3:00",
      depthMm: 20,
      widthMm: 6,
      heightMm: 6,
    };
    const circ = 100;
    const segs: [number, number, number, number][] = [
      [20, 0, 20, 50],
      [40, 0, 40, 50],
      [80, 0, 80, 50]
    ];
    const result = optimiseRotation([fn1], segs, circ, 0.5, 0.5);

    expect(result.validWindows.length).toBeGreaterThan(0);
    for (let i = 0; i < result.validWindows.length - 1; i++) {
      expect(result.validWindows[i].endMm).toBeLessThanOrEqual(result.validWindows[i+1].startMm);
    }
  });
});
