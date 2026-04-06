/**
 * PMEGplan.io — TREO sinusoidal ring profile
 *
 * Measured from TREO back-table template (print-at-100%).
 * All 4 rings share the same wave shape.
 * Rings 1 & 3: in-phase         (phaseOffset = 0.0)
 * Rings 2 & 4: half-period lag  (phaseOffset = 0.5)
 *
 * Size variants:
 *   Ø20–28 mm → 5 peaks  → period = circ / 5
 *   Ø30–36 mm → 6 peaks  → period = circ / 6
 */

export interface TreoKeypoint {
  /** Position as fraction of one wave period [0, 1]. */
  posFrac: number;
  /**
   * Strut depth in mm on the 0–11 mm reference axis.
   * Scale to actual ring height before use:
   *   actualMm = (depthMm / TREO_PROFILE_Y_MAX) * ringHeightMm
   */
  depthMm: number;
}

/** Reference Y axis maximum — matches the wave editor. */
export const TREO_PROFILE_Y_MAX = 11.0;

/**
 * Phase offsets for each ring row (index 0–3).
 * 0 = in-phase, 0.5 = half-period lag.
 */
export const TREO_PHASE_FRACTIONS: readonly number[] = [0, 0, 0, 0] as const;

export const TREO_RING_PROFILE: readonly TreoKeypoint[] = [
  { posFrac: 0.0, depthMm: 0.5 },
  { posFrac: 0.5, depthMm: 10.5 },
  { posFrac: 1.0, depthMm: 0.5 },
] as const;

function cosLerp(a: number, b: number, t: number): number {
  return a + (b - a) * (1 - Math.cos(t * Math.PI)) / 2;
}

export function treoPeriodMm(circMm: number, nPeaks: number): number {
  return circMm / nPeaks;
}

export function evalTreoDepth(
  arcMm: number,
  circMm: number,
  nPeaks: number,
  ringIndex: number,
): number {
  const period = treoPeriodMm(circMm, nPeaks);
  const phaseOffset = TREO_PHASE_FRACTIONS[ringIndex] ?? 0;
  const local = ((arcMm / period) + phaseOffset + 1000) % 1;

  for (let index = 0; index < TREO_RING_PROFILE.length - 1; index += 1) {
    const current = TREO_RING_PROFILE[index];
    const next = TREO_RING_PROFILE[index + 1];

    if (local <= next.posFrac + 1e-9) {
      const width = next.posFrac - current.posFrac;
      const t =
        width < 1e-9
          ? 0
          : Math.max(0, Math.min(1, (local - current.posFrac) / width));
      return cosLerp(current.depthMm, next.depthMm, t);
    }
  }

  return TREO_RING_PROFILE[TREO_RING_PROFILE.length - 1].depthMm;
}
