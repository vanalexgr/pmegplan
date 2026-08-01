import type { ClearanceField } from "@/lib/planning/clearanceField";

/**
 * Half-dimensions of an opening on the unrolled graft, in mm.
 * Equal semi-axes describe a circular hole.
 */
export interface OpeningHalfSize {
  /** Half the circumferential width. */
  semiArcMm: number;
  /** Half the axial height. */
  semiDepthMm: number;
}

/**
 * Clearance from an elliptical opening's rim to the nearest wire, in mm.
 *
 * A circle can be tested with one field lookup, because its rim is the same
 * distance away whichever direction the wire lies in. An ellipse cannot: a
 * 6 x 8 mm fenestration reaches 4 mm axially but only 3 mm circumferentially,
 * and on these devices the fabric window is 18 mm wide circumferentially
 * against 5-11 mm axially. Treating it as its circumscribed circle would
 * reserve 4 mm in the direction that has room to spare and reject placements
 * that fit.
 *
 * So the direction matters. The field stores distance to the nearest wire, and
 * the gradient of a distance field points directly away from what is nearest,
 * which recovers that direction for two extra lookups. The opening's reach in
 * that direction is then the ellipse's own radius there, and the clearance is
 * the difference.
 *
 * The estimate is clamped to the bounds that hold whatever the direction turns
 * out to be — never better than the circumscribed circle would give, never
 * worse than the inscribed one — so a noisy gradient near the field's medial
 * axis degrades the answer rather than corrupting it.
 */
export function ellipseClearanceMm(
  field: ClearanceField,
  arcMm: number,
  depthMm: number,
  size: OpeningHalfSize,
  wireRadiusMm: number,
): number {
  const a = size.semiArcMm + wireRadiusMm;
  const b = size.semiDepthMm + wireRadiusMm;
  const distanceMm = field.distanceAt(arcMm, depthMm);

  const smallest = Math.min(a, b);
  const largest = Math.max(a, b);
  // True clearance always lies between these, so a circle needs no gradient.
  const lower = distanceMm - largest;
  const upper = distanceMm - smallest;
  if (largest - smallest < 1e-9) return lower;

  const step = field.cellMm;
  const gradientArc =
    field.distanceAt(arcMm + step, depthMm) -
    field.distanceAt(arcMm - step, depthMm);
  const gradientDepth =
    field.distanceAt(arcMm, depthMm + step) -
    field.distanceAt(arcMm, depthMm - step);
  const magnitude = Math.hypot(gradientArc, gradientDepth);
  if (magnitude < 1e-9) return lower;

  // Nearest wire lies opposite the gradient; only its direction is used.
  const cos = -gradientArc / magnitude;
  const sin = -gradientDepth / magnitude;
  const reachMm = 1 / Math.hypot(cos / a, sin / b);

  return Math.min(upper, Math.max(lower, distanceMm - reachMm));
}

/** Ellipse radius in a given direction, in mm. Handy for drawing and rulers. */
export function ellipseReachMm(
  size: OpeningHalfSize,
  directionRad: number,
): number {
  return (
    1 /
    Math.hypot(
      Math.cos(directionRad) / size.semiArcMm,
      Math.sin(directionRad) / size.semiDepthMm,
    )
  );
}
