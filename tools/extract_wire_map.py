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

The fit must include a *reflection*, not only a rotation. `principal_axis` takes
its in-plane basis from the axis, so flipping the axis sends `u = axis x helper`
to `-u` while leaving `v` alone — that is `theta -> -theta`, which no amount of
theta shift can undo. Left unsearched it silently mirrored two of the three
devices: fitting the stored maps showed scan2 and scan3 (both `axis_sign: +1`)
reaching a median residual of 0.156 and 0.095 mm mirrored, against 0.443 and
0.547 unmirrored, with the fraction of apices over 1 mm falling from 33% and 39%
to 2% and 6%. The axis sign is now normalised so the frame is reproducible in
the first place, and the mirror is searched so that a frame which still comes
out reflected is corrected rather than absorbed into a wrong rotation.

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
    # SVD returns an arbitrary sign, and the sign is not cosmetic: flipping the
    # axis reflects the in-plane basis below, mirroring theta. Normalise it the
    # way `endograft_geometry.cylindrical_coordinates` does, so both tools build
    # the same frame from the same device and the fit has only a rotation left
    # to find.
    if axis[int(np.argmax(np.abs(axis)))] < 0:
        axis = -axis
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
    # Take the most-sliced series, matching `endograft_geometry.load_series`.
    # GDCM's series order is not stable, so picking `ids[0]` could read a
    # different reconstruction from the one that wrote the apices — and the fit
    # below would then be registering two different acquisitions.
    files = max(
        (reader.GetGDCMSeriesFileNames(dicom_dir, series_id) for series_id in ids),
        key=len,
    )
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


def apex_rows(descriptor: dict):
    """Stored apices as (theta bin, z), split proximal and distal."""
    prox, dist = [], []
    for ring in descriptor["rings"]:
        for apex in ring["proximal_apices"]:
            prox.append((apex["theta_deg"], apex["z_mm"]))
        for apex in ring["distal_apices"]:
            dist.append((apex["theta_deg"], apex["z_mm"]))
    return prox, dist


@dataclass
class DatumFit:
    """The transform taking the raw cylindrical frame into the descriptor's."""

    axis_sign: float
    z_offset_mm: float
    theta_mirror: int
    theta_shift_deg: float
    residual_p50_mm: float
    residual_p90_mm: float
    residual_p95_mm: float
    fraction_over_1mm: float
    alias_margin_mm: float
    alias_ratio: float


def fit_datum(descriptor: dict, raw_runs: list[list[list[float]]]) -> DatumFit:
    """Find the transform that places the stored apices on measured metal.

    Each apex is the axial extreme of its own ring, so it should land on the
    boundary of one of the metal runs at its angle — not on the device-wide
    envelope, which at any angle spans every ring. Matching against run
    boundaries is what makes the fit meaningful: four parameters are fitted
    against a hundred or more apices spread over the whole device, so a small
    residual cannot be coincidence.

    The four are an axis sign, an axial offset, a rotation — and a *reflection*,
    because a flipped principal axis mirrors theta and a rotation cannot undo
    that. See the module docstring.
    """
    prox, dist = apex_rows(descriptor)
    apices = prox + dist
    if len(apices) < 8:
        raise SystemExit("Descriptor has too few apices to fit against.")

    edges = np.linspace(-180.0, 180.0, THETA_BINS + 1)

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

    all_raw = np.concatenate([e for e in per_bin if e.size])
    raw_lo, raw_hi = float(all_raw.min()), float(all_raw.max())
    desc_lo, desc_hi = float(apex_z.min()), float(apex_z.max())

    def residuals(
        sign: float, mirror: int, theta_shift: float, offsets: np.ndarray
    ) -> np.ndarray:
        """Per-apex residual for every candidate offset at once."""
        shifted = (mirror * apex_theta + theta_shift + 180.0) % 360.0 - 180.0
        bins = np.clip(np.digitize(shifted, edges) - 1, 0, THETA_BINS - 1)
        boundaries = padded[bins]                                # (apex, width)
        targets = (apex_z[None, :] - offsets[:, None]) / sign     # (offset, apex)
        gaps = np.abs(boundaries[None, :, :] - targets[:, :, None])
        return gaps.min(axis=2)                                  # (offset, apex)

    def score(
        sign: float, mirror: int, theta_shift: float, offsets: np.ndarray
    ) -> tuple[float, float]:
        """Best (median residual, offset) over a grid of offsets."""
        best_score, best_offset = np.inf, float(offsets[0])
        for start in range(0, offsets.size, 256):          # bound peak memory
            chunk = offsets[start : start + 256]
            medians = np.median(residuals(sign, mirror, theta_shift, chunk), axis=1)
            index = int(np.argmin(medians))
            if medians[index] < best_score:
                best_score = float(medians[index])
                best_offset = float(chunk[index])
        return best_score, best_offset

    def full_offset_grid(sign: float, step: float) -> np.ndarray:
        span_lo = desc_lo - sign * (raw_hi if sign > 0 else raw_lo)
        span_hi = desc_hi - sign * (raw_lo if sign > 0 else raw_hi)
        return np.arange(min(span_lo, span_hi) - 5.0, max(span_lo, span_hi) + 5.0, step)

    # Coarse sweep of the whole circle, for each sign and each handedness. The
    # rotation is searched over 360 degrees rather than bounded to half an apex
    # period: with the reflection in play the true shift is measured from the
    # raw frame's arbitrary zero and can legitimately fall outside that bound —
    # it does on scan3, whose mirrored optimum sits at -42 degrees against a
    # +/-36 degree period bound. Aliasing is caught afterwards by measuring the
    # margin to the best distant competitor instead of assuming it away.
    best: tuple[float, float, int, float, float] | None = None
    for sign in (1.0, -1.0):
        coarse_offsets = full_offset_grid(sign, 1.0)
        for mirror in (1, -1):
            for theta_shift in np.arange(-180.0, 180.0, 2.0):
                value, offset = score(sign, mirror, float(theta_shift), coarse_offsets)
                if best is None or value < best[0]:
                    best = (value, sign, mirror, float(theta_shift), offset)

    if best is None:
        raise SystemExit("Could not fit the axial datum.")
    _, sign, mirror, coarse_shift, coarse_offset = best

    # Refine rotation and offset together around the coarse optimum.
    for theta_window, theta_step, offset_window, offset_step in (
        (2.0, 0.2, 2.0, 0.1),
        (0.3, 0.02, 0.2, 0.01),
    ):
        offsets = np.arange(
            coarse_offset - offset_window, coarse_offset + offset_window, offset_step
        )
        refined = min(
            (
                (*score(sign, mirror, float(t), offsets), float(t))
                for t in np.arange(
                    coarse_shift - theta_window,
                    coarse_shift + theta_window + theta_step,
                    theta_step,
                )
            ),
            key=lambda item: item[0],
        )
        _, coarse_offset, coarse_shift = refined

    final = residuals(
        sign, mirror, coarse_shift, np.array([coarse_offset])
    )[0]

    # How much worse is the best rotation that is not simply a neighbour of this
    # one? A ring repeats every 360/n degrees, so an alias sits one period away
    # and scores almost as well on an idealised ring. A small margin here means
    # the rotation is not determined by the data, which is exactly the failure a
    # median residual on its own cannot see.
    apex_counts = [r["n_apices"] for r in descriptor["rings"] if r.get("n_apices")]
    period = 360.0 / max(1, int(np.median(apex_counts))) if apex_counts else 60.0
    near_offsets = np.arange(coarse_offset - 3.0, coarse_offset + 3.0, 0.25)
    alias = np.inf
    for theta_shift in np.arange(-180.0, 180.0, 1.0):
        separation = abs((theta_shift - coarse_shift + 180.0) % 360.0 - 180.0)
        if separation < period / 2:
            continue
        value, _ = score(sign, mirror, float(theta_shift), near_offsets)
        alias = min(alias, value)

    median = float(np.median(final))
    return DatumFit(
        axis_sign=sign,
        z_offset_mm=coarse_offset,
        theta_mirror=mirror,
        theta_shift_deg=coarse_shift,
        residual_p50_mm=median,
        residual_p90_mm=float(np.percentile(final, 90)),
        residual_p95_mm=float(np.percentile(final, 95)),
        fraction_over_1mm=float((final > 1.0).mean()),
        alias_margin_mm=float(alias - median),
        # A ratio, not a distance: both scores shrink together as the fit
        # sharpens, so how many times worse the alias is says more about whether
        # the rotation is determined than how many millimetres worse it is.
        alias_ratio=float(alias / median) if median > 0 else float("inf"),
    )


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


def build_wire_map(
    frame: Frame,
    sign: float,
    offset: float,
    theta_shift: float = 0.0,
    mirror: int = 1,
):
    """Metal intervals per angular bin, in the descriptor's z and theta datums."""
    z_desc = sign * frame.z_mm + offset
    # The fit takes an apex at theta to the raw map at `mirror * theta + shift`;
    # the map is emitted through the inverse of that, so stored apices and wire
    # map share one angular datum. `mirror` is its own inverse.
    idx = bin_index(
        (mirror * (frame.theta_deg - theta_shift) + 180.0) % 360.0 - 180.0
    )
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
        help="Refuse to write if the median apex residual exceeds this.",
    )
    # A median alone cannot see a mirrored frame: with 7 to 10 rings every apex
    # finds some run boundary near it, so half of them stay sub-millimetre
    # through a reflection. What separates a recovered frame from a mirrored one
    # is the tail — 2.7 to 10% of apices over 1 mm when correct, against 33 and
    # 39% on the two devices that were written mirrored.
    parser.add_argument(
        "--max-fraction-over-1mm",
        type=float,
        default=0.20,
        help="Refuse to write if more than this fraction of apices land further "
             "than 1 mm from measured metal.",
    )
    parser.add_argument(
        "--min-alias-ratio",
        type=float,
        default=2.0,
        help="Refuse to write unless the best rotation a full apex period away "
             "scores at least this many times worse; below it the rotation is "
             "not determined by the data.",
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
        fit = fit_datum(descriptor, raw_runs)

        runs, radius = build_wire_map(
            frame, fit.axis_sign, fit.z_offset_mm, fit.theta_shift_deg, fit.theta_mirror
        )
        stats = summarise(runs)
        stored_points = sum(
            len(r["proximal_apices"]) + len(r["distal_apices"])
            for r in descriptor["rings"]
        )

        poor_fit = (
            fit.residual_p50_mm > args.max_residual_mm
            or fit.fraction_over_1mm > args.max_fraction_over_1mm
        )
        ambiguous = fit.alias_ratio < args.min_alias_ratio
        status = "POOR FIT" if poor_fit else ("AMBIGUOUS" if ambiguous else "ok")
        print(
            f"{scan}: sign={fit.axis_sign:+.0f} mirror={fit.theta_mirror:+d} "
            f"offset={fit.z_offset_mm:8.3f}mm theta{fit.theta_shift_deg:+.2f}deg "
            f"[{status}]"
        )
        print(
            f"   apex residual p50={fit.residual_p50_mm:.3f} "
            f"p90={fit.residual_p90_mm:.3f} p95={fit.residual_p95_mm:.3f}mm, "
            f"{100 * fit.fraction_over_1mm:.1f}% over 1mm, "
            f"alias {fit.alias_ratio:.1f}x ({fit.alias_margin_mm:+.3f}mm)"
        )
        print(
            f"   stored apex points {stored_points} -> "
            f"{stats['runs_total']} measured runs over "
            f"{stats['bins_with_metal']}/{THETA_BINS} bins, "
            f"median {stats['runs_per_bin_median']:.0f} runs/bin, "
            f"median run {stats['run_length_median_mm']:.2f}mm"
        )

        if poor_fit or ambiguous:
            failures += 1
            print(
                "   refusing to write: "
                + (
                    "the frame was not recovered."
                    if poor_fit
                    else "the rotation is not determined by the data."
                )
            )
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
                "axis_sign": int(fit.axis_sign),
                "z_offset_mm": round(fit.z_offset_mm, 3),
                "theta_mirror": fit.theta_mirror,
                "theta_shift_deg": round(fit.theta_shift_deg, 3),
                "apex_residual_p50_mm": round(fit.residual_p50_mm, 3),
                "apex_residual_p90_mm": round(fit.residual_p90_mm, 3),
                "apex_residual_p95_mm": round(fit.residual_p95_mm, 3),
                "apex_fraction_over_1mm": round(fit.fraction_over_1mm, 4),
                "theta_alias_ratio": round(fit.alias_ratio, 3),
                "theta_alias_margin_mm": round(fit.alias_margin_mm, 3),
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
