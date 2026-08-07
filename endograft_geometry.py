#!/usr/bin/env python3
"""Extract free-state endograft ring geometry from bench CT DICOM folders.

This is a measurement/QC tool, not a clinical planning or device-sizing tool.
It assumes one freely expanded endograft scanned in air.  Always inspect the
generated QC image before accepting an exported descriptor.

Examples:
  python endograft_geometry.py audit /scans/device
  python endograft_geometry.py extract /scans/device --device "Example" \\
      --size 30-100 --out ./geometry
"""

from __future__ import annotations

import argparse
import gc
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Iterable

try:
    import numpy as np
    import SimpleITK as sitk
    from scipy import ndimage
    from scipy.signal import find_peaks
except ImportError as exc:  # pragma: no cover - helpful for CLI users
    raise SystemExit(
        "Missing dependency: install SimpleITK, numpy, scipy, and matplotlib. "
        f"({exc.name} is unavailable)"
    ) from exc


HU_METAL_DEFAULT = 1600.0
HU_MARKER_DEFAULT = 2800.0
HU_FABRIC_LO_DEFAULT = -400.0
HU_FABRIC_HI_DEFAULT = 600.0
MAX_USABLE_VOXEL_MM = 1.5
PHASE_RELIABLE_VOXEL_MM = 0.6


def die(message: str) -> "None":
    raise SystemExit(message)


def dicom_series(directory: str) -> list[tuple[str, list[str]]]:
    """Discover GDCM series recursively, returning fully ordered file names."""
    root = Path(directory)
    if not root.is_dir():
        die(f"DICOM directory does not exist: {root}")
    reader = sitk.ImageSeriesReader()
    found: list[tuple[str, list[str]]] = []
    seen: set[tuple[str, tuple[str, ...]]] = set()
    for folder in (root, *(p for p in root.rglob("*") if p.is_dir())):
        try:
            ids = reader.GetGDCMSeriesIDs(str(folder)) or []
        except RuntimeError:
            continue
        for series_id in ids:
            files = reader.GetGDCMSeriesFileNames(str(folder), series_id)
            key = (series_id, tuple(files))
            if files and key not in seen:
                found.append((series_id, files))
                seen.add(key)
    if not found:
        die(f"No readable DICOM series found below {root}")
    return found


def metadata(files: list[str]) -> dict[str, str | None]:
    reader = sitk.ImageFileReader()
    reader.SetFileName(files[0])
    reader.LoadPrivateTagsOn()
    reader.ReadImageInformation()

    def value(key: str) -> str | None:
        return reader.GetMetaData(key).strip() if reader.HasMetaDataKey(key) else None

    return {
        "slice_thickness": value("0018|0050"),
        "spacing_between_slices": value("0018|0088"),
        "kernel": value("0018|1210"),
        "kvp": value("0018|0060"),
        "series_description": value("0008|103e"),
        "scan_date": value("0008|0022"),
    }


def load_series(directory: str, selected: str | None) -> tuple[sitk.Image, str, list[str]]:
    series = dicom_series(directory)
    if selected is not None:
        matches = [(sid, files) for sid, files in series if sid == selected]
        if not matches:
            die(f"Series not found: {selected}")
        series_id, files = matches[0]
    else:
        series_id, files = max(series, key=lambda item: len(item[1]))
    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(files)
    reader.MetaDataDictionaryArrayUpdateOn()
    reader.LoadPrivateTagsOn()
    return reader.Execute(), series_id, files


def number(value: str | None) -> float | None:
    """First value of a DICOM decimal string, or None if it will not parse."""
    if value is None:
        return None
    try:
        return float(value.split("\\")[0])
    except ValueError:
        return None


def iso_date(value: str | None) -> str | None:
    """Convert the DICOM DA representation (YYYYMMDD) to ISO-8601."""
    if value is None:
        return None
    match = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", value)
    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}" if match else None


def voxel_dimensions(image: sitk.Image, tags: dict[str, str | None]) -> tuple[float, float, float]:
    """Use image z spacing first; DICOM tags are fallbacks for malformed stacks."""
    spacing = image.GetSpacing()
    z = spacing[2] if len(spacing) == 3 and spacing[2] > 0 else (
        number(tags["spacing_between_slices"]) or number(tags["slice_thickness"]) or math.inf
    )
    return float(spacing[0]), float(spacing[1]), float(z)


def reliability(worst_mm: float) -> str:
    if worst_mm <= PHASE_RELIABLE_VOXEL_MM:
        return "apex phase + strut conflict OK"
    if worst_mm <= MAX_USABLE_VOXEL_MM:
        return "ring axial positions + diameters only"
    return "not usable"


def cmd_audit(args: argparse.Namespace) -> None:
    rows = []
    for series_id, files in dicom_series(args.dicom_dir):
        image, _, _ = load_series(args.dicom_dir, series_id)
        tags = metadata(files)
        dims = voxel_dimensions(image, tags)
        rows.append((series_id, len(files), tags, dims, max(dims)))

    print(f"{len(rows)} DICOM series under {args.dicom_dir}\n")
    for series_id, slices, tags, dims, worst in rows:
        print(f"series {series_id}")
        print(f"  slices: {slices}; spacing: {dims[0]:.3f} x {dims[1]:.3f} x {dims[2]:.3f} mm")
        print(f"  slice thickness: {tags['slice_thickness'] or 'unknown'} mm; "
              f"slice spacing: {tags['spacing_between_slices'] or 'unknown'} mm")
        print(f"  kernel: {tags['kernel'] or 'unknown'}; kVp: {tags['kvp'] or 'unknown'}")
        print(f"  worst voxel: {worst:.3f} mm — {reliability(worst)}\n")


def resample_isotropic(image: sitk.Image, requested_spacing: float) -> sitk.Image:
    source = np.asarray(image.GetSpacing(), dtype=float)
    target = requested_spacing if requested_spacing > 0 else float(source.min())
    if np.allclose(source, target, atol=1e-4):
        return image
    out_size = np.maximum(1, np.round(np.asarray(image.GetSize()) * source / target).astype(int))
    return sitk.Resample(
        image, out_size.tolist(), sitk.Transform(), sitk.sitkLinear,
        image.GetOrigin(), [target] * 3, image.GetDirection(), -1024, image.GetPixelID(),
    )


def crop_to_metal_roi(image: sitk.Image, hu_metal: float, margin_mm: float = 5.0) -> sitk.Image:
    """Crop before resampling so full clinical CTs do not exhaust memory.

    Metal occupies a very small fraction of a bench scan.  Computing a label
    volume over a 512 x 512 x 800 CT can otherwise require several gigabytes,
    especially when anisotropic input is upsampled first.
    """
    metal = sitk.BinaryThreshold(image, lowerThreshold=hu_metal, upperThreshold=32767,
                                 insideValue=1, outsideValue=0)
    stats = sitk.LabelShapeStatisticsImageFilter()
    stats.Execute(metal)
    if not stats.HasLabel(1):
        die("Metal segmentation is empty; lower --hu-metal or select another series.")
    index = np.asarray(stats.GetBoundingBox(1)[:3], dtype=int)
    size = np.asarray(stats.GetBoundingBox(1)[3:], dtype=int)
    padding = np.ceil(margin_mm / np.asarray(image.GetSpacing())).astype(int)
    start = np.maximum(0, index - padding)
    stop = np.minimum(np.asarray(image.GetSize()), index + size + padding)
    del metal, stats
    gc.collect()
    return sitk.RegionOfInterest(image, (stop - start).tolist(), start.tolist())


def significant_components(mask: np.ndarray, fraction_of_largest: float) -> tuple[np.ndarray, int]:
    if not 0 < fraction_of_largest <= 1:
        die("--min-component-frac must be in (0, 1].")
    labels, count = ndimage.label(mask)
    if count == 0:
        return labels, 0
    sizes = np.asarray(ndimage.sum(mask, labels, range(1, count + 1)), dtype=float)
    keep = np.flatnonzero(sizes >= sizes.max() * fraction_of_largest) + 1
    relabelled = np.zeros_like(labels, dtype=np.int32)
    for new_label, old_label in enumerate(keep, start=1):
        relabelled[labels == old_label] = new_label
    return relabelled, len(keep)


def points_mm(image: sitk.Image, mask: np.ndarray) -> np.ndarray:
    z, y, x = np.nonzero(mask)
    indexes = np.column_stack((x, y, z)).astype(float)
    # Vector transforms are not exposed in all SimpleITK builds; this is
    # deliberately explicit and preserves image origin/direction exactly.
    return np.asarray([image.TransformContinuousIndexToPhysicalPoint(i) for i in indexes])


def cylindrical_coordinates(points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, tuple[np.ndarray, ...]]:
    """Return axial s, radius r, theta and a PCA-derived physical frame."""
    origin = points.mean(axis=0)
    _, _, vectors = np.linalg.svd(points - origin, full_matrices=False)
    axis = vectors[0]
    if axis[np.argmax(np.abs(axis))] < 0:
        axis = -axis
    helper = np.array([1.0, 0.0, 0.0]) if abs(axis[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(axis, helper)
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    relative = points - origin
    s, a, b = relative @ axis, relative @ u, relative @ v
    return s, np.hypot(a, b), np.arctan2(b, a), (origin, axis, u, v)


def circular_mean_degrees(angles: Iterable[float]) -> float | None:
    angles = list(angles)
    if not angles:
        return None
    mean = np.mean(np.exp(1j * np.radians(angles)))
    return float(np.degrees(np.angle(mean)) % 360)


def detect_apices(s: np.ndarray, theta: np.ndarray, prominence_fraction: float) -> tuple[list[dict[str, float]], list[dict[str, float]], float]:
    """Find envelope minima/maxima around a ring in an unrolled cylinder."""
    bins = 360
    edges = np.linspace(-np.pi, np.pi, bins + 1)
    indexes = np.clip(np.digitize(theta, edges) - 1, 0, bins - 1)
    low, high = np.full(bins, np.inf), np.full(bins, -np.inf)
    np.minimum.at(low, indexes, s)
    np.maximum.at(high, indexes, s)
    valid = np.isfinite(low) & np.isfinite(high)
    if valid.sum() < bins // 2:
        return [], [], 0.0
    centres = (edges[:-1] + edges[1:]) / 2
    wrapped_x = np.concatenate((centres[valid] - 2 * np.pi, centres[valid], centres[valid] + 2 * np.pi))
    low = np.interp(centres, wrapped_x, np.tile(low[valid], 3))
    high = np.interp(centres, wrapped_x, np.tile(high[valid], 3))
    low = ndimage.gaussian_filter1d(low, 2, mode="wrap")
    high = ndimage.gaussian_filter1d(high, 2, mode="wrap")
    height = float(high.max() - low.min())
    prominence = max(0.3, prominence_fraction * height)
    distance = max(3, bins // 24)

    def peaks(signal: np.ndarray) -> list[dict[str, float]]:
        found, _ = find_peaks(np.tile(signal, 3), prominence=prominence, distance=distance)
        found = found[(found >= bins) & (found < 2 * bins)] - bins
        return [{"theta_deg": float(np.degrees(centres[i]) % 360), "z_mm": float(signal[i])} for i in found]

    # z positions are already in the desired physical axial direction.
    proximal = peaks(-low)
    for point in proximal:
        point["z_mm"] *= -1
    distal = peaks(high)
    return proximal, distal, height


def apex_phase(apices: list[dict[str, float]], n_apices: int) -> float | None:
    if not apices or n_apices == 0:
        return None
    period = 360.0 / n_apices
    # Fold the apex comb into one period, then take its circular mean.
    folded = [point["theta_deg"] % period for point in apices]
    scaled = [angle * 360.0 / period for angle in folded]
    mean = circular_mean_degrees(scaled)
    return None if mean is None else (mean * period / 360.0) % period


def profile(s: np.ndarray, radius: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    first = math.floor(float(s.min()))
    last = math.ceil(float(s.max()))
    z_values, diameters = [], []
    for start in np.arange(first, last, 1.0):
        selected = (s >= start) & (s < start + 1.0)
        if selected.sum() >= 12:
            z_values.append(start + 0.5)
            diameters.append(2 * float(np.percentile(radius[selected], 90)))
    return np.asarray(z_values), np.asarray(diameters)


def fabric_datum(
    array: np.ndarray, image: sitk.Image, frame: tuple[np.ndarray, ...], radius: np.ndarray,
    s_metal: np.ndarray, lo: float, hi: float, metal: np.ndarray, spacing: float,
    exclusion_mm: float, flip_z: bool = False,
) -> tuple[float, float | None, bool]:
    """Estimate fabric extent from a shell around the metal wall; safely fall back.

    Voxels adjacent to metal are excluded first, and that exclusion is the whole
    difference between measuring textile and measuring the stent. Every strut
    carries a partial-volume halo whose HU falls from the metal threshold to air,
    passing straight through the fabric window on the way; unmasked, the window
    finds that halo wherever metal exists and nowhere else. Left in, it set the
    fabric extent on both devices where this was thought to have succeeded —
    `covered_length_mm` came out at 186.79 and 199.14 mm against metal spans of
    180.46 and 197.87 mm on scan1 and scan3, tracking the metal rather than the
    textile it was supposed to find.

    A container tube is the other contaminant this band can pick up: the radial
    window is centred on the metal wall, so a tube whose wall falls within it
    reads as fabric and, running past both ends of the device, stretches the
    extent the same way. It cannot be masked generically, which is why the
    caller cross-checks the result against the metal span.
    """
    oriented_metal_s = -s_metal if flip_z else s_metal
    shell = (array >= lo) & (array <= hi)
    if exclusion_mm > 0 and metal.any():
        iterations = max(1, int(round(exclusion_mm / max(spacing, 1e-6))))
        shell &= ~ndimage.binary_dilation(metal, iterations=iterations)
    if shell.sum() < 500:
        return float(np.percentile(oriented_metal_s, 0.5)), None, False
    fabric_points = points_mm(image, shell)
    origin, axis, u, v = frame
    delta = fabric_points - origin
    s = delta @ axis
    if flip_z:
        s = -s
    radial = np.hypot(delta @ u, delta @ v)
    wall = float(np.percentile(radius, 90))
    selected = (np.abs(radial - wall) < 3.0) & (s > oriented_metal_s.min() - 25) & (s < oriented_metal_s.max() + 25)
    if selected.sum() < 500:
        return float(np.percentile(oriented_metal_s, 0.5)), None, False
    fabric_s = s[selected]
    z0 = float(np.percentile(fabric_s, 1))
    return z0, float(np.percentile(fabric_s, 99) - z0), True


def output_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-") or "unnamed"


def qc_image(path: Path, theta: np.ndarray, s: np.ndarray, z_profile: np.ndarray, d_profile: np.ndarray,
             rings: list[dict[str, Any]]) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 2, figsize=(13, 6), gridspec_kw={"width_ratios": [2, 1]})
    sample_count = min(len(s), 150_000)
    sample = np.random.default_rng(0).choice(len(s), sample_count, replace=False)
    axes[0].scatter(theta[sample], s[sample], s=0.35, alpha=0.25, color="0.25", linewidths=0)
    for ring in rings:
        for point in ring["proximal_apices"]:
            axes[0].plot(point["theta_deg"], point["z_mm"], "v", color="crimson", ms=5)
        for point in ring["distal_apices"]:
            axes[0].plot(point["theta_deg"], point["z_mm"], "^", color="royalblue", ms=5)
    axes[0].set(xlim=(0, 360), xlabel="theta (degrees; 0 = datum)", ylabel="z from datum (mm)",
                title="Unrolled metal cloud and apices")
    axes[0].invert_yaxis()
    axes[1].plot(d_profile, z_profile, color="black")
    axes[1].set(xlabel="90th-percentile diameter (mm)", ylabel="z (mm)", title="Diameter profile")
    axes[1].grid(alpha=0.25)
    axes[1].invert_yaxis()
    fig.tight_layout()
    fig.savefig(path, dpi=140)
    plt.close(fig)


def cmd_extract(args: argparse.Namespace) -> None:
    image, series_id, files = load_series(args.dicom_dir, args.series)
    tags = metadata(files)
    source_dims = voxel_dimensions(image, tags)
    worst_source_voxel = max(source_dims)
    if worst_source_voxel > MAX_USABLE_VOXEL_MM:
        die(f"Refusing extraction: worst source voxel is {worst_source_voxel:.3f} mm (> 1.5 mm); "
            "partial-volume effect makes the wire geometry unusable.")

    # Crop while the image is still at source resolution, then resample only
    # the device neighbourhood.  This is both faster and materially safer on
    # 512 x 512 clinical reconstructions.
    image = crop_to_metal_roi(image, args.hu_metal)
    image = resample_isotropic(image, args.iso)
    spacing = float(image.GetSpacing()[0])
    array = sitk.GetArrayFromImage(image)
    metal_labels, component_count = significant_components(array >= args.hu_metal, args.min_component_frac)
    metal = metal_labels > 0
    if metal.sum() < 500:
        die("Metal segmentation is nearly empty; lower --hu-metal or select another series.")
    print(f"series {series_id}; volume {array.shape}; resampled spacing {spacing:.3f} mm")
    print(f"metal components retained: {component_count}")

    metal_points = points_mm(image, metal)
    s_raw, radius, theta, frame = cylindrical_coordinates(metal_points)
    if args.flip_z:
        # Flip before resolving the datum. This keeps z=0 at the proximal
        # fabric edge rather than incorrectly moving it to the scan endpoint.
        s = -s_raw
    else:
        s = s_raw
    if args.z_datum == "fabric":
        z_zero, covered_length, fabric_found = fabric_datum(
            array, image, frame, radius, s_raw, args.hu_fabric_lo, args.hu_fabric_hi,
            metal, spacing, args.fabric_metal_exclusion_mm, flip_z=args.flip_z,
        )
    else:
        z_zero, covered_length, fabric_found = float(np.percentile(s, 0.5)), None, False
    s = s - z_zero

    theta_ref, theta_source = 0.0, "none"
    marker = array >= args.hu_marker
    if args.theta_ref == "auto" and marker.sum() > 20:
        marker_points = points_mm(image, marker)
        origin, _, u, v = frame
        marker_angles = np.arctan2((marker_points - origin) @ v, (marker_points - origin) @ u)
        theta_ref = float(np.degrees(np.angle(np.mean(np.exp(1j * marker_angles)))) % 360)
        theta_source = "radiopaque_marker_centroid"
    elif args.theta_ref not in {"auto", "none"}:
        try:
            theta_ref = float(args.theta_ref) % 360
        except ValueError:
            die("--theta-ref must be auto, none, or an angle in degrees.")
        theta_source = "user"
    theta_deg = (np.degrees(theta) - theta_ref) % 360
    theta_wrapped = np.radians(np.where(theta_deg > 180, theta_deg - 360, theta_deg))

    point_labels = metal_labels[metal]
    rings: list[dict[str, Any]] = []
    for component in range(1, component_count + 1):
        selected = point_labels == component
        if selected.sum() < 200:
            continue
        proximal, distal, height = detect_apices(s[selected], theta_wrapped[selected], args.apex_prominence)
        n_apices = max(len(proximal), len(distal))
        rings.append({
            "component": component,
            "diameter_mm": round(2 * float(np.percentile(radius[selected], 90)), 3),
            "ring_height_mm": round(height, 3),
            "n_apices": n_apices,
            "phase_deg": round(apex_phase(proximal, n_apices), 2) if proximal and n_apices else None,
            "z_proximal_apices_mm": round(float(np.mean([p["z_mm"] for p in proximal])), 3) if proximal else None,
            "z_distal_apices_mm": round(float(np.mean([p["z_mm"] for p in distal])), 3) if distal else None,
            "proximal_apices": [{"theta_deg": round(p["theta_deg"], 2), "z_mm": round(p["z_mm"], 3)} for p in proximal],
            "distal_apices": [{"theta_deg": round(p["theta_deg"], 2), "z_mm": round(p["z_mm"], 3)} for p in distal],
        })
    rings.sort(key=lambda ring: ring["z_proximal_apices_mm"] if ring["z_proximal_apices_mm"] is not None else math.inf)
    for index, ring in enumerate(rings):
        ring["index"] = index
    gaps = [round(b["z_proximal_apices_mm"] - a["z_distal_apices_mm"], 3)
            for a, b in zip(rings, rings[1:])
            if a["z_distal_apices_mm"] is not None and b["z_proximal_apices_mm"] is not None]
    z_profile, d_profile = profile(s, radius)

    descriptor = {
        "schema": "pmegplan.device-geometry/1",
        "device": args.device,
        "size": args.size,
        "state": "free_unconstrained",
        "geometry": {
            "shape": args.graft_shape,
            "scan_orientation": "inverted_corrected" if args.flip_z else "standard",
            "proximal_fixation": {
                "ring_count": args.proximal_fixation_rings,
                "position": "above_fabric" if args.proximal_fixation_rings else "none",
            },
        },
        "provenance": {
            "source": "bench_ct",
            "series_description": tags["series_description"],
            "kernel": tags["kernel"],
            "kvp": int(float(tags["kvp"])) if number(tags["kvp"]) is not None else None,
            "scan_date": iso_date(tags["scan_date"]),
            "isotropic_spacing_mm": round(spacing, 4),
            "hu_metal_threshold": args.hu_metal,
            "hu_marker_threshold": args.hu_marker,
        },
        "datum": {
            "z_zero": args.z_datum,
            "z_direction": "distal_positive",
            "theta_zero_deg_in_scan_frame": round(theta_ref, 2),
            "theta_zero_source": theta_source,
        },
        "covered_length_mm": round(covered_length, 2) if covered_length is not None else None,
        "total_metal_length_mm": round(float(s.max() - s.min()), 2),
        "diameter_profile": [{"z": round(float(z), 2), "d": round(float(d), 2)} for z, d in zip(z_profile, d_profile)],
        "rings": rings,
        "inter_ring_gaps_mm": gaps,
        "uncertainty": {
            "apex_localisation_mm": round(worst_source_voxel, 3),
            "apex_phase_reliable": worst_source_voxel <= PHASE_RELIABLE_VOXEL_MM,
            "note": "propagate apex_localisation_mm into strut clearance as a band",
        },
    }
    # The CT reliably supplies metal paths and diameter. The fabric edge and
    # hooks are device-topology annotations, so only emit them when the user
    # provides an explicit calibrated fabric edge / barb length.
    if args.fabric_proximal_edge_z is not None or args.barb_length_mm > 0:
        descriptor["rendering"] = {
            "fabric_proximal_edge_z_mm": round(
                args.fabric_proximal_edge_z if args.fabric_proximal_edge_z is not None else 0.0,
                3,
            ),
            "proximal_bare_ring_indices": list(range(args.proximal_fixation_rings)),
        }
        if args.barb_length_mm > 0:
            descriptor["rendering"]["barb_length_mm"] = round(args.barb_length_mm, 3)
        if covered_length is not None:
            descriptor["rendering"]["fabric_distal_edge_z_mm"] = round(covered_length, 3)
    basename = f"{output_name(args.device)}_{output_name(args.size)}"
    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path, png_path = output_dir / f"{basename}.json", output_dir / f"{basename}_qc.png"
    json_path.write_text(json.dumps(descriptor, indent=2) + "\n", encoding="utf-8")
    qc_image(png_path, theta_deg, s, z_profile, d_profile, rings)
    print(f"rings detected: {len(rings)}")
    print(f"descriptor: {json_path}")
    print(f"QC image: {png_path}")
    if not fabric_found and args.z_datum == "fabric":
        print("warning: fabric was not reliably segmented; fabric datum uses the proximal metal extent.", file=sys.stderr)
    # A covered length that matches the metal span is the signature of the
    # window having found something that spans the device rather than the fabric
    # — the metal's own halo, or a container tube running past both ends. Real
    # fabric stops short of a proximal bare ring, so on a device that has one
    # the two lengths should differ by about a ring height.
    if covered_length is not None and abs(covered_length - float(s.max() - s.min())) < 2.0:
        print("warning: covered length is within 2 mm of the total metal span; the fabric "
              "window has probably found metal halo or a container wall rather than textile. "
              "Treat the fabric edges as annotations until this is resolved.", file=sys.stderr)
    if worst_source_voxel > PHASE_RELIABLE_VOXEL_MM:
        print("warning: apex phase is marked unreliable at this source voxel size.", file=sys.stderr)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = root.add_subparsers(dest="command", required=True)
    audit = commands.add_parser("audit", help="report DICOM metadata and geometric reliability")
    audit.add_argument("dicom_dir")
    audit.set_defaults(handler=cmd_audit)
    extract = commands.add_parser("extract", help="extract ring geometry and generate QC PNG")
    extract.add_argument("dicom_dir")
    extract.add_argument("--device", required=True)
    extract.add_argument("--size", required=True)
    extract.add_argument("--out", required=True)
    extract.add_argument("--series", help="DICOM SeriesInstanceUID; defaults to the most-sliced series")
    extract.add_argument("--iso", type=float, default=0.0, help="isotropic resampling spacing in mm; default is source minimum")
    extract.add_argument("--hu-metal", type=float, default=HU_METAL_DEFAULT)
    extract.add_argument("--hu-marker", type=float, default=HU_MARKER_DEFAULT)
    extract.add_argument("--hu-fabric-lo", type=float, default=HU_FABRIC_LO_DEFAULT)
    extract.add_argument("--hu-fabric-hi", type=float, default=HU_FABRIC_HI_DEFAULT)
    extract.add_argument("--fabric-metal-exclusion-mm", type=float, default=0.9,
                         help="dilate the metal mask by this much and exclude it before "
                              "looking for fabric, so the search cannot return the "
                              "partial-volume halo around each strut")
    extract.add_argument("--apex-prominence", type=float, default=0.5, help="peak sensitivity as a fraction of ring height")
    extract.add_argument("--min-component-frac", type=float, default=0.1, help="minimum ring size as a fraction of largest component")
    extract.add_argument("--theta-ref", default="auto", help="auto, none, or an angle in degrees")
    extract.add_argument("--z-datum", choices=("fabric", "metal"), default="fabric")
    extract.add_argument("--flip-z", action="store_true", help="flip the axial direction when proximal is at high z")
    extract.add_argument("--graft-shape", choices=("cylindrical", "conical"), default="cylindrical",
                         help="free-state graft shape for downstream rendering metadata")
    extract.add_argument("--proximal-fixation-rings", type=int, default=0,
                         help="number of bare fixation ring components above the proximal fabric edge")
    extract.add_argument("--fabric-proximal-edge-z", type=float,
                         help="calibrated proximal fabric edge in output z mm; required to render bare fixation separately")
    extract.add_argument("--barb-length-mm", type=float, default=0.0,
                         help="topology-annotated barb length for 3-D display; not measured from CT")
    extract.set_defaults(handler=cmd_extract)
    return root


def main() -> None:
    args = parser().parse_args()
    if getattr(args, "iso", 0.0) < 0:
        die("--iso cannot be negative.")
    if getattr(args, "proximal_fixation_rings", 0) < 0:
        die("--proximal-fixation-rings cannot be negative.")
    if getattr(args, "barb_length_mm", 0.0) < 0:
        die("--barb-length-mm cannot be negative.")
    if getattr(args, "fabric_metal_exclusion_mm", 0.0) < 0:
        die("--fabric-metal-exclusion-mm cannot be negative.")
    args.handler(args)


if __name__ == "__main__":
    main()
