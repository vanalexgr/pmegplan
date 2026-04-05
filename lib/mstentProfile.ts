/**
 * PMEGplan.io — Endurant II M-stent wave profile
 *
 * Keypoints digitised from Medtronic print-at-100% back-table template
 * (Endurant_32.png, 3.8 px/mm calibration, April 2026).
 *
 * Two ring profiles:
 *   ENDURANT_RING1_PROFILE   — Ring 1 (proximal), symmetric M
 *   ENDURANT_RINGS25_PROFILE — Rings 2–5, asymmetric calligraphic M
 */

export interface MStentKeypoint {
  /** Minutes from M-unit start (6:00 = 0). Last keypoint sets wave period. */
  minutesFromStart: number;
  /** Strut depth in mm within the ring zone. */
  depthMm: number;
}

/**
 * Ring 1 (index 0, proximal) — symmetric M-shape.
 * Period: 120 min → circ/6 exactly.
 */
export const ENDURANT_RING1_PROFILE: readonly MStentKeypoint[] = [
  { minutesFromStart: 0, depthMm: 4.2 },
  { minutesFromStart: 20, depthMm: 1.0 },
  { minutesFromStart: 60, depthMm: 9.0 },
  { minutesFromStart: 100, depthMm: 1.0 },
  { minutesFromStart: 120, depthMm: 4.2 },
] as const;

/**
 * Rings 2–5 (indices 1–4) — asymmetric calligraphic M-shape.
 * Period: 122 min → (122/120) × circ/6.
 */
export const ENDURANT_RINGS25_PROFILE: readonly MStentKeypoint[] = [
  { minutesFromStart: 0, depthMm: 0.1 },
  { minutesFromStart: 35, depthMm: 6.9 },
  { minutesFromStart: 65, depthMm: 3.0 },
  { minutesFromStart: 90, depthMm: 9.0 },
  { minutesFromStart: 122, depthMm: 0.1 },
] as const;

function cosLerp(a: number, b: number, t: number): number {
  return a + (b - a) * (1 - Math.cos(t * Math.PI)) / 2;
}

export function mstentPeriodMm(
  profile: readonly MStentKeypoint[],
  circMm: number,
): number {
  const lastMin = profile[profile.length - 1].minutesFromStart;
  return (lastMin / 120) * (circMm / 6);
}

export function evalMStentDepth(
  arcMm: number,
  profile: readonly MStentKeypoint[],
  circMm: number,
): number {
  const periodMm = mstentPeriodMm(profile, circMm);
  const lastMin = profile[profile.length - 1].minutesFromStart;
  const local = ((arcMm % periodMm) + periodMm) % periodMm / periodMm;

  for (let index = 0; index < profile.length - 1; index += 1) {
    const x0 = profile[index].minutesFromStart / lastMin;
    const x1 = profile[index + 1].minutesFromStart / lastMin;

    if (local <= x1 + 1e-9) {
      const width = x1 - x0;
      const t =
        width < 1e-9
          ? 0
          : Math.max(0, Math.min(1, (local - x0) / width));
      return cosLerp(profile[index].depthMm, profile[index + 1].depthMm, t);
    }
  }

  return profile[profile.length - 1].depthMm;
}

export function getEndurantProfile(
  ringIndex: number,
): readonly MStentKeypoint[] {
  return ringIndex === 0 ? ENDURANT_RING1_PROFILE : ENDURANT_RINGS25_PROFILE;
}
