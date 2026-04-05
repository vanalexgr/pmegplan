import type { DeviceGeometry, StrutSegment } from "@/lib/types";

type StrutPattern = "zigzag" | "mshaped" | "sinusoidal";

interface StrutLayoutProfile {
  pattern: StrutPattern;
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

function pushPoint(
  points: Array<[number, number]>,
  point: [number, number],
) {
  const previous = points[points.length - 1];
  if (
    previous &&
    Math.abs(previous[0] - point[0]) < 1e-6 &&
    Math.abs(previous[1] - point[1]) < 1e-6
  ) {
    return;
  }

  points.push(point);
}

function pointsToSegments(points: Array<[number, number]>) {
  const segments: StrutSegment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const [ax, ay] = points[index];
    const [bx, by] = points[index + 1];
    segments.push([ax, ay, bx, by]);
  }

  return segments;
}

function buildZigZagRingSegments(input: {
  circumferenceMm: number;
  yTopMm: number;
  ringHeightMm: number;
  nPeaks: number;
  phaseFraction: number;
}) {
  const { circumferenceMm, yTopMm, ringHeightMm, nPeaks, phaseFraction } = input;
  const waveWidth = circumferenceMm / nPeaks;
  const points: Array<[number, number]> = [];
  const startX = -waveWidth + phaseFraction * waveWidth;
  const step = waveWidth / 2;
  const steps = Math.ceil((circumferenceMm + waveWidth * 2) / step);

  for (let pointIndex = 0; pointIndex <= steps; pointIndex += 1) {
    const x = startX + pointIndex * step;
    const y = pointIndex % 2 === 0 ? yTopMm : yTopMm + ringHeightMm;
    pushPoint(points, [x, y]);
  }

  return pointsToSegments(points);
}

function buildMShapedRingSegments(input: {
  circumferenceMm: number;
  yTopMm: number;
  ringHeightMm: number;
  nPeaks: number;
  phaseFraction: number;
  shoulderRatio: number;
}) {
  const {
    circumferenceMm,
    yTopMm,
    ringHeightMm,
    nPeaks,
    phaseFraction,
    shoulderRatio,
  } = input;
  const waveWidth = circumferenceMm / nPeaks;
  const phaseShift = phaseFraction * waveWidth;
  const shoulderY = yTopMm + ringHeightMm * shoulderRatio;
  const yBottomMm = yTopMm + ringHeightMm;
  const points: Array<[number, number]> = [];

  for (let waveIndex = -2; waveIndex <= nPeaks + 1; waveIndex += 1) {
    const baseX = waveIndex * waveWidth + phaseShift;
    pushPoint(points, [baseX, yTopMm]);
    pushPoint(points, [baseX + waveWidth * 0.25, yBottomMm]);
    pushPoint(points, [baseX + waveWidth * 0.5, shoulderY]);
    pushPoint(points, [baseX + waveWidth * 0.75, yBottomMm]);
    pushPoint(points, [baseX + waveWidth, yTopMm]);
  }

  return pointsToSegments(points);
}

function buildSinusoidalRingSegments(input: {
  circumferenceMm: number;
  yTopMm: number;
  ringHeightMm: number;
  nPeaks: number;
  phaseFraction: number;
  samplesPerWave: number;
}) {
  const {
    circumferenceMm,
    yTopMm,
    ringHeightMm,
    nPeaks,
    phaseFraction,
    samplesPerWave,
  } = input;
  const waveWidth = circumferenceMm / nPeaks;
  const phaseShift = phaseFraction * waveWidth;
  const amplitude = ringHeightMm / 2;
  const yMid = yTopMm + amplitude;
  const points: Array<[number, number]> = [];
  const totalSamples = Math.ceil((nPeaks + 4) * samplesPerWave);
  const startWave = -2;

  for (let sampleIndex = 0; sampleIndex <= totalSamples; sampleIndex += 1) {
    const wavePosition = startWave + sampleIndex / samplesPerWave;
    const x = wavePosition * waveWidth + phaseShift;
    const y = yMid - amplitude * Math.cos(wavePosition * 2 * Math.PI);
    pushPoint(points, [x, y]);
  }

  return pointsToSegments(points);
}

function getStrutLayoutProfile(device: DeviceGeometry): StrutLayoutProfile {
  switch (device.id) {
    case "endurant_ii":
      return {
        // Endurant's covered rings are smooth sinusoidal wireforms when
        // unrolled. Crucially, the printed Medtronic back-table template
        // (Endurant_32.png, 3.8 px/mm) shows all 5 rings are IN PHASE —
        // every row peaks at the same circumferential positions (12h and 6h).
        // There is NO stagger between rows.
        pattern: "sinusoidal",
        phaseFractions: [0, 0, 0, 0, 0],
        sinusoidSamplesPerWave: 16,
      };
    case "treo":
      return {
        // TREO's covered body uses sinusoidal wireform springs with staggered
        // rows, creating the broad square-ish working windows described in PMEG
        // literature.
        pattern: "sinusoidal",
        phaseFractions: [0, 0.5, 0, 0.5],
        sinusoidSamplesPerWave: 14,
      };
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
  _graftDiameterMm: number,
  nPeaks: number,
): StrutSegment[] {
  const { ringHeight, interRingGap, nRings } = device;
  const profile = getStrutLayoutProfile(device);
  const segments: StrutSegment[] = [];
  let y = 0;

  for (let ringIndex = 0; ringIndex < nRings; ringIndex += 1) {
    const phaseFraction = getPhaseFraction(profile.phaseFractions, ringIndex);
    const ringSegments =
      profile.pattern === "mshaped"
        ? buildMShapedRingSegments({
            circumferenceMm,
            yTopMm: y,
            ringHeightMm: ringHeight,
            nPeaks,
            phaseFraction,
            shoulderRatio: profile.mShoulderRatio ?? 0.42,
          })
        : profile.pattern === "sinusoidal"
          ? buildSinusoidalRingSegments({
              circumferenceMm,
              yTopMm: y,
              ringHeightMm: ringHeight,
              nPeaks,
              phaseFraction,
              samplesPerWave: profile.sinusoidSamplesPerWave ?? 12,
            })
          : buildZigZagRingSegments({
              circumferenceMm,
              yTopMm: y,
              ringHeightMm: ringHeight,
              nPeaks,
              phaseFraction,
            });

    for (const segment of ringSegments) {
      segments.push(segment);
    }

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
// Endurant II and Gore Excluder use smooth sinusoidal ring frames rather than
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

// ── Device-aware router ─────────────────────────────────────────────────────
//
// The current device database still uses "M-stent" for Endurant, but for
// planning and rendering we want the smooth sinusoidal family of curves rather
// than a sharp zigzag approximation.
export function buildStrutSegmentsForDevice(
  device: Pick<DeviceGeometry, "id" | "stentType" | "proximalRingOffsetMm">,
  circ: number,
  ringHeight: number,
  gapHeight: number,
  nRings: number,
  nPeaks: number,
): StrutSegment[] {
  const profile = getStrutLayoutProfile(device as DeviceGeometry);
  const startOffset = device.proximalRingOffsetMm ?? 0;
  const segments: StrutSegment[] = [];
  let yTopMm = startOffset;

  for (let ringIndex = 0; ringIndex < nRings; ringIndex += 1) {
    const phaseFraction = getPhaseFraction(profile.phaseFractions, ringIndex);
    const ringSegments =
      profile.pattern === "mshaped"
        ? buildMShapedRingSegments({
            circumferenceMm: circ,
            yTopMm,
            ringHeightMm: ringHeight,
            nPeaks,
            phaseFraction,
            shoulderRatio: profile.mShoulderRatio ?? 0.42,
          })
        : profile.pattern === "sinusoidal"
          ? buildSinusoidalRingSegments({
              circumferenceMm: circ,
              yTopMm,
              ringHeightMm: ringHeight,
              nPeaks,
              phaseFraction,
              samplesPerWave: profile.sinusoidSamplesPerWave ?? 12,
            })
          : buildZigZagRingSegments({
              circumferenceMm: circ,
              yTopMm,
              ringHeightMm: ringHeight,
              nPeaks,
              phaseFraction,
            });

    segments.push(...ringSegments);
    yTopMm += ringHeight + gapHeight;
  }

  return segments;
}
