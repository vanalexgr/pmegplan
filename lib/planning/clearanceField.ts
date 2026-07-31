import { wrapMm } from "@/lib/planning/geometry";
import type { StrutSegment } from "@/lib/types";

const DEFAULT_CELL_MM = 0.25;
const DEPTH_MARGIN_MM = 10;
/**
 * Stand-in for "no wire here". Must be finite: the distance transform subtracts
 * pairs of these values, and Infinity would yield NaN and stall the sweep.
 */
const UNSET = 1e20;

export interface ClearanceFieldOptions {
  /** Grid resolution in mm. Smaller is more accurate and more memory. */
  cellMm?: number;
}

export interface ClearanceField {
  circumferenceMm: number;
  cellMm: number;
  /** Lowest depth covered by the grid, in mm. */
  depthMinMm: number;
  /** Highest depth covered by the grid, in mm. */
  depthMaxMm: number;
  /**
   * Lower bound on the distance from a point on the unrolled graft to the
   * nearest strut centreline, in mm. Wraps circumferentially. Depth queries
   * outside the grid are clamped, so callers must reject out-of-fabric depths
   * themselves.
   */
  distanceAt(arcMm: number, depthMm: number): number;
}

/**
 * Exact 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher),
 * run in place over `values` with stride `stride`.
 */
function transform1d(
  values: Float64Array,
  start: number,
  count: number,
  stride: number,
  scratch: {
    parabola: Int32Array;
    boundary: Float64Array;
    result: Float64Array;
  },
): void {
  const { parabola, boundary, result } = scratch;
  let k = 0;
  parabola[0] = 0;
  boundary[0] = Number.NEGATIVE_INFINITY;
  boundary[1] = Number.POSITIVE_INFINITY;

  for (let q = 1; q < count; q += 1) {
    const fq = values[start + q * stride];
    let s = 0;
    while (k >= 0) {
      const p = parabola[k];
      s =
        (fq + q * q - (values[start + p * stride] + p * p)) /
        (2 * q - 2 * p);
      if (s > boundary[k]) break;
      k -= 1;
    }
    if (k < 0) {
      k = 0;
      s = Number.NEGATIVE_INFINITY;
    }
    k += 1;
    parabola[k] = q;
    boundary[k] = s;
    boundary[k + 1] = Number.POSITIVE_INFINITY;
  }

  k = 0;
  for (let q = 0; q < count; q += 1) {
    while (boundary[k + 1] < q) k += 1;
    const p = parabola[k];
    result[q] = (q - p) * (q - p) + values[start + p * stride];
  }

  for (let q = 0; q < count; q += 1) {
    values[start + q * stride] = result[q];
  }
}

function makeScratch(size: number) {
  return {
    parabola: new Int32Array(size),
    boundary: new Float64Array(size + 1),
    result: new Float64Array(size),
  };
}

/**
 * Precompute distance-to-nearest-wire over the unrolled graft so that a
 * clearance query becomes a lookup rather than a scan over every strut segment.
 *
 * The wire is rasterised into a grid that is tiled three times circumferentially
 * before the transform, so the middle tile sees neighbours across the seam and
 * the field wraps correctly.
 *
 * The returned distance is a lower bound: half a cell diagonal is subtracted to
 * absorb rasterisation error, so the field never reports more clearance than
 * exists.
 */
export function buildClearanceField(
  segments: StrutSegment[],
  circumferenceMm: number,
  options: ClearanceFieldOptions = {},
): ClearanceField {
  if (!(circumferenceMm > 0)) {
    throw new Error("Circumference must be greater than 0.");
  }
  if (segments.length === 0) {
    throw new Error("Clearance field needs at least one strut segment.");
  }

  const cellMm = options.cellMm ?? DEFAULT_CELL_MM;
  if (!(cellMm > 0)) {
    throw new Error("Cell size must be greater than 0.");
  }

  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  for (const [, ay, , by] of segments) {
    if (ay < minDepth) minDepth = ay;
    if (by < minDepth) minDepth = by;
    if (ay > maxDepth) maxDepth = ay;
    if (by > maxDepth) maxDepth = by;
  }

  const depthMinMm = minDepth - DEPTH_MARGIN_MM;
  const depthMaxMm = maxDepth + DEPTH_MARGIN_MM;
  const cols = Math.max(1, Math.ceil(circumferenceMm / cellMm));
  const rows = Math.max(1, Math.ceil((depthMaxMm - depthMinMm) / cellMm));
  const tiledCols = cols * 3;

  const grid = new Float64Array(rows * tiledCols).fill(UNSET);

  for (const [ax, ay, bx, by] of segments) {
    const spanMm = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil((spanMm * 2) / cellMm));

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const arcMm = wrapMm(ax + (bx - ax) * t, circumferenceMm);
      const depth = ay + (by - ay) * t;
      const col = Math.min(cols - 1, Math.floor(arcMm / cellMm));
      const row = Math.floor((depth - depthMinMm) / cellMm);
      if (row < 0 || row >= rows) continue;
      grid[row * tiledCols + cols + col] = 0;
    }
  }

  for (let row = 0; row < rows; row += 1) {
    const base = row * tiledCols;
    for (let col = 0; col < cols; col += 1) {
      const value = grid[base + cols + col];
      grid[base + col] = value;
      grid[base + cols * 2 + col] = value;
    }
  }

  const rowScratch = makeScratch(tiledCols);
  for (let row = 0; row < rows; row += 1) {
    transform1d(grid, row * tiledCols, tiledCols, 1, rowScratch);
  }

  const columnScratch = makeScratch(rows);
  for (let col = 0; col < tiledCols; col += 1) {
    transform1d(grid, col, rows, tiledCols, columnScratch);
  }

  const rasterBoundMm = (cellMm * Math.SQRT2) / 2;
  const field = new Float32Array(rows * cols);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const squared = grid[row * tiledCols + cols + col];
      field[row * cols + col] = Math.sqrt(squared) * cellMm - rasterBoundMm;
    }
  }

  const sample = (row: number, col: number) => {
    const clampedRow = row < 0 ? 0 : row >= rows ? rows - 1 : row;
    const wrappedCol = ((col % cols) + cols) % cols;
    return field[clampedRow * cols + wrappedCol];
  };

  return {
    circumferenceMm,
    cellMm,
    depthMinMm,
    depthMaxMm,
    distanceAt(arcMm: number, depthMm: number): number {
      const x = wrapMm(arcMm, circumferenceMm) / cellMm - 0.5;
      const y = (depthMm - depthMinMm) / cellMm - 0.5;
      const col = Math.floor(x);
      const row = Math.floor(y);
      const tx = x - col;
      const ty = y - row;

      const topLeft = sample(row, col);
      const topRight = sample(row, col + 1);
      const bottomLeft = sample(row + 1, col);
      const bottomRight = sample(row + 1, col + 1);

      return (
        topLeft * (1 - tx) * (1 - ty) +
        topRight * tx * (1 - ty) +
        bottomLeft * (1 - tx) * ty +
        bottomRight * tx * ty
      );
    },
  };
}
