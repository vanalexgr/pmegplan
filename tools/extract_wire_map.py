#!/usr/bin/env python3
"""Add a measured wire map to each bench-CT device descriptor.

Why
---
The descriptors record only apices — 10 to 28 points per ring — while the CT
holds 6,000 to 31,000 metal voxels per ring. The app reconstructed the wire
between apices by interpolation, so every clearance figure rested on a guessed
path. A plan cannot claim to be CT-derived on that basis.

This records, for each angular bin, the axial intervals where the scan actually
found metal. That is what conflict detection needs: the fabric window at a given
angle is the gap between one interval and the next. It carries the bare fixation
ring and its barbs for free, and it does not care whether a ring is a clean
zigzag, so devices whose struts the apex model cannot describe are represented
correctly rather than idealised.

Frame
-----
The wire map is written in the descriptor's own z and theta datums, so existing
annotations (fabric edges, bare-ring indices) keep their meaning. Theta comes
from the recorded `datum.theta_zero_deg_in_scan_frame` — re-deriving it from the
radiopaque marker is unstable and lands 19 degrees away on scan1. The axial
datum cannot be recovered the same way, because the fabric-percentile that set
it is sensitive to the segmentation, so it is fitted: the offset and axis sign
that put the stored apices onto the measured envelope. That fit doubles as the
validation, and its residual is written into the descriptor.

Usage
-----
    python tools/extract_wire_map.py --dicom-root <dir> [--check]

`--check` validates and reports without writing.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass

import numpy as np
import SimpleITK as sitk
from scipy import ndimage

HU_METAL = 1600.0
ISO_MM = 0.3
THETA_BINS = 720          # 0.5 degree
# Two isotropic voxels: closer than this and the gap is blooming, not fabric.
RUN_GAP_MM = 2 * ISO_MM

SCANS = [
    ("scan1", "4405F50", "Endograft-1_scan1.json"),
    ("scan2", "62CC686D", "Endograft-2_scan2.json"),
    ("scan3", "stent", "Endograft-3_scan3.json"),
]


@dataclass
class Frame:
    """Metal in cylindrical coordinates, before the descriptor's datums."""

    z_mm: np.ndarray
    r_mm: np.ndarray
    theta_deg: np.ndarray


def keep_significant(mask: np.ndarray, min_frac: float = 0.02) -> np.ndarray:
    """Drop specks. Rings are separate components, so never keep only the largest."""
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = [i + 1 for i in range(n) if sizes[i] >= min_frac * sizes.sum()]
    return np.isin(lab, keep)


def principal_axis(points: np.ndarray):
    centre = points.mean(axis=0)
    _, _, vh = np.linalg.svd(points - centre, full_matrices=False)
    axis = vh[0] / np.linalg.norm(vh[0])
    helper = np.array([0.0, 0.0, 1.0])
    if abs(float(axis @ helper)) > 0.9:
        helper = np.array([1.0, 0.0, 0.0])
    u = np.cross(axis, helper)
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    return centre, axis, u, v


def read_frame(dicom_dir: str, theta_ref_deg: float) -> Frame:
    reader = sitk.ImageSeriesReader()
    ids = reader.GetGDCMSeriesIDs(dicom_dir)
    if not ids:
        raise SystemExit(f"No DICOM series under {dicom_dir}")
    files = reader.GetGDCMSeriesFileNames(dicom_dir, ids[0])
    reader.SetFileNames(files)
    img = reader.Execute()

    size = img.GetSize()
    spacing = img.GetSpacing()
    new_size = [
        int(round(size[i] * spacing[i] / ISO_MM)) for i in range(3)
    ]
    resample = sitk.ResampleImageFilter()
    resample.SetOutputSpacing([ISO_MM] * 3)
    resample.SetSize(new_size)
    resample.SetOutputDirection(img.GetDirection())
    resample.SetOutputOrigin(img.GetOrigin())
    resample.SetInterpolator(sitk.sitkLinear)
    resample.SetDefaultPixelValue(-1000)
    img = resample.Execute(img)

    arr = sitk.GetArrayFromImage(img)
    metal = keep_significant(arr >= HU_METAL)
    if metal.sum() < 500:
        raise SystemExit("Metal segmentation nearly empty.")

    kk, jj, ii = np.nonzero(metal)
    idx = np.stack([ii, jj, kk], axis=1).astype(float)
    pts = np.array([img.TransformContinuousIndexToPhysicalPoint(p) for p in idx])

    centre, axis, u, v = principal_axis(pts)
    rel = pts - centre
    z = rel @ axis
    a = rel @ u
    b = rel @ v
    theta = (np.degrees(np.arctan2(b, a)) - theta_ref_deg) % 360.0
    theta = np.where(theta > 180.0, theta - 360.0, theta)
    return Frame(z_mm=z, r_mm=np.hypot(a, b), theta_deg=theta)


def bin_index(theta_deg: np.ndarray) -> np.ndarray:
    edges = np.linspace(-180.0, 180.0, THETA_BINS + 1)
    return np.clip(np.digitize(theta_deg, edges) - 1, 0, THETA_BINS - 1)


def envelope(frame: Frame):
    """Per-bin axial extent of metal, in the raw frame."""
    idx = bin_index(frame.theta_deg)
    lo = np.full(THETA_BINS, np.nan)
    hi = np.full(THETA_BINS, np.nan)
    rad = np.full(THETA_BINS, np.nan)
    for b in range(THETA_BINS):
        sel = idx == b
        if sel.any():
            lo[b] = frame.z_mm[sel].min()
            hi[b] = frame.z_mm[sel].max()
            rad[b] = np.percentile(frame.r_mm[sel], 90.0)
    return lo, hi, rad


def apex_rows(descriptor: dict):
    """Stored apices as (theta bin, z), split proximal and distal."""
    prox, dist = [], []
    for ring in descriptor["rings"]:
        for apex in ring["proximal_apices"]:
            prox.append((apex["theta_deg"], apex["z_mm"]))
        for apex in ring["distal_apices"]:
            dist.append((apex["theta_deg"], apex["z_mm"]))
    return prox, dist


def fit_datum(descriptor: dict, raw_runs: list[list[list[float]]]):
    """Find the sign and offset that place the stored apices on measured metal.

    Each apex is the axial extreme of its own ring, so it should land on the
    boundary of one of the metal runs at its angle — not on the device-wide
    envelope, which at any angle spans every ring. Matching against run
    boundaries is what makes the fit meaningful: one sign and one offset are
    fitted against a hundred or more apices spread over the whole device, so a
    small residual cannot be coincidence.
    """
    prox, dist = apex_rows(descriptor)
    apices = prox + dist
    if len(apices) < 8:
        raise SystemExit("Descriptor has too few apices to fit against.")

    edges = np.linspace(-180.0, 180.0, THETA_BINS + 1)

    def to_bin(theta_deg: float) -> int:
        t = theta_deg - 360.0 if theta_deg > 180.0 else theta_deg
        return int(np.clip(np.digitize(t, edges) - 1, 0, THETA_BINS - 1))

    # Every run boundary at each angle, sorted, as the targets to snap to.
    per_bin = []
    for bin_runs in raw_runs:
        if bin_runs:
            per_bin.append(np.sort(np.array([v for run in bin_runs for v in run])))
        else:
            per_bin.append(np.empty(0))

    # Pad the per-angle boundaries into a rectangular array so a candidate can
    # be scored against every apex at once.
    width = max(1, max(e.size for e in per_bin))
    padded = np.full((THETA_BINS, width), np.inf)
    for b, e in enumerate(per_bin):
        if e.size:
            padded[b, : e.size] = e

    apex_theta = np.array(
        [t - 360.0 if t > 180.0 else t for t, _ in apices], dtype=float
    )
    apex_z = np.array([z for _, z in apices], dtype=float)

    # A ring repeats every 360/n degrees, so a rotation search wider than half
    # that can settle one whole period out — geometry that looks identical on an
    # idealised ring but misaligns every measured irregularity, which is the
    # very thing this map exists to preserve.
    apex_counts = [r["n_apices"] for r in descriptor["rings"] if r.get("n_apices")]
    half_period = 180.0 / max(1, int(np.median(apex_counts))) if apex_counts else 30.0

    all_raw = np.concatenate([e for e in per_bin if e.size])
    raw_lo, raw_hi = float(all_raw.min()), float(all_raw.max())
    desc_lo, desc_hi = float(apex_z.min()), float(apex_z.max())

    def residuals(sign: float, offset: float, theta_shift: float) -> np.ndarray:
        shifted = (apex_theta + theta_shift + 180.0) % 360.0 - 180.0
        bins = np.clip(np.digitize(shifted, edges) - 1, 0, THETA_BINS - 1)
        target = (apex_z - offset) / sign
        return np.min(np.abs(padded[bins] - target[:, None]), axis=1)

    best = None
    for sign in (1.0, -1.0):
        span_lo = desc_lo - sign * (raw_hi if sign > 0 else raw_lo)
        span_hi = desc_hi - sign * (raw_lo if sign > 0 else raw_hi)
        low, high = min(span_lo, span_hi), max(span_lo, span_hi)

        # The angular datum is fitted, not assumed. `principal_axis` derives its
        # in-plane basis from a helper vector, so a hair's difference in the
        # fitted axis rotates the whole frame; the offset between this run and
        # the one that wrote the apices is arbitrary. It is bounded to well
        # inside one apex period so the fit cannot land on an alias.
        def best_offset(theta_shift: float) -> tuple[float, float]:
            coarse = 0.0
            for step, window in ((1.0, None), (0.05, 2.0)):
                grid = (
                    np.arange(low - 5.0, high + 5.0, step)
                    if window is None
                    else np.arange(coarse - window, coarse + window, step)
                )
                scores = [
                    float(np.median(residuals(sign, float(o), theta_shift)))
                    for o in grid
                ]
                coarse = float(grid[int(np.argmin(scores))])
            return coarse, float(np.median(residuals(sign, coarse, theta_shift)))

        coarse_shift, _ = min(
            (
                (t, best_offset(float(t))[1])
                for t in np.arange(-half_period, half_period + 0.01, 1.0)
            ),
            key=lambda pair: pair[1],
        )
        for theta_shift in np.arange(coarse_shift - 1.0, coarse_shift + 1.01, 0.1):
            offset, score = best_offset(float(theta_shift))
            res = residuals(sign, offset, float(theta_shift))
            if best is None or score < best[0]:
                best = (
                    score,
                    sign,
                    offset,
                    float(np.percentile(res, 95)),
                    float(theta_shift),
                )

    if best is None:
        raise SystemExit("Could not fit the axial datum.")
    return best  # (p50 residual, sign, offset, p95 residual, theta shift)


def runs_for_bin(z_values: np.ndarray) -> list[list[float]]:
    """Merge sorted z samples into metal intervals."""
    z = np.sort(z_values)
    runs: list[list[float]] = []
    start = prev = z[0]
    for value in z[1:]:
        if value - prev > RUN_GAP_MM:
            runs.append([start, prev])
            start = value
        prev = value
    runs.append([start, prev])
    return runs


def build_wire_map(frame: Frame, sign: float, offset: float, theta_shift: float = 0.0):
    """Metal intervals per angular bin, in the descriptor's z and theta datums."""
    z_desc = sign * frame.z_mm + offset
    # The fit rotates the apices onto the map; the map is emitted rotated the
    # other way so that stored apices and wire map share one angular datum.
    idx = bin_index((frame.theta_deg - theta_shift + 180.0) % 360.0 - 180.0)
    runs: list[list[list[float]]] = []
    radius: list[float | None] = []
    for b in range(THETA_BINS):
        sel = idx == b
        if not sel.any():
            runs.append([])
            radius.append(None)
            continue
        merged = runs_for_bin(z_desc[sel])
        runs.append([[round(a, 3), round(b_, 3)] for a, b_ in merged])
        radius.append(round(float(np.percentile(frame.r_mm[sel], 90.0)), 3))
    return runs, radius


def summarise(runs) -> dict:
    counts = [len(r) for r in runs]
    spans = [b - a for bin_runs in runs for a, b in bin_runs]
    return {
        "bins_with_metal": int(sum(1 for c in counts if c > 0)),
        "runs_total": int(sum(counts)),
        "runs_per_bin_median": float(np.median(counts)),
        "run_length_median_mm": round(float(np.median(spans)), 3) if spans else 0.0,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dicom-root",
        required=True,
        help="Directory holding the per-device DICOM folders.",
    )
    parser.add_argument(
        "--library",
        default="library",
        help="Directory holding the descriptor JSON files.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate and report without writing.",
    )
    parser.add_argument(
        "--max-residual-mm",
        type=float,
        default=1.5,
        help="Refuse to write if the datum fit is worse than this.",
    )
    args = parser.parse_args()

    failures = 0
    for scan, folder, libfile in SCANS:
        path = os.path.join(args.library, libfile)
        with open(path) as handle:
            descriptor = json.load(handle)

        theta_ref = descriptor["datum"]["theta_zero_deg_in_scan_frame"]
        frame = read_frame(os.path.join(args.dicom_root, folder), theta_ref)
        raw_runs, _ = build_wire_map(frame, 1.0, 0.0)
        residual, sign, offset, p95, theta_shift = fit_datum(descriptor, raw_runs)

        runs, radius = build_wire_map(frame, sign, offset, theta_shift)
        stats = summarise(runs)
        stored_points = sum(
            len(r["proximal_apices"]) + len(r["distal_apices"])
            for r in descriptor["rings"]
        )

        status = "ok" if residual <= args.max_residual_mm else "POOR FIT"
        print(
            f"{scan}: sign={sign:+.0f} offset={offset:8.3f}mm "
            f"theta{theta_shift:+.2f}deg "
            f"apex residual p50={residual:.3f} p95={p95:.3f}mm [{status}]"
        )
        print(
            f"   stored apex points {stored_points} -> "
            f"{stats['runs_total']} measured runs over "
            f"{stats['bins_with_metal']}/{THETA_BINS} bins, "
            f"median {stats['runs_per_bin_median']:.0f} runs/bin, "
            f"median run {stats['run_length_median_mm']:.2f}mm"
        )

        if residual > args.max_residual_mm:
            failures += 1
            print("   refusing to write: the axial datum was not recovered.")
            continue
        if args.check:
            continue

        descriptor["wire_map"] = {
            "theta_bins": THETA_BINS,
            "theta_step_deg": 360.0 / THETA_BINS,
            "hu_metal_threshold": HU_METAL,
            "isotropic_spacing_mm": ISO_MM,
            "run_gap_mm": RUN_GAP_MM,
            "datum_fit": {
                "axis_sign": int(sign),
                "z_offset_mm": round(offset, 3),
                "theta_shift_deg": round(theta_shift, 3),
                "apex_residual_p50_mm": round(residual, 3),
                "apex_residual_p95_mm": round(p95, 3),
            },
            "note": (
                "Axial intervals of segmented metal per angular bin, in this "
                "descriptor's z and theta datums. Measured, not interpolated: "
                "use in preference to the apex rows for anything that decides "
                "strut conflict."
            ),
            "runs": runs,
            "radius_mm": radius,
        }
        with open(path, "w") as handle:
            json.dump(descriptor, handle, indent=2)
            handle.write("\n")
        print(f"   wrote {path}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
