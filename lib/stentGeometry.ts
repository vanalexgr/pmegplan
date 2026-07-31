import { getEffectiveRingGeometry } from "@/lib/devices";
import {
  evalMStentDepth,
  getEndurantProfile,
} from "@/lib/mstentProfile";
import {
  evalTreoDepth,
  TREO_PROFILE_Y_MAX,
} from "@/lib/treoProfile";
import {
  buildRingSegments,
  pushPoint,
  pointsToSegments,
} from "@/lib/geometry/waveform";
import {
  buildBenchCtRenderModel,
  sampleBenchCtRing,
} from "@/lib/geometry/benchCtRenderModel";
import { wrapMm } from "@/lib/planning/geometry";
import type { BenchCtDeviceDescriptor } from "@/lib/geometry/benchCtDeviceLibrary";
import type { WaveformPattern } from "@/lib/geometry/waveform";
import type { DeviceGeometry, StrutSegment } from "@/lib/types";

interface StrutLayoutProfile {
  pattern: WaveformPattern;
  phaseFractions: number[];
  mShoulderRatio?: number;
  sinusoidSamplesPerWave?: number;
}

/**
 * Wire segments straight from the scan's metal segmentation.
 *
 * Each angular bin contributes one short axial stroke per interval of measured
 * metal. Bins sit half a degree apart — well under a fifth of a millimetre on
 * these devices — so the strokes rasterise into a continuous wire without any
 * curve being assumed between them.
 *
 * This is the difference between a CT-derived plan and a plausible one: the
 * apex path below interpolates through fourteen points per ring, whereas the
 * scan resolves several thousand intervals per device, including the bare
 * fixation ring and its barbs.
 */
function buildWireMapSegments(
  descriptor: BenchCtDeviceDescriptor,
  circumferenceMm: number,
  model: ReturnType<typeof buildBenchCtRenderModel>,
): StrutSegment[] {
  const map = descriptor.wire_map;
  if (!map) return [];

  const axialFlip = descriptor.rendering?.anatomical_proximal_z === "high";
  const toRenderZ = (zMm: number) => {
    const rebased = zMm - model.fabricStartMm;
    return axialFlip ? model.fabricLengthMm - rebased : rebased;
  };

  const segments: StrutSegment[] = [];
  const step = map.theta_step_deg;
  for (const [bin, runs] of map.runs.entries()) {
    if (runs.length === 0) continue;
    // Bin centres, matching the extractor's [-180, 180) binning. Wrapped into
    // [0, circumference) because every stroke here is vertical — one arc
    // position, two depths — so wrapping cannot split one across the seam, and
    // consumers that draw in [0, circumference) would otherwise lose the half
    // of the device sitting at negative arc.
    const thetaDeg = -180 + (bin + 0.5) * step;
    const arcMm = wrapMm((thetaDeg / 360) * circumferenceMm, circumferenceMm);
    for (const [startMm, endMm] of runs) {
      segments.push([arcMm, toRenderZ(startMm), arcMm, toRenderZ(endMm)]);
    }
  }
  return segments;
}

/**
 * Build wire segments from a bench CT descriptor.
 *
 * Prefers the measured wire map; falls back to interpolating between apex rows
 * for descriptors written before the map existed.
 *
 * `circumferenceMm` permits rendering at the scanned nominal circumference;
 * callers should not use it to extrapolate the free-state scan to another
 * graft diameter.
 */
export function buildBenchCtStrutSegments(
  descriptor: BenchCtDeviceDescriptor,
  circumferenceMm: number,
): StrutSegment[] {
  const segments: StrutSegment[] = [];
  const model = buildBenchCtRenderModel(descriptor);

  if (descriptor.wire_map) {
    return buildWireMapSegments(descriptor, circumferenceMm, model);
  }

  for (const ring of model.rings) {
    const measured = [...ring.points].sort(
      (left, right) => left.thetaRad - right.thetaRad,
    );
    if (measured.length < 2) continue;
    // Nitinol wire runs in curves between apices rather than straight chords —
    // clearly so on the Zenith Alpha fixation ring. Interpolating between the
    // measured apices tracks the real path; a chord cuts the corner and would
    // report clearance the fabric does not have.
    const pointsOnRing = sampleBenchCtRing(measured);

    const points: Array<[number, number]> = pointsOnRing.map((point) => [
      (point.thetaRad / (Math.PI * 2)) * circumferenceMm,
      point.zMm,
    ]);
    // Add the first point one circumference later, retaining the closing wire
    // across 0° for the punch-card renderer's wrap-aware drawing code.
    points.push([points[0][0] + circumferenceMm, points[0][1]]);
    segments.push(...pointsToSegments(points));
  }

  return segments;
}

function getPhaseFraction(
  phaseFractions: number[],
  ringIndex: number,
) {
  return phaseFractions[ringIndex] ?? phaseFractions[phaseFractions.length - 1] ?? 0;
}

function getStrutLayoutProfile(device: DeviceGeometry): StrutLayoutProfile {
  switch (device.id) {
    case "treo":
      return {
        pattern: "sinusoidal",
        phaseFractions: [0, 0, 0, 0],           // all rings in-phase
        sinusoidSamplesPerWave: 16,
      };
    case "valiant":
      return {
        pattern: "sinusoidal",
        phaseFractions: [0, 0, 0, 0],           // IFU: all rings in-phase
        sinusoidSamplesPerWave: 16,
      };
    case "zenith_alpha":
    default:
      return {
        pattern: "zigzag",
        phaseFractions: [0, 0, 0, 0, 0],   // IFU: valleys follow valleys (in-phase)
      };
  }
}

export function buildStrutSegments(
  device: DeviceGeometry,
  circumferenceMm: number,
  graftDiameterMm: number,
  nPeaks: number,
): StrutSegment[] {
  if (device.benchCtDescriptor) {
    return buildBenchCtStrutSegments(device.benchCtDescriptor, circumferenceMm);
  }
  const size = device.sizes.find(
    (candidate) => candidate.graftDiameter === graftDiameterMm,
  ) ?? null;
  const { ringHeight, interRingGap } = getEffectiveRingGeometry(device, size);
  const { nRings } = device;

  if (device.id === "treo") {
    return buildTreoStrutSegments(
      circumferenceMm,
      nPeaks,
      ringHeight,
      interRingGap,
      nRings,
      device.proximalRingOffsetMm ?? 0,
    );
  }

  if (device.id === "endurant_ii") {
    return buildEndurantStrutSegments(
      circumferenceMm,
      ringHeight,
      interRingGap,
      nRings,
      device.proximalRingOffsetMm ?? 0,
    );
  }

  const profile = getStrutLayoutProfile(device);
  const segments: StrutSegment[] = [];
  let y = 0;

  for (let ringIndex = 0; ringIndex < nRings; ringIndex += 1) {
    segments.push(...buildRingSegments(circumferenceMm, y, {
      pattern: profile.pattern,
      waveWidthMm: circumferenceMm / nPeaks,
      ringHeightMm: ringHeight,
      phaseFraction: getPhaseFraction(profile.phaseFractions, ringIndex),
      sinusoidSamples: profile.sinusoidSamplesPerWave,
      mShoulderRatio: profile.mShoulderRatio,
    }, nPeaks));
    y += ringHeight + interRingGap;
  }

  return segments;
}

export function getSealZoneHeightMm(device: DeviceGeometry) {
  if (device.benchCtDescriptor) {
    return buildBenchCtRenderModel(device.benchCtDescriptor).fabricLengthMm;
  }
  return (
    (device.proximalRingOffsetMm ?? 0) +
    device.nRings * device.ringHeight +
    Math.max(0, device.nRings - 1) * device.interRingGap
  );
}

// ── Sinusoidal ring segments ─────────────────────────────────────────────────
//
// Devices such as Valiant and TREO use smooth sinusoidal ring frames rather than
// sharp Z-stent zigzags. We approximate each ring with dense piecewise-linear
// segments so both rendering and conflict detection see the same wire path.
const N_SINUS = 12; // samples per half-period (per peak)

export function buildSinusoidalStrutSegments(
  circ: number,
  ringHeight: number,
  gapHeight: number,
  nRings: number,
  nPeaks: number,
  startOffset = 0,
): StrutSegment[] {
  const segments: StrutSegment[] = [];
  const totalPoints = nPeaks * N_SINUS * 2;
  const dx = circ / totalPoints;

  for (let ringIndex = 0; ringIndex < nRings; ringIndex += 1) {
    const z0 = startOffset + ringIndex * (ringHeight + gapHeight);
    const phaseOffset = (ringIndex % 2) * (circ / (2 * nPeaks));
    const ringPoints: Array<[number, number]> = [];

    for (let i = 0; i <= totalPoints; i += 1) {
      const x = (i * dx + phaseOffset) % circ;
      const xRaw = i * dx + phaseOffset;
      const y =
        z0 +
        (ringHeight / 2) *
          (1 - Math.cos((2 * Math.PI * nPeaks * xRaw) / circ));
      ringPoints.push([x, y]);
    }

    for (let i = 0; i < ringPoints.length - 1; i += 1) {
      const [ax, ay] = ringPoints[i];
      const [bx, by] = ringPoints[i + 1];
      segments.push([ax, ay, bx, by]);
    }
  }

  return segments;
}

function buildEndurantStrutSegments(
  circMm: number,
  ringHeightMm: number,
  gapMm: number,
  nRings: number,
  startOffset = 0,
  samplesPerMm = 4,
): StrutSegment[] {
  const segments: StrutSegment[] = [];
  const nSamples = Math.ceil(circMm * samplesPerMm);

  for (let ringIndex = 0; ringIndex < nRings; ringIndex += 1) {
    const profile = getEndurantProfile(ringIndex);
    const ringTopMm = startOffset + ringIndex * (ringHeightMm + gapMm);
    const points: Array<[number, number]> = [];

    for (let sampleIndex = 0; sampleIndex <= nSamples; sampleIndex += 1) {
      const arcMm = (sampleIndex / nSamples) * circMm;
      const rawDepth = evalMStentDepth(arcMm, profile, circMm);
      const depthInRing = (rawDepth / 10) * ringHeightMm;
      pushPoint(points, [arcMm, ringTopMm + depthInRing]);
    }

    segments.push(...pointsToSegments(points));
  }

  return segments;
}

function buildTreoStrutSegments(
  circMm: number,
  nPeaks: number,
  ringHeightMm: number,
  gapMm: number,
  nRings: number,
  startOffset = 0,
  samplesPerMm = 4,
): StrutSegment[] {
  const segments: StrutSegment[] = [];
  const nSamples = Math.ceil(circMm * samplesPerMm);

  for (let ringIndex = 0; ringIndex < nRings; ringIndex += 1) {
    const ringTopMm = startOffset + ringIndex * (ringHeightMm + gapMm);
    const points: Array<[number, number]> = [];

    for (let sampleIndex = 0; sampleIndex <= nSamples; sampleIndex += 1) {
      const arcMm = (sampleIndex / nSamples) * circMm;
      const refDepth = evalTreoDepth(arcMm, circMm, nPeaks, ringIndex);
      const depthInRing = (refDepth / TREO_PROFILE_Y_MAX) * ringHeightMm;
      pushPoint(points, [arcMm, ringTopMm + depthInRing]);
    }

    segments.push(...pointsToSegments(points));
  }

  return segments;
}

// ── Device-aware router ─────────────────────────────────────────────────────
//
// Most devices still map cleanly onto the generic zigzag / M / sinusoidal
// families. TREO and Endurant II are routed separately so planning uses their
// calibrated template-derived profiles instead of generic approximations.
export function buildStrutSegmentsForDevice(
  device: Pick<DeviceGeometry, "id" | "stentType" | "proximalRingOffsetMm" | "benchCtDescriptor">,
  circ: number,
  ringHeight: number,
  gapHeight: number,
  nRings: number,
  nPeaks: number,
): StrutSegment[] {
  if (device.benchCtDescriptor) {
    return buildBenchCtStrutSegments(device.benchCtDescriptor, circ);
  }
  if (device.id === "treo") {
    return buildTreoStrutSegments(
      circ,
      nPeaks,
      ringHeight,
      gapHeight,
      nRings,
      device.proximalRingOffsetMm ?? 0,
    );
  }

  if (device.id === "endurant_ii") {
    return buildEndurantStrutSegments(
      circ,
      ringHeight,
      gapHeight,
      nRings,
      device.proximalRingOffsetMm ?? 0,
    );
  }

  const profile = getStrutLayoutProfile(device as DeviceGeometry);
  const startOffset = device.proximalRingOffsetMm ?? 0;
  const segments: StrutSegment[] = [];
  let yTopMm = startOffset;

  for (let ringIndex = 0; ringIndex < nRings; ringIndex += 1) {
    segments.push(...buildRingSegments(circ, yTopMm, {
      pattern: profile.pattern,
      waveWidthMm: circ / nPeaks,
      ringHeightMm: ringHeight,
      phaseFraction: getPhaseFraction(profile.phaseFractions, ringIndex),
      sinusoidSamples: profile.sinusoidSamplesPerWave,
      mShoulderRatio: profile.mShoulderRatio,
    }, nPeaks));
    yTopMm += ringHeight + gapHeight;
  }

  return segments;
}
