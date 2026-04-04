import { describe, it, expect } from "vitest";
import { checkConflict, minDistToStruts } from "@/lib/conflictDetection";
import type { Fenestration, StrutSegment } from "@/lib/types";

describe("conflictDetection", () => {
  const circ = 100;
  const wireRadius = 0.5;

  it("returns no conflict at centre of open gap", () => {
    // Single strut at x=0
    const segs: StrutSegment[] = [[0, 0, 0, 50]];
    // Fenestration at arc 50 (far from strut)
    const fen: Fenestration = {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "6:00", // 6:00 on 100mm circ is 50mm
      depthMm: 25,
      widthMm: 6,
      heightMm: 6,
    };
    
    // 6:00 maps to 50mm on a 100mm circumference.
    const result = checkConflict(fen, segs, circ, wireRadius);
    expect(result.conflict).toBe(false);
  });

  it("returns conflict when fenestration overlaps strut", () => {
    // Strut at x=50
    const segs: StrutSegment[] = [[50, 0, 50, 50]];
    const fen: Fenestration = {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "6:00", // arc 50
      depthMm: 25,
      widthMm: 6,
      heightMm: 6,
    };
    
    const result = checkConflict(fen, segs, circ, wireRadius);
    expect(result.conflict).toBe(true);
  });

  it("handles wrap-around correctly", () => {
    // Strut at x=99
    const segs: StrutSegment[] = [[99, 0, 99, 50]];
    // Fenestration at x=1 (12:00 + small delta ~ 1mm)
    const fen: Fenestration = {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "12:00", // arc 0
      depthMm: 25,
      widthMm: 6,
      heightMm: 6,
    };
    
    // Testing wrap directly with deltaArcMm = 2 (so arc is at 2mm). The strut is at 99mm.
    // 99 + 3 (half width) = 102 wrap to 2 -> conflict.
    const result = checkConflict(fen, segs, circ, wireRadius, 2);
    // dist between 2 and 99 on circ 100 is 3. 
    // safe threshold = 3 (half width) + 0.5 (wire) = 3.5. So 3 < 3.5, should conflict
    expect(result.conflict).toBe(true);
  });

  it("excludes scallops from round-fenestration checks", () => {
    // Strut at x=50
    const segs: StrutSegment[] = [[50, 0, 50, 50]];
    const fen: Fenestration = {
      vessel: "LRA",
      ftype: "SCALLOP",
      clock: "6:00", // arc 50
      depthMm: 25,
      widthMm: 6,
      heightMm: 6,
    };
    
    const result = checkConflict(fen, segs, circ, wireRadius);
    expect(result.conflict).toBe(false);
  });

  it("minDistToStruts returns positive distance for clear positions", () => {
    const segs: StrutSegment[] = [[0, 0, 0, 10]];
    const dist = minDistToStruts(50, 5, segs, 100);
    expect(dist).toBeGreaterThan(45);
  });
});
