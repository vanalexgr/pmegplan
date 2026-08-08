/**
 * Coordinate transforms for PMEGplan geometry.
 *
 * All clock ↔ arc-mm ↔ polar conversions live here — single source of truth.
 * No rendering, device, or analysis logic. Pure functions on numbers.
 *
 * Convention (Cook CMD, caudal-to-cranial view):
 *   12:00 = anterior = arc 0 mm
 *   3:00  = patient left
 *   6:00  = posterior = arc circ/2 mm
 *   Arc increases clockwise.
 */

// ── Branded number types (documentation only — not enforced at runtime) ───────

/** Arc position in mm along circumference from 12:00, increasing clockwise. */
export type ArcMm = number;

/** Signed arc offset from 12:00: positive = clockwise, negative = counter-clockwise. */
export type ArcFromNoon = number;

/** Clock position string in "h:mm" format (Cook CMD convention). */
export type ClockString = string;

// ── Primitive transforms ──────────────────────────────────────────────────────

/** Graft circumference in mm from nominal outer diameter. */
export function diamToCirc(diamMm: number): number {
  return Math.PI * diamMm;
}

/** Wrap any arc value into [0, circ). */
export function wrapMm(value: number, circ: number): ArcMm {
  const result = value % circ;
  return result < 0 ? result + circ : result;
}

/**
 * Clock string "h:mm" → arc-mm from 12:00 (clockwise).
 * Supports both "9:30" and "09:30" formats.
 */
export function clockToArcMm(clock: ClockString, circ: number): ArcMm {
  const [h, m] = clock.split(":").map(Number);
  return (((h % 12) * 60 + (m || 0)) / 720) * circ;
}

/** Arc-mm → clock string "h:mm" (e.g. 9:30). */
export function arcMmToClockStr(arcMm: ArcMm, circ: number): ClockString {
  const total = Math.round((arcMm / circ) * 720);
  const h = Math.floor(total / 60) % 12;
  const m = total % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/**
 * Arc-mm → signed offset from 12:00.
 * Positive = clockwise (right side of front-elevation sketch).
 * Negative = counter-clockwise (left side).
 * Range: (-circ/2, +circ/2].
 */
export function arcMmToFromNoon(arcMm: ArcMm, circ: number): ArcFromNoon {
  const wrapped = wrapMm(arcMm, circ);
  const half = circ / 2;
  return wrapped <= half ? wrapped : wrapped - circ;
}

// ── Composite helpers ─────────────────────────────────────────────────────────

/**
 * Apply a rotation delta to an arc position, then return the signed
 * from-noon offset used for sketch x-coordinates.
 */
export function toSketchX(
  arcMm: ArcMm,
  deltaMm: number,
  circ: number,
): ArcFromNoon {
  return arcMmToFromNoon(wrapMm(arcMm + deltaMm, circ), circ);
}

/**
 * Signed arc separation (mm) from graft seam to a fenestration clock position.
 * Positive = fenestration is clockwise of seam; negative = counter-clockwise.
 *
 * @param fenClock      Fenestration clock string after rotation adjustment.
 * @param seamDeg       Seam position in degrees (0 = 12:00 anterior).
 * @param rotationDeltaMm  Applied rotation offset in mm.
 */
export function arcSepFromSeam(
  fenClock: ClockString,
  seamDeg: number,
  rotationDeltaMm: number,
  circ: number,
): number {
  const fenArc = clockToArcMm(fenClock, circ);
  const seamArc = (seamDeg / 360) * circ + rotationDeltaMm;
  let sep = fenArc - seamArc;
  if (sep > circ / 2) sep -= circ;
  if (sep < -circ / 2) sep += circ;
  return sep;
}

/**
 * How far off the facing direction an opening may sit and still read as being
 * on the near surface rather than on the silhouette, in degrees.
 */
const NEAR_FACE_DEG = 75;

/**
 * The angle to face so that the most openings sit on the near surface.
 *
 * A cylinder shows half its circumference at once, so any fixed starting angle
 * leaves whichever openings happen to face away invisible: a four-vessel plan
 * can open showing one hole of four, which reads as the view being broken.
 *
 * The circular mean is not the answer. A single posterior opening pulls it back
 * toward the anterior ones, so on a coeliac/SMA/renal chain it returns roughly
 * 12:00 whatever else is on the graft — the same problem it was meant to solve.
 *
 * This scans candidate facings instead and prefers, in order: the most openings
 * on the near face; then the smallest *worst* offset among them; then the
 * tightest total. The worst offset has to come before the total, or a view with
 * two holes dead centre and a third on the silhouette beats one with all three
 * comfortably in view — which is the opposite of what is wanted.
 *
 * Returns radians clockwise from 12:00; an empty plan faces 12:00, which is
 * where a graft with nothing on it should sit.
 */
export function bestFacingAngle(turnFractions: readonly number[]): number {
  if (turnFractions.length === 0) return 0;

  const angles = turnFractions.map(
    (fraction) => (((fraction % 1) + 1) % 1) * 360,
  );

  let bestFacing = 0;
  let bestCount = -1;
  let bestWorst = Number.POSITIVE_INFINITY;
  let bestSpread = Number.POSITIVE_INFINITY;

  for (let facing = 0; facing < 360; facing += 1) {
    let count = 0;
    let worst = 0;
    let spread = 0;
    for (const angle of angles) {
      const delta = Math.abs(((angle - facing + 540) % 360) - 180);
      if (delta <= NEAR_FACE_DEG) {
        count += 1;
        worst = Math.max(worst, delta);
        spread += delta;
      }
    }
    const better =
      count > bestCount ||
      (count === bestCount &&
        (worst < bestWorst || (worst === bestWorst && spread < bestSpread)));
    if (better) {
      bestFacing = facing;
      bestCount = count;
      bestWorst = worst;
      bestSpread = spread;
    }
  }

  return (bestFacing * Math.PI) / 180;
}
