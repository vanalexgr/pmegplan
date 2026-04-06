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
