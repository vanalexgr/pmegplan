import type {
  BenchCtApex,
  BenchCtDeviceDescriptor,
} from "@/lib/geometry/benchCtDeviceLibrary";

export interface BenchCtSurfacePoint {
  thetaRad: number;
  zMm: number;
  radiusMm: number;
}

export interface BenchCtRingRenderModel {
  index: number;
  kind: "bare_fixation" | "covered";
  points: BenchCtSurfacePoint[];
}

export interface BenchCtBarbRenderModel {
  base: BenchCtSurfacePoint;
  tip: BenchCtSurfacePoint;
  hook: BenchCtSurfacePoint;
}

export interface BenchCtRenderModel {
  shape: "cylindrical" | "conical";
  fabricStartMm: number;
  fabricEndMm: number;
  fabricLengthMm: number;
  minimumZMm: number;
  rings: BenchCtRingRenderModel[];
  barbs: BenchCtBarbRenderModel[];
  diameterAt: (zMm: number) => number;
}

function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Smooth visual interpolation between measured apex positions. The original
 * apex positions remain the source of truth for conflict calculations; this
 * only avoids faceted/chord-like wire rendering in 3-D and review cards.
 */
export function sampleBenchCtRing(
  points: BenchCtSurfacePoint[],
  samplesPerSpan = 7,
): BenchCtSurfacePoint[] {
  if (points.length < 3) return points;
  const unwrapped: BenchCtSurfacePoint[] = [];
  for (const point of points) {
    let theta = point.thetaRad;
    const previous = unwrapped.at(-1);
    if (previous) {
      while (theta <= previous.thetaRad) theta += Math.PI * 2;
    }
    unwrapped.push({ ...point, thetaRad: theta });
  }
  const count = unwrapped.length;
  const at = (index: number) => {
    const cycles = Math.floor(index / count);
    const normalized = ((index % count) + count) % count;
    return {
      ...unwrapped[normalized],
      thetaRad: unwrapped[normalized].thetaRad + cycles * Math.PI * 2,
    };
  };
  const samples: BenchCtSurfacePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const p0 = at(index - 1);
    const p1 = at(index);
    const p2 = at(index + 1);
    const p3 = at(index + 2);
    for (let sample = 0; sample < samplesPerSpan; sample += 1) {
      const t = sample / samplesPerSpan;
      samples.push({
        thetaRad: catmullRom(p0.thetaRad, p1.thetaRad, p2.thetaRad, p3.thetaRad, t),
        zMm: catmullRom(p0.zMm, p1.zMm, p2.zMm, p3.zMm, t),
        radiusMm: catmullRom(p0.radiusMm, p1.radiusMm, p2.radiusMm, p3.radiusMm, t),
      });
    }
  }
  return samples;
}

function ringMinimumZ(
  ring: BenchCtDeviceDescriptor["rings"][number],
): number {
  return Math.min(
    ...ring.proximal_apices.map((apex) => apex.z_mm),
    ...ring.distal_apices.map((apex) => apex.z_mm),
  );
}

function ringMaximumZ(
  ring: BenchCtDeviceDescriptor["rings"][number],
): number {
  return Math.max(
    ...ring.proximal_apices.map((apex) => apex.z_mm),
    ...ring.distal_apices.map((apex) => apex.z_mm),
  );
}

/**
 * How the device's width runs along its length, one point per ring.
 *
 * `diameter_profile` is the extractor's per-slice segmentation and is not
 * usable directly: it drops out wherever the segmenter lost the device (scan3
 * reads 25.7 mm at z=119 on a 32 mm graft), and between rings it measures
 * fabric with no metal behind it. Interpolating through that gave the two
 * cylindrical devices a taper they do not have — scan1 swinging 128 to 134 mm
 * of circumference, scan3 92 to 106 — which is noise, not geometry.
 *
 * A ring's `diameter_mm` is fitted to that whole ring's apices, so there is one
 * robust number per ring. Straight lines between ring centres reproduce scan2's
 * real 42-to-32 taper and leave the other two flat, which is what they are.
 */
function ringDiameterProfile(
  descriptor: BenchCtDeviceDescriptor,
): Array<{ z: number; d: number }> {
  const cached = ringProfileCache.get(descriptor);
  if (cached) return cached;

  const profile = descriptor.rings
    .filter((ring) => ring.diameter_mm > 0)
    .map((ring) => ({
      z: (ringMinimumZ(ring) + ringMaximumZ(ring)) / 2,
      d: ring.diameter_mm,
    }))
    .filter((point) => Number.isFinite(point.z))
    .sort((a, b) => a.z - b.z);

  ringProfileCache.set(descriptor, profile);
  return profile;
}

const ringProfileCache = new WeakMap<
  BenchCtDeviceDescriptor,
  Array<{ z: number; d: number }>
>();

function interpolateDiameter(
  descriptor: BenchCtDeviceDescriptor,
  rawZMm: number,
): number {
  const fallback = descriptor.rings.reduce(
    (total, ring) => total + ring.diameter_mm,
    0,
  ) / Math.max(descriptor.rings.length, 1);
  const ordered = ringDiameterProfile(descriptor);
  if (ordered.length === 0) return fallback;
  if (ordered.length === 1) return ordered[0].d;
  if (rawZMm <= ordered[0].z) return ordered[0].d;
  if (rawZMm >= ordered[ordered.length - 1].z) return ordered[ordered.length - 1].d;

  for (let index = 1; index < ordered.length; index += 1) {
    const upper = ordered[index];
    const lower = ordered[index - 1];
    if (rawZMm <= upper.z) {
      const ratio = (rawZMm - lower.z) / Math.max(upper.z - lower.z, 0.001);
      return lower.d + (upper.d - lower.d) * ratio;
    }
  }

  return fallback;
}

function pointFromApex(
  apex: BenchCtApex,
  descriptor: BenchCtDeviceDescriptor,
  fabricStartMm: number,
): BenchCtSurfacePoint {
  return {
    thetaRad: (apex.theta_deg / 360) * Math.PI * 2,
    zMm: apex.z_mm - fabricStartMm,
    radiusMm: interpolateDiameter(descriptor, apex.z_mm) / 2,
  };
}

/**
 * A single, explicitly annotated representation of a bench-CT device for the
 * 3-D workspace and the punch card. The wire paths and diameters are measured;
 * fabric edge and barb paths are topology annotations where the CT cannot
 * reliably distinguish textile from thin metal.
 */
export function buildBenchCtRenderModel(
  descriptor: BenchCtDeviceDescriptor,
): BenchCtRenderModel {
  const fixationRingCount = descriptor.geometry?.proximal_fixation.ring_count ?? 0;
  const firstCoveredRing = descriptor.rings[fixationRingCount];
  const rawMinimum = Math.min(...descriptor.rings.map(ringMinimumZ));
  const rawMaximum = Math.max(...descriptor.rings.map(ringMaximumZ));
  const explicitFabricStart = descriptor.rendering?.fabric_proximal_edge_z_mm;
  const fabricStartMm = explicitFabricStart ?? (firstCoveredRing
    ? ringMinimumZ(firstCoveredRing)
    : rawMinimum);
  const fabricEndMm = descriptor.rendering?.fabric_distal_edge_z_mm ?? rawMaximum;
  const bareRingIndices = new Set(
    descriptor.rendering?.proximal_bare_ring_indices ??
      Array.from({ length: fixationRingCount }, (_, index) => index),
  );
  const barbLengthMm = descriptor.rendering?.barb_length_mm ?? 0;

  let rings = descriptor.rings.map((ring) => ({
    index: ring.index,
    kind: bareRingIndices.has(ring.index) ? "bare_fixation" as const : "covered" as const,
    points: [...ring.proximal_apices, ...ring.distal_apices]
      .sort((a, b) => a.theta_deg - b.theta_deg)
      .map((apex) => pointFromApex(apex, descriptor, fabricStartMm)),
  }));

  const axialFlip = descriptor.rendering?.anatomical_proximal_z === "high";
  const unflippedDiameterAt = (zMm: number) =>
    interpolateDiameter(descriptor, zMm + fabricStartMm);
  const fabricLengthMm = Math.max(fabricEndMm - fabricStartMm, 1);
  if (axialFlip) {
    rings = rings
      .map((ring) => ({
        ...ring,
        points: ring.points.map((point) => ({
          ...point,
          zMm: fabricLengthMm - point.zMm,
        })),
      }))
      .sort((a, b) => Math.min(...a.points.map((point) => point.zMm)) - Math.min(...b.points.map((point) => point.zMm)))
      .map((ring, index) => ({ ...ring, index }));
  }

  const barbs = barbLengthMm > 0
    ? descriptor.rings
      .filter((ring) => bareRingIndices.has(ring.index))
      .flatMap((ring) => ring.proximal_apices)
      .map((apex, index) => {
        const base = pointFromApex(apex, descriptor, fabricStartMm);
        const side = index % 2 === 0 ? 1 : -1;
        const tip = {
          thetaRad: base.thetaRad + side * 0.045,
          zMm: base.zMm - barbLengthMm,
          radiusMm: base.radiusMm + 1.2,
        };
        return {
          base,
          tip,
          hook: {
            thetaRad: tip.thetaRad - side * 0.028,
            zMm: tip.zMm + barbLengthMm * 0.34,
            radiusMm: tip.radiusMm,
          },
        };
      })
    : [];

  const minimumZMm = Math.min(
    ...rings.flatMap((ring) => ring.points.map((point) => point.zMm)),
    ...barbs.map((barb) => barb.tip.zMm),
    0,
  );

  return {
    shape: descriptor.geometry?.shape ?? "cylindrical",
    fabricStartMm,
    fabricEndMm,
    fabricLengthMm,
    minimumZMm,
    rings,
    barbs,
    diameterAt: (zMm) => unflippedDiameterAt(axialFlip ? fabricLengthMm - zMm : zMm),
  };
}
