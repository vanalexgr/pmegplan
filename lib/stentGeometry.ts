import type { DeviceGeometry, StrutSegment } from "@/lib/types";

export function buildStrutSegments(
  circ: number,
  ringHeight: number,
  gapHeight: number,
  nRings: number,
  nPeaks: number,
): StrutSegment[] {
  const segments: StrutSegment[] = [];
  const waveWidth = circ / nPeaks;
  let y = 0;

  for (let ringIndex = 0; ringIndex < nRings; ringIndex += 1) {
    const y0 = y;
    const y1 = y0 + ringHeight;
    const phase = ringIndex % 2 === 0 ? 0 : waveWidth / 2;
    const nPts = (Math.floor(circ / waveWidth) + 4) * 2;
    const points: [number, number][] = [];

    for (let pointIndex = 0; pointIndex <= nPts; pointIndex += 1) {
      const x = pointIndex * (waveWidth / 2) + phase - waveWidth / 2;
      const pointY = pointIndex % 2 === 0 ? y0 : y1;
      points.push([x, pointY]);
    }

    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      const [ax, ay] = points[pointIndex];
      const [bx, by] = points[pointIndex + 1];
      segments.push([ax, ay, bx, by]);
    }

    y = y1 + gapHeight;
  }

  return segments;
}

export function getSealZoneHeightMm(device: DeviceGeometry) {
  return (
    device.nRings * device.ringHeight +
    Math.max(0, device.nRings - 1) * device.interRingGap
  );
}

