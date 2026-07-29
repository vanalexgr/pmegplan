# Bench-CT device geometry library

`Endograft-*_scan*.json` files are measured free-state descriptors produced by
`../endograft_geometry.py`. Their companion `_qc.png` plots are the acceptance
record: red markers are proximal apices and blue markers are distal apices.

The application exposes these files through `BENCH_CT_DEVICE_LIBRARY` in
`lib/devices.ts`. They remain separate from `ALL_DEVICES` because a bench CT
does not supply the IFU sizing range, delivery profile, or clinical indication
needed by the recommendation engine. Use `buildBenchCtStrutSegments` for
exact, per-apex punch-card rendering at the scanned device size.
