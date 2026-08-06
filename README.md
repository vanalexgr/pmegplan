# PMEGplan

A planner for physician-modified endografts, in which the strut geometry comes
from **bench CT of actual endografts** rather than from a catalogue drawing.

The surgeon enters the anatomy — the splanchnic chain as centreline gaps, ostium
diameters and clock positions — and the planner finds where the hole pattern can
sit on a scanned device's measured stent lattice. Because the anatomy fixes the
holes relative to each other, only two things are free: how far the pattern is
pushed in, and how far the graft is turned. Both apply to every hole at once.

> **Prototype, not a medical device.** Three scanned devices demonstrate the
> method rather than covering the range a real library would need. Nothing here
> is clinically validated: no bench cutting, no imaging of a modified device
> against its plan, no clinical series. The clearance figures are geometric
> predictions from a free-state scan.

Live: <https://pmegplan.vercel.app>

## Documentation

| Document | What it covers |
|---|---|
| [docs/METHODS.md](docs/METHODS.md) | How it works: extraction pipeline, wire map, planning model, solver, outputs, limitations. The primary reference, written to be usable as source material for a methods section. |
| [docs/DEVICE-SELECTION.md](docs/DEVICE-SELECTION.md) | The argument that a scanned library automates *which device to implant*, not only where to cut the one already chosen. |
| [docs/IN-SILICO-STUDY.md](docs/IN-SILICO-STUDY.md) | A study design publishable with the devices currently scanned, with pilot results. |
| [docs/RELATED-WORK.md](docs/RELATED-WORK.md) | EndoDraft (Juhos et al., JEVT 2026) — the closest published comparator, and how the two tools differ. |

## What is measured and what is not

This distinction is load-bearing and is kept explicit throughout the code and
the UI. In short: the **wire map** and **ring diameters** are measured; the
**fabric edge** is measured on two of the three devices and annotated on the
third; **nominal sizes** are inferred from measurement and not read off
packaging; **barbs** are not drawn at all, because the segmentation resolves no
metal past the fixation ring's own apices. See METHODS §5 and §9.2.

Two frames coexist, and confusing them is the most common way to get a wrong
answer here (METHODS §6.4):

- the **reference frame** at the proximal circumference, where the strut map and
  the clearance raster live — the only frame in which holes and struts share a
  ruler;
- each opening's **local frame** at its own depth, which is what a tape laid
  round the graft there would read.

Angles are preserved between them. Millimetres are not.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

```bash
npm test
```

209 tests. `lib/__tests__/geometryMatrix.test.ts` runs the configuration matrix
— four fenestrations; three with the coeliac preserved; two renals with the SMA
scalloped; three with the coeliac scalloped — against all three scans, and is
the place to add a case when the planning model changes.

## Layout

```
app/                        Next.js App Router entry
components/                 flat view, 3-D view, punch card, planner
lib/planning/               anatomy model, clearance field, pose solver, pipeline
lib/geometry/               bench-CT render model: ring profile, apices, fabric extent
lib/__tests__/              unit tests
library/*.json              per-device descriptors including the wire map
tools/extract_wire_map.py   wire map extraction and datum fitting (Python)
docs/                       see above
```

## Data handling

Raw bench-CT DICOM series and the clinical plan sheets used for reference are
**not in this repository and must not be committed**. The tracked artefacts are
the derived per-device descriptors in `library/`, which contain device geometry
only. Reference cases are identified as C001/C002/C003 in code, commits and
documentation.

## Stack

Next.js 16 App Router, React 19, TypeScript, Tailwind 4, vitest. Geometry
extraction in Python (SimpleITK, NumPy, SciPy). Deployed on Vercel.

Note that this project pins a Next.js version whose APIs and conventions differ
from what is widely documented — see [AGENTS.md](AGENTS.md).
