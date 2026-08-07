import { describe, expect, it } from "vitest";
import { BENCH_CT_DEVICE_LIBRARY } from "@/lib/devices";
import type { BenchCtDeviceDescriptor } from "@/lib/geometry/benchCtDeviceLibrary";

/**
 * Does each descriptor's wire map agree with its own apex rows?
 *
 * The two come from separate passes over the same DICOM series — the apices
 * from `endograft_geometry.py`, the map from `tools/extract_wire_map.py` — and
 * the second is fitted into the frame of the first. Nothing downstream can tell
 * whether that fit succeeded, so it has to be checked here: every stored apex is
 * the axial extreme of its own ring, so it must land on a measured metal
 * boundary at its own angle.
 *
 * `wire_map.datum_fit.apex_residual_p50_mm` records the extractor's own view of
 * this, but a median cannot see the failure that matters. With seven to ten
 * rings, every apex finds *some* run boundary near it whatever the frame, so
 * half the apices stay sub-millimetre even when the map is mirrored. The tail
 * and the handedness are what discriminate, and both are checked below.
 */

const THETA_BINS = 720;
const STEP_DEG = 360 / THETA_BINS;

function binFor(thetaDeg: number): number {
  const wrapped = ((thetaDeg % 360) + 360) % 360;
  const signed = wrapped > 180 ? wrapped - 360 : wrapped;
  return Math.min(
    THETA_BINS - 1,
    Math.max(0, Math.floor((signed + 180) / STEP_DEG)),
  );
}

/** Distance from every stored apex to the nearest measured metal boundary. */
function apexResiduals(
  descriptor: BenchCtDeviceDescriptor,
  { mirror = false, shiftDeg = 0 } = {},
): number[] {
  const map = descriptor.wire_map;
  if (!map) throw new Error(`${descriptor.device} has no wire map`);

  const residuals: number[] = [];
  for (const ring of descriptor.rings) {
    for (const apex of [...ring.proximal_apices, ...ring.distal_apices]) {
      const theta = (mirror ? -apex.theta_deg : apex.theta_deg) + shiftDeg;
      let nearest = Infinity;
      for (const [start, end] of map.runs[binFor(theta)]) {
        nearest = Math.min(
          nearest,
          Math.abs(start - apex.z_mm),
          Math.abs(end - apex.z_mm),
        );
      }
      residuals.push(nearest);
    }
  }
  return residuals;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fractionOver(values: number[], limitMm: number): number {
  return values.filter((value) => !(value <= limitMm)).length / values.length;
}

/** The best this handedness can do, with the rotation left free. */
function bestOverRotation(
  descriptor: BenchCtDeviceDescriptor,
  mirror: boolean,
): { medianMm: number; shiftDeg: number } {
  let best = { medianMm: Infinity, shiftDeg: 0 };
  for (let shiftDeg = -180; shiftDeg < 180; shiftDeg += STEP_DEG) {
    const medianMm = median(apexResiduals(descriptor, { mirror, shiftDeg }));
    if (medianMm < best.medianMm) best = { medianMm, shiftDeg };
  }
  return best;
}

describe("wire map datum", () => {
  for (const descriptor of BENCH_CT_DEVICE_LIBRARY) {
    const label = `${descriptor.device} ${descriptor.size}`;

    it(`${label}: stored apices land on measured metal`, () => {
      const residuals = apexResiduals(descriptor);

      // Gross registration. A median this tight only says the axial offset is
      // right; it is deliberately not the load-bearing assertion.
      expect(median(residuals)).toBeLessThan(1);

      // The tail is the load-bearing one. When the frame is recovered, 3 to 10%
      // of apices sit further than a millimetre from metal — those are the
      // peak-detector's own misplacements, documented in METHODS 4.1. When the
      // frame is mirrored it is 33 to 39%, because most apices then sit at the
      // angle their reflection occupies.
      expect(fractionOver(residuals, 1)).toBeLessThanOrEqual(0.2);
    });

    it(`${label}: the map is not mirrored relative to its apex rows`, () => {
      // `principal_axis` takes its in-plane basis from the fitted axis, so a
      // flipped axis sends theta to -theta. That is a reflection, and no
      // rotation undoes it — which is why the rotation is left free on both
      // sides here. If the device's own apices fit its reflected map better
      // than its stored one, the stored map is the reflection.
      const stored = bestOverRotation(descriptor, false);
      const mirrored = bestOverRotation(descriptor, true);

      expect(
        mirrored.medianMm,
        `${label}: reflecting the wire map fits its own apices better ` +
          `(${mirrored.medianMm.toFixed(3)} mm at ${mirrored.shiftDeg.toFixed(1)} deg) ` +
          `than the stored frame does (${stored.medianMm.toFixed(3)} mm at ` +
          `${stored.shiftDeg.toFixed(1)} deg). Regenerate with ` +
          `tools/extract_wire_map.py, which now fits the reflection.`,
      ).toBeGreaterThan(stored.medianMm);
    });
  }
});
