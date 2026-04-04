# PMEGplan.io — Codex Implementation Guide

> **Scope:** Architectural hardening and UX improvements only.
> Clinical model (devices, fenestration types, IFU checks) is out of scope for this sprint.
>
> **Read before starting:**
> - `AGENTS.md` / `CLAUDE.md` — Next.js version conventions
> - `lib/types.ts` — canonical type definitions
> - `lib/conflictDetection.ts`, `lib/rotationOptimizer.ts` — pure core logic
> - `store/plannerStore.ts` — Zustand store with undo/redo
> - `public/workers/rotationWorker.js` — the worker to be migrated

Work through tasks **in the order listed**. Each task is self-contained and its
acceptance criteria must pass before moving on.

---

## TASK 1 — Delete the dead PDF API endpoint

**Priority:** High · **Effort:** Trivial

### What to do
Delete the file `app/api/generate-pdf/route.ts`. It returns HTTP 501 with a
comment explaining it is not implemented and never will be (PDF export is fully
handled client-side by `lib/pdfExport.ts`). Dead stubs mislead future agents
and confuse TypeScript path resolution.

### Steps
1. Delete `app/api/generate-pdf/route.ts`.
2. Delete the now-empty directory `app/api/generate-pdf/`.
3. Search the entire codebase for any `fetch('/api/generate-pdf')` or
   `/api/generate-pdf` string reference and remove or replace them. (There are
   none in the current codebase, but verify.)

### Acceptance criteria
- The file and directory no longer exist.
- `npm run build` completes without error.
- `npm run lint` passes.

---

## TASK 2 — Migrate the rotation worker to TypeScript

**Priority:** High · **Effort:** Medium

### Problem
`public/workers/rotationWorker.js` is plain JavaScript and is explicitly
excluded from `tsconfig.json` (`"exclude": [..., "public/workers", ...]`).
Any type change in `lib/types.ts` affecting the types the worker uses
(`Fenestration`, `StrutSegment`, `RotationResult`) silently breaks the worker
with no compile-time error.

### What to do

#### 2a — Create the typed worker source

Create `lib/workers/rotationWorker.ts`:

```ts
/// <reference lib="webworker" />

import { optimiseRotation } from "@/lib/rotationOptimizer";
import type { Fenestration, StrutSegment } from "@/lib/types";

export interface RotationWorkerRequest {
  fenestrations: Fenestration[];
  segs: StrutSegment[];
  circ: number;
  wireRadius: number;
  stepMm?: number;
}

self.onmessage = (event: MessageEvent<RotationWorkerRequest>) => {
  const { fenestrations, segs, circ, wireRadius, stepMm } = event.data;
  const result = optimiseRotation(fenestrations, segs, circ, wireRadius, stepMm);
  self.postMessage(result);
};
```

#### 2b — Configure Next.js to bundle the worker

In `next.config.ts`, add webpack worker support:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.module.rules.push({
      test: /lib\/workers\/.*\.ts$/,
      use: [{ loader: "worker-loader", options: { inline: "no-fallback" } }],
    });
    return config;
  },
};

export default nextConfig;
```

If `worker-loader` is not available, use the Next.js built-in pattern instead:
instantiate via `new Worker(new URL("../../lib/workers/rotationWorker.ts", import.meta.url))`.
This is the preferred approach for Next.js 14+.

Search for the current worker instantiation pattern in `PlannerClient.tsx` and
`PlanningWorkspace.tsx` and update all call sites to use the new URL pattern.
The message shape (`RotationWorkerRequest`) must be used at every `worker.postMessage()` call.

#### 2c — Update tsconfig.json

Remove `"public/workers"` from the `exclude` array in `tsconfig.json`.
Delete `public/workers/rotationWorker.js` (the old plain-JS file).

#### 2d — Verify the worker still receives typed results

Wherever `worker.onmessage` is handled, import `RotationResult` from
`@/lib/types` and type the event as `MessageEvent<RotationResult>`.

### Acceptance criteria
- `npm run build` and `npm run lint` pass with zero type errors related to the worker.
- `public/workers/rotationWorker.js` no longer exists.
- `lib/workers/rotationWorker.ts` exists and imports from `@/lib/rotationOptimizer` and `@/lib/types`.
- All `worker.postMessage()` call sites pass a `RotationWorkerRequest`-shaped object.
- All `worker.onmessage` handlers type the event as `MessageEvent<RotationResult>`.

---

## TASK 3 — Replace JSON.stringify snapshot comparison in plannerStore

**Priority:** High · **Effort:** Small

### Problem
In `store/plannerStore.ts`, the `bootstrap` action uses:

```ts
const snapshotKey = JSON.stringify({ caseInput, selectedDeviceIds, projectId });
// ...
const currentKey = JSON.stringify({ caseInput: current.caseInput, ... });
if (currentKey !== snapshotKey) { return current; }
```

`JSON.stringify` on the full `caseInput` object allocates a potentially large
string on every set() callback invocation during the bootstrap loop. It is also
order-dependent: two structurally equal objects with different key insertion
order will produce different strings. The real equality check only needs to
compare three fields that change when a user edits the form.

### What to do

Create a deterministic hash function in `lib/planning/index.ts` (or a new
`lib/planning/hash.ts`):

```ts
import { FNV_32A_PRIME, FNV_32A_OFFSET } from constants or inline them.

/** Deterministic FNV-1a hash of a serialisable value. Key order independent. */
export function hashSnapshot(caseInput: CaseInput, selectedDeviceIds: string[], projectId: string): number {
  // Normalise: sort selectedDeviceIds, sort fenestration fields consistently
  const payload = {
    neckDiameterMm: caseInput.neckDiameterMm,
    fenestrations: [...caseInput.fenestrations].map(f => ({
      vessel: f.vessel,
      ftype: f.ftype,
      clock: f.clock,
      depthMm: f.depthMm,
      widthMm: f.widthMm,
      heightMm: f.heightMm,
    })),
    deviceIds: [...selectedDeviceIds].sort(),
    projectId,
  };
  // Use the existing FNV-1a pattern already in lib/planning/project.ts
  const str = JSON.stringify(payload);  // single alloc, normalised structure
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
```

Then in `plannerStore.ts`, replace every occurrence of the `JSON.stringify`
key construction with a `hashSnapshot(...)` call returning a `number`.
Compare numbers with `===` instead of strings.

Note: `lib/planning/project.ts` already has an identical FNV-1a implementation
in `hashString`. Extract it to a shared utility so both files use the same code.

### Acceptance criteria
- No `JSON.stringify` call inside `plannerStore.ts` used for equality comparison.
- `hashSnapshot` is exported from `lib/planning/` and has a corresponding unit test (see Task 5).
- Bootstrap guard still prevents stale results from overwriting a newer state when the user edits the form mid-analysis.
- `npm run build` and `npm run lint` pass.

---

## TASK 4 — Refactor graftSketchRenderer.ts: extract ScaleContext

**Priority:** Medium · **Effort:** Medium

### Problem
`lib/graftSketchRenderer.ts` contains ~60 inline ternary expressions of the
form `p ? 20 : 13` (print vs preview scale). This makes the file very hard to
read, review, and extend. A single `ScaleContext` object computed once from
`mode` should replace all of them.

### What to do

#### 4a — Define ScaleContext

At the top of `lib/graftSketchRenderer.ts`, before any drawing code, add:

```ts
interface ScaleContext {
  /** True when rendering for print (300 dpi A4). */
  isPrint: boolean;
  /** Font size: main header */
  fontHeader: number;
  /** Font size: sub-header / specs */
  fontSub: number;
  /** Font size: vessel label */
  fontVessel: number;
  /** Font size: back-face label */
  fontBack: number;
  /** Font size: footer */
  fontFooter: number;
  /** Standard line height between spec rows */
  lineH: number;
  /** Canvas margin (px) */
  margin: number;
  /** Header area height (px) */
  headerH: number;
  /** Footer area height (px) */
  footerH: number;
  /** Stroke weight: guide ellipse */
  strokeGuide: number;
  /** Stroke weight: core ellipse */
  strokeCore: number;
  /** Crosshair arm length multiplier */
  crosshairScale: number;
  /** Halo expansion (px) */
  haloExpand: number;
  /** "A" badge font size */
  fontBadge: number;
}

function buildScaleContext(mode: "preview" | "print"): ScaleContext {
  const p = mode === "print";
  return {
    isPrint:        p,
    fontHeader:     p ? 20  : 13,
    fontSub:        p ? 12  : 9,
    fontVessel:     p ? 10  : 7.5,
    fontBack:       p ? 8.5 : 6.5,
    fontFooter:     p ? 9   : 8,
    lineH:          p ? 15  : 11,
    margin:         p ? 24  : 20,
    headerH:        p ? 54  : 44,
    footerH:        p ? 42  : 36,
    strokeGuide:    p ? 1.4 : 1.05,
    strokeCore:     p ? 2.2 : 1.8,
    crosshairScale: p ? 1.0 : 0.75,
    haloExpand:     p ? 4.5 : 3.6,
    fontBadge:      p ? 14  : 10,
  };
}
```

#### 4b — Thread ScaleContext through sub-functions

Each internal drawing function that currently takes `p: boolean` or uses inline
ternaries should be refactored to accept `sc: ScaleContext` instead. Replace
every `p ? X : Y` with `sc.propertyName`. The public API surface
(`GraftSketchOptions` / `renderGraftSketch`) does not change.

#### 4c — Apply the same pattern to punchCardRenderer.ts

`lib/punchCardRenderer.ts` has the same problem. Define a matching
`PunchCardScaleContext` and replace its inline ternaries by the same approach.
The two ScaleContext types can share a common base if the properties overlap.

### Acceptance criteria
- No inline `p ? ... : ...` ternary expressions remain in either renderer file.
- All extracted constants are in `ScaleContext` / `PunchCardScaleContext`.
- `npm run build` passes.
- The rendered output (visually) is unchanged — verify against the sample case.

---

## TASK 5 — Add unit tests

**Priority:** High · **Effort:** Medium

### Setup
Install Vitest (preferred for Next.js / Vite-compatible projects):

```bash
npm install -D vitest @vitest/coverage-v8
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

### 5a — conflictDetection.test.ts

Create `lib/__tests__/conflictDetection.test.ts`.

Test cases to cover:

1. **No conflict at centre of open gap** — given a single strut segment far from
   any fenestration arc position, `checkConflict` should return
   `{ conflicted: false }`.
2. **Conflict when fenestration overlaps strut** — place a fenestration arc-mm
   directly on a strut segment x-coordinate, `checkConflict` should return
   `{ conflicted: true }`.
3. **Wrap-around is handled** — a fenestration at arc ~0 mm with a strut near
   the circumference should correctly detect conflict after wrapping.
4. **Scallops are excluded from round-fenestration conflict checks** — a SCALLOP
   type fenestration should not conflict with struts below the proximal edge.
5. **minDistToStruts returns positive distance for clear positions.**

Use the geometry from `lib/sampleCase.ts` and `lib/stentGeometry.ts` to
generate realistic `StrutSegment[]` arrays for tests.

### 5b — rotationOptimizer.test.ts

Create `lib/__tests__/rotationOptimizer.test.ts`.

Test cases to cover:

1. **All-scallop case returns a trivially valid result** — if
   `fenestrations` contains only SCALLOPs, `optimiseRotation` should return
   `{ hasConflictFreeRotation: true, validWindows: [full circumference] }`.
2. **sampleCase (two renal arteries at 9:00 / 3:00) finds a conflict-free window**
   for at least one of the four current devices. Use `buildStrutSegments` from
   `lib/stentGeometry.ts` with the corresponding device geometry.
3. **Optimal delta is within [0, circ)**  — the returned `optimalDeltaMm` must
   satisfy `0 <= optimalDeltaMm < circ`.
4. **scanData length is deterministic** — for a given circumference and step,
   the number of scan points equals `Math.ceil(circ / step) + 1`.
5. **Valid windows are non-overlapping and sorted** — assert that
   `validWindows[i].endMm <= validWindows[i+1].startMm` for all `i`.

### 5c — recommendation.test.ts

Create `lib/__tests__/recommendation.test.ts`.

Test cases to cover:

1. **Empty results returns "No fit"** — `buildDeviceRecommendationSummary([])`
   returns `{ confidenceLabel: "No fit", top: null }`.
2. **Conflict-free result ranks above compromise result** — given two mock
   `DeviceAnalysisResult` objects where one has
   `rotation.hasConflictFreeRotation: true` and the other `false`, the
   conflict-free result appears first in `compatibleResults`.
3. **summarizeAlternative returns non-empty string** for every comparison
   combination (both conflict-free, one not, etc.).

### 5d — hashSnapshot.test.ts

Once Task 3 is complete, create `lib/__tests__/hashSnapshot.test.ts`:

1. **Same inputs → same hash** (determinism).
2. **Different neckDiameterMm → different hash**.
3. **Different fenestration clock → different hash**.
4. **selectedDeviceIds order-independence** — `["a","b"]` and `["b","a"]`
   produce the same hash.
5. **projectId change → different hash**.

### Acceptance criteria
- `npm run test` passes with zero failures.
- Coverage for `lib/conflictDetection.ts`, `lib/rotationOptimizer.ts`,
  and `lib/recommendation.ts` is ≥ 80% line coverage.
- Tests run in under 10 seconds on a cold start.

---

## TASK 6 — Live conflict feedback in AnatomyForm

**Priority:** Medium · **Effort:** Medium

### Problem
The user submits the full form (`onSubmit`) before seeing any conflict analysis.
`conflictDetection.ts` is a fast synchronous computation — for a 2–4 fenestration
case it runs in < 2 ms. It should run on every form change, giving the user
immediate red/green feedback per fenestration before they submit.

### What to do

#### 6a — Create a useLiveConflict hook

Create `lib/hooks/useLiveConflict.ts`:

```ts
import { useEffect, useState, useDeferredValue } from "react";
import { buildStrutSegments, getSealZoneHeightMm } from "@/lib/stentGeometry";
import { checkConflict } from "@/lib/conflictDetection";
import { selectSize, getNPeaks } from "@/lib/devices";
import { circumferenceMm } from "@/lib/planning/geometry";
import type { CaseInput, FenestrationConflict } from "@/lib/types";

export interface LiveConflictResult {
  /** Index matches caseInput.fenestrations */
  perFenestration: FenestrationConflict[];
  anyConflict: boolean;
}

/**
 * Runs conflict detection synchronously on every caseInput change, for the
 * first compatible device in the provided list.
 * Returns null until the first result is available.
 */
export function useLiveConflict(
  caseInput: CaseInput,
  selectedDeviceIds: string[],
): LiveConflictResult | null {
  const deferred = useDeferredValue(caseInput);
  const [result, setResult] = useState<LiveConflictResult | null>(null);

  useEffect(() => {
    const deviceId = selectedDeviceIds[0];
    if (!deviceId) return;

    // Import getDeviceById inline to avoid circular deps
    const { getDeviceById } = require("@/lib/devices") as typeof import("@/lib/devices");
    const device = getDeviceById(deviceId);
    if (!device) return;

    const size = selectSize(device, deferred.neckDiameterMm);
    if (!size) return;

    const nPeaks = getNPeaks(device, size.graftDiameter);
    const sealH  = getSealZoneHeightMm(device, nPeaks);
    const segs   = buildStrutSegments(device, size.graftDiameter, nPeaks, sealH);
    const circ   = circumferenceMm(size.graftDiameter);

    const perFenestration = deferred.fenestrations.map((fen) =>
      checkConflict(fen, segs, circ, device.wireRadiusMm, 0),
    );

    setResult({
      perFenestration,
      anyConflict: perFenestration.some((r) => r.conflicted),
    });
  }, [deferred, selectedDeviceIds]);

  return result;
}
```

#### 6b — Wire into AnatomyForm

In `components/AnatomyForm.tsx`:
- Call `useLiveConflict(watchedValues, selectedDeviceIds)` using the `useWatch`
  return value already available in the component.
- For each fenestration row in the `useFieldArray` render, look up the matching
  `liveConflict.perFenestration[index]` result.
- Render a small coloured dot or badge beside the clock/depth inputs:
  - Red dot with text "Strut conflict" when `conflicted === true`.
  - Green dot with text "Clear" when result is available and `conflicted === false`.
  - No indicator (or grey spinner icon) while `result === null`.

Do not gate the Submit button on live conflict — the user must always be able
to submit. The live indicators are informational only.

#### 6c — Add a CSS class, not inline styles

Define `.conflict-indicator-clear` and `.conflict-indicator-conflict` in
`app/globals.css` using the existing CSS variable palette (`--brand`,
`--foreground`). Use these classes in the component rather than inline styles.

### Acceptance criteria
- Changing a clock position in the form updates the conflict indicator within
  one render cycle (no perceptible lag for a 4-fenestration case).
- The Submit button is never disabled by live conflict state.
- Live indicators are absent when `selectedDeviceIds` is empty or the device
  has no size match for the current neck diameter.
- `npm run build` and `npm run lint` pass.

---

## TASK 7 — Side-by-side punch card comparison view

**Priority:** Medium · **Effort:** Medium–Large

### Problem
The planning workspace shows one punch card at a time. During device selection,
the surgeon needs to compare up to four punch cards simultaneously to see how
different strut patterns interact with the planned fenestrations.

### What to do

#### 7a — Create ComparisonGrid component

Create `components/ComparisonGrid.tsx`:

```tsx
"use client";

import { useRef, useEffect } from "react";
import { renderPunchCard } from "@/lib/punchCardRenderer";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

interface ComparisonGridProps {
  results: DeviceAnalysisResult[];
  caseInput: CaseInput;
}

/**
 * Renders up to 4 punch cards side-by-side in a responsive grid.
 * Each card is a canvas sized to 600×424 px (preview resolution).
 */
export function ComparisonGrid({ results, caseInput }: ComparisonGridProps) {
  const available = results.filter((r) => r.size);
  // ... render a CSS grid of canvases
  // Each canvas calls renderPunchCard in a useEffect when result or caseInput changes
}
```

- Use `display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` so it adapts from 1-up (mobile) to 4-up (desktop).
- Each canvas renders at `600 × 424` (matching the existing preview resolution).
- Show the device short name above each canvas in a heading element.
- Highlight the top-ranked card with the brand border colour.
- If `result.size` is null, show the `result.unsupportedReason` string in a
  placeholder card instead of a canvas.

#### 7b — Add to PlannerClient as a collapsible section

In `components/PlannerClient.tsx`, after the `RecommendationOverview` section
and before the ranked `DeviceCard` list, add:

```tsx
<details open>
  <summary className="...">
    <h2>Side-by-side comparison</h2>
  </summary>
  <ComparisonGrid results={results} caseInput={caseInput} />
</details>
```

Use the existing `<details>` / `<summary>` pattern if there is one, or style
this consistently with the rest of the page. Default to open (`open` attribute)
so the grid is visible immediately.

#### 7c — Performance guard

Each canvas render is O(struts × fenestrations). For four devices this is
still < 10 ms total. However, wrap each canvas in a `React.memo` to avoid
re-rendering when `results` reference is stable. The `renderPunchCard` call
must happen inside a `useEffect` with `[result, caseInput]` deps.

### Acceptance criteria
- With four compatible devices, four punch cards render side-by-side (or stacked
  on narrow viewports).
- Each card re-renders when `caseInput` changes.
- Cards for unsupported sizes show a text placeholder, not a broken canvas.
- `npm run build` and `npm run lint` pass.

---

## TASK 8 — URL-serialised case share link

**Priority:** Low–Medium · **Effort:** Small

### Problem
Sharing a plan currently requires exchanging `.json` project files. A URL
containing the full case state allows sharing via any messaging channel and
enables bookmarking for follow-up review.

### What to do

#### 8a — Serialisation helpers

Add to `lib/planning/persistence.ts`:

```ts
/**
 * Encode a SavedPlannerProject into a URL-safe base64 string.
 * Uses JSON → UTF-8 → base64url (no padding).
 */
export function encodePlannerProjectToUrl(project: SavedPlannerProject): string {
  const json = JSON.stringify(project);
  // btoa is available in browser; use Buffer in Node (for tests)
  const b64 = typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Decode a URL-safe base64 string back to a SavedPlannerProject.
 * Throws if the payload fails Zod validation.
 */
export function decodePlannerProjectFromUrl(encoded: string): SavedPlannerProject {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const json = typeof atob !== "undefined"
    ? decodeURIComponent(escape(atob(b64)))
    : Buffer.from(b64, "base64").toString("utf8");
  return parseSavedPlannerProject(json);
}
```

#### 8b — Share button in PlanningWorkspace

In `components/PlanningWorkspace.tsx`, add a "Copy share link" button in the
toolbar area (alongside the existing Save/Load buttons). When clicked:

```ts
const url = new URL(window.location.href);
url.pathname = "/planner";
url.search   = "";
const encoded = encodePlannerProjectToUrl(createSavedPlannerProject({
  project: planningProject,
  caseInput,
  selectedDeviceIds,
}));
url.searchParams.set("p", encoded);
navigator.clipboard.writeText(url.toString());
// Show brief "Copied!" toast (see 8c)
```

#### 8c — Toast feedback

Implement a minimal toast using React state — no external library required:

```tsx
const [copied, setCopied] = useState(false);
// On click: setCopied(true); setTimeout(() => setCopied(false), 2000);
// Render: {copied && <span className="...">Copied!</span>}
```

#### 8d — Auto-load from URL on mount

In `components/PlannerClient.tsx`, add a `useEffect` that runs once on mount:

```ts
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("p");
  if (!encoded) return;
  try {
    const project = decodePlannerProjectFromUrl(encoded);
    loadSavedProject(project);
    // Clean the URL so a refresh does not reload stale state
    window.history.replaceState(null, "", "/planner");
  } catch {
    // Silently ignore malformed or expired share links
  }
}, []);  // loadSavedProject is stable (Zustand action)
```

#### 8e — Size guard

Before writing to the URL, check encoded length:

```ts
if (encoded.length > 8000) {
  // URL would exceed browser limits for complex cases
  // Fall back to the existing JSON download flow
  alert("Case is too large for a share link — please use the JSON export instead.");
  return;
}
```

A typical 4-fenestration case encodes to ~400–600 characters, well within
browser URL length limits.

### Acceptance criteria
- Clicking "Copy share link" writes a valid URL to the clipboard.
- Opening that URL in a new tab loads the exact case (same fenestrations, same
  selected devices, same projectId).
- After loading from URL, the `?p=` parameter is removed from the address bar.
- Encoded length > 8000 characters shows the fallback alert and does not write
  to clipboard.
- `encodePlannerProjectToUrl` / `decodePlannerProjectFromUrl` round-trip is
  covered by a unit test (add to Task 5 test files).
- `npm run build` and `npm run lint` pass.

---

## General constraints for all tasks

- **TypeScript strict mode is on.** Every new file must satisfy `strict: true`.
  Do not use `any` or non-null assertions (`!`) without a comment explaining why.
- **No new runtime dependencies** unless specified. Existing stack:
  `zustand`, `zod`, `react-hook-form`, `jspdf`, `jszip`, `recharts`,
  `lucide-react`, `tailwind-merge`, `clsx`.
- **Styling:** Use the existing CSS variable palette (`--brand`, `--foreground`,
  `--muted-foreground`, `--border`, `--surface-strong`) and Tailwind utilities.
  Do not introduce arbitrary hex colours.
- **No changes to `lib/devices.ts`** or any clinical computation logic (devices,
  stent geometry, conflict thresholds). Clinical model is frozen for this sprint.
- After each task, run `npm run lint` and `npm run build` and fix all errors
  before starting the next task.
- Commit each task separately with a conventional commit message:
  `fix:`, `refactor:`, `feat:`, `test:` as appropriate.

---

## Suggested task order for minimal merge conflicts

```
Task 1 (delete dead file)
Task 3 (hash fix — pure lib change, no component touch)
Task 5 (tests — read-only, no production code changes)
Task 2 (worker migration — isolated to lib/workers + next.config.ts)
Task 4 (ScaleContext — touches only the two renderer files)
Task 8 (share link — touches persistence.ts + PlanningWorkspace + PlannerClient)
Task 6 (live conflict — touches AnatomyForm + adds hook)
Task 7 (comparison grid — new component + PlannerClient section)
```

Tasks 6 and 7 both touch `PlannerClient.tsx` — do them in sequence, not in
parallel, and resolve any merge conflicts before moving on.
