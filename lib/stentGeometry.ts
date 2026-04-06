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
import type { WaveformPattern } from "@/lib/geometry/waveform";
import type { DeviceGeometry, StrutSegment } from "@/lib/types";

interface StrutLayoutProfile {
  pattern: WaveformPattern;
  phaseFractions: number[];
  mShoulderRatio?: number;
  sinusoidSamplesPerWave?: number;
}

function getPhaseFraction(
  phaseFractions: number[],
  ringIndex: number,
) {
  return phaseFractions[ringIndex] ?? phaseFractions[phaseFractions.length - 1] ?? 0;
}

function getStrutLayoutProfile(device: DeviceGeometry): StrutLayoutProfile {
  switch (device.id) {
    case "gore_excluder":
      return {
        pattern: "sinusoidal",
        phaseFractions: [0, 0.33, 0.66, 0.33, 0],
        sinusoidSamplesPerWave: 16,
      };
    case "zenith_alpha":
    default:
      return {
        pattern: "zigzag",
        phaseFractions: [0, 0.5, 0, 0.5, 0],
      };
  }
}

export function buildStrutSegments(
  device: DeviceGeometry,
  circumferenceMm: number,
  graftDiameterMm: number,
  nPeaks: number,
): StrutSegment[] {
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
  return (
    (device.proximalRingOffsetMm ?? 0) +
    device.nRings * device.ringHeight +
    Math.max(0, device.nRings - 1) * device.interRingGap
  );
}

// ── Sinusoidal ring segments ─────────────────────────────────────────────────
//
// Devices such as Gore Excluder use smooth sinusoidal ring frames rather than
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
  device: Pick<DeviceGeometry, "id" | "stentType" | "proximalRingOffsetMm">,
  circ: number,
  ringHeight: number,
  gapHeight: number,
  nRings: number,
  nPeaks: number,
): StrutSegment[] {
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
