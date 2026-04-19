import { describe, expect, it } from "vitest";

import { optimiseDepth } from "@/lib/depthOptimizer";
import type { Fenestration } from "@/lib/types";

describe("depthOptimizer", () => {
  const fenestrations: Fenestration[] = [
    {
      vessel: "RRA",
      ftype: "SMALL_FEN",
      clock: "9:30",
      depthMm: 14,
      widthMm: 6,
      heightMm: 6,
    },
    {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "2:30",
      depthMm: 14,
      widthMm: 6,
      heightMm: 6,
    },
  ];

  it("caps positive depth shift using proximal anatomy", () => {
    const result = optimiseDepth(
      fenestrations,
      0,
      [],
      100,
      0.5,
      30,
      1,
    );

    expect(result.hasConflictFreeDepth).toBe(true);
    expect(result.scanMax).toBe(1);
    expect(result.optimalDeltaMm).toBe(0);
  });

  it("forces a shallower shift when the current design already covers a landmark", () => {
    const result = optimiseDepth(
      fenestrations,
      0,
      [],
      100,
      0.5,
      30,
      -4,
    );

    expect(result.hasConflictFreeDepth).toBe(true);
    expect(result.scanMax).toBe(-4);
    expect(result.optimalDeltaMm).toBe(-4);
    expect(result.adjustedDepths).toEqual([10, 10]);
  });
});
