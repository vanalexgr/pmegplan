# Bench-CT device geometry library

`Endograft-*_scan*.json` files are measured free-state descriptors produced by
`../endograft_geometry.py`, with a wire map added by
`../tools/extract_wire_map.py`. Their companion `_qc.png` plots are the
acceptance record: red markers are proximal apices and blue markers are distal
apices.

These are **derived artefacts** and are regenerated, not edited — with one
exception that is worth knowing about. Each `rendering` block is hand-annotated
(fabric edges, bare-ring indices, `anatomical_proximal_z`), and the extractor
overwrites the whole file, so re-running it drops those annotations *and* the
wire map. Reinstate them after any regeneration.

Regenerated 2026-08-07 to correct a θ reflection that had mirrored scan2 and
scan3; figures computed against the previous maps are void. See METHODS §4.3
and §9.7.

The application exposes these files through `BENCH_CT_DEVICE_LIBRARY` in
`lib/devices.ts`. They remain separate from `ALL_DEVICES` because a bench CT
does not supply the IFU sizing range, delivery profile, or clinical indication
needed by the recommendation engine. Use `buildBenchCtStrutSegments` for
exact, per-apex punch-card rendering at the scanned device size.
